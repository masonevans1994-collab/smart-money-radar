"""U.S. House stock trades from Periodic Transaction Reports (PTRs).

The House Clerk publishes a yearly zip with an XML index of every
disclosure. PTRs (FilingType "P") link to a PDF per filing. Electronically
filed PDFs contain text we can parse; scanned paper filings do not and are
reported as "needs review" with a link instead.

Senate PTRs live on efdsearch.senate.gov, which requires an interactive
terms-of-use session; adding it is a listed next step in the README.
"""

from __future__ import annotations

import datetime as dt
import io
import re
import xml.etree.ElementTree as ET
import zipfile

HOUSE_ZIP = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
HOUSE_PTR_PDF = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf"


# ---------- index ----------

def _parse_us_date(s: str | None) -> dt.date | None:
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    return None


def parse_house_index(xml_text: str | bytes) -> list[dict]:
    """Return PTR filings from the House {year}FD.xml index."""
    root = ET.fromstring(xml_text)
    out = []
    for m in root.iter("Member"):
        get = lambda tag: (m.findtext(tag) or "").strip()
        if get("FilingType") != "P":
            continue
        name = " ".join(p for p in (get("Prefix"), get("First"), get("Last"),
                                    get("Suffix")) if p)
        year, doc_id = get("Year"), get("DocID")
        out.append({
            "member": name,
            "district": get("StateDst"),
            "filing_date": _parse_us_date(get("FilingDate")),
            "doc_id": doc_id,
            "url": HOUSE_PTR_PDF.format(year=year, doc_id=doc_id),
        })
    return out


def read_house_zip(zip_bytes: bytes, year: int) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        name = next((n for n in z.namelist() if n.lower() == f"{year}fd.xml"), None)
        if not name:
            raise ValueError(f"{year}FD.xml not found in House zip")
        return parse_house_index(z.read(name))


# ---------- PTR PDF text ----------

# E-filed rows come out of the PDF in two layouts once whitespace is
# normalised. When the asset name is short:
#   SP Apple Inc. - Common Stock (AAPL) [ST] P 01/15/2026 01/20/2026 $1,001 - $15,000
# When it wraps, the ticker (and often the top of the range) lands after:
#   SP Apple Inc. - Common Stock P 01/15/2026 01/20/2026 $1,001 - (AAPL) [ST] $15,000
_TICK = r"\((?P<{n}>[A-Z][A-Z0-9.\-]{{0,6}})\)\s*(?:\[(?P<{a}>[A-Z]{{2}})\]\s*)?"
_ROW_RE = re.compile(
    r"(?<![A-Za-z(])(?P<type>P|S \(partial\)|S|E)\s+"
    r"(?P<trade>\d{2}/\d{2}/\d{4})\s+"
    r"(?P<notified>\d{2}/\d{2}/\d{4})\s+"
    r"(?P<lo>Over \$[\d,]+|\$[\d,]+)"
    # Anything (wrapped asset name, ticker, [ST]) may sit between the halves.
    r"(?:\s*-\s*(?P<mid>[^$]{0,120}?)(?P<hi>\$[\d,]+))?"
    r"(?:\s*" + _TICK.format(n="t_end", a="a_end") + r")?"
)
# Standard STOCK Act reporting brackets: low end -> high end.
BRACKETS = {1_001: 15_000, 15_001: 50_000, 50_001: 100_000, 100_001: 250_000,
            250_001: 500_000, 500_001: 1_000_000, 1_000_001: 5_000_000,
            5_000_001: 25_000_000, 25_000_001: 50_000_000}
_LEAD_TICK_RE = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,6})\)\s*(?:\[([A-Z]{2})\])?")
_OWNER_RE = re.compile(r"(?:^|\s)(SP|DC|JT)\s+[A-Z0-9][^$]{0,160}$")

TYPE_LABEL = {"P": "Purchase", "S": "Sale", "S (partial)": "Sale (partial)",
              "E": "Exchange"}


def parse_amount(s: str) -> tuple[int, int | None]:
    nums = [int(n.replace(",", "")) for n in re.findall(r"\$([\d,]+)", s)]
    if s.strip().lower().startswith("over"):
        return nums[0], None
    if len(nums) >= 2:
        return nums[0], nums[1]
    return nums[0], nums[0]


def parse_ptr_text(text: str) -> list[dict]:
    """Extract transactions from the text of an e-filed House PTR."""
    flat = re.sub(r"\s+", " ", text.replace("\x00", " "))
    out, prev_end = [], 0
    for m in _ROW_RE.finditer(flat):
        lead = flat[prev_end:m.start()]
        prev_end = m.end()
        # Prefer a ticker that wrapped after the amount; otherwise the last
        # one in the text leading up to this row.
        mid = m.group("mid") or ""
        if "ID Owner" in mid:  # range split across a page break; ignore junk
            mid = ""
        mid_tick = _LEAD_TICK_RE.search(mid)
        mid_asset = re.search(r"\[([A-Z]{2})\]", mid)
        ticker = mid_tick.group(1) if mid_tick else m.group("t_end")
        asset = (mid_tick.group(2) if mid_tick and mid_tick.group(2) else
                 mid_asset.group(1) if mid_asset else m.group("a_end"))
        if not ticker:
            leads = _LEAD_TICK_RE.findall(lead)
            if leads:
                ticker, asset = leads[-1][0], leads[-1][1] or asset
        if not ticker:
            # Whole row fit on one line but the asset name wrapped below it:
            # take the first ticker before the next row and consume it.
            nxt = _ROW_RE.search(flat, m.end())
            ahead = _LEAD_TICK_RE.search(flat, m.end(), nxt.start() if nxt else len(flat))
            if not ahead:
                continue  # bonds, funds without tickers, etc.
            ticker, asset = ahead.group(1), ahead.group(2)
            prev_end = ahead.end()
        owner_m = _OWNER_RE.search(lead)
        amount = m.group("lo") + (f" - {m.group('hi')}" if m.group("hi") else "")
        low, high = parse_amount(amount)
        if not m.group("lo").startswith("Over") and (high is None or high <= low):
            high = BRACKETS.get(low, high if high and high > low else None)
        out.append({
            "ticker": ticker,
            "asset_type": asset or "",
            "type": TYPE_LABEL[m.group("type")],
            "trade_date": _parse_us_date(m.group("trade")),
            "notified_date": _parse_us_date(m.group("notified")),
            "amount_low": low,
            "amount_high": high,
            "owner": {"SP": "Spouse", "DC": "Dependent child",
                      "JT": "Joint"}.get(owner_m.group(1) if owner_m else "", "Self"),
        })
    return out


def pdf_to_text(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("pip install pdfplumber to parse House PDFs") from e
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


# ---------- orchestration ----------

def fetch_house_trades(fetcher, days: int = 14, max_filings: int = 60,
                       today: dt.date | None = None, log=print) -> tuple[list, list]:
    """Return (trades, filings_needing_review) for PTRs filed in the window."""
    today = today or dt.date.today()
    since = today - dt.timedelta(days=days)
    filings = []
    for year in sorted({since.year, today.year}):
        try:
            body = fetcher.get(HOUSE_ZIP.format(year=year), cache=False)
        except Exception as e:  # noqa: BLE001 - keep the run going
            log(f"  House index for {year} failed: {e}")
            body = None
        if not body:
            log(f"  House index for {year} unavailable")
            continue
        filings += read_house_zip(body, year)
    recent = sorted((f for f in filings
                     if f["filing_date"] and f["filing_date"] >= since),
                    key=lambda f: f["filing_date"], reverse=True)[:max_filings]
    log(f"  {len(recent)} House PTR filings since {since}")

    from .http import Blocked

    trades, review = [], []
    for f in recent:
        try:
            pdf = fetcher.get(f["url"])
        except Blocked:
            pdf = None
        rows = parse_ptr_text(pdf_to_text(pdf)) if pdf else []
        if not rows:
            review.append(f)  # scanned paper filing or unusual layout
            continue
        for r in rows:
            trades.append({
                "kind": "congress",
                "who": f["member"],
                "district": f["district"],
                "disclosed": f["filing_date"].isoformat(),
                "url": f["url"],
                **r,
                "trade_date": r["trade_date"].isoformat() if r["trade_date"] else None,
                "notified_date": (r["notified_date"].isoformat()
                                  if r["notified_date"] else None),
            })
    return trades, review
