"""Corporate insider purchases from SEC Form 4 filings (free, via EDGAR).

Flow: daily form index -> list of Form 4 filings -> fetch each filing ->
parse the embedded ownershipDocument XML -> keep open-market purchases
(transaction code "P"), which are the most meaningful insider signal.
"""

from __future__ import annotations

import datetime as dt
import re
import xml.etree.ElementTree as ET
from typing import Iterable

ARCHIVES = "https://www.sec.gov/Archives/"
DAILY_INDEX = ARCHIVES + "edgar/daily-index/{year}/QTR{q}/form.{ymd}.idx"


# ---------- daily index ----------

def daily_index_url(day: dt.date) -> str:
    q = (day.month - 1) // 3 + 1
    return DAILY_INDEX.format(year=day.year, q=q, ymd=day.strftime("%Y%m%d"))


def parse_form_index(text: str, form_types: Iterable[str] = ("4",)) -> list[dict]:
    """Parse an EDGAR form.YYYYMMDD.idx file into filing records.

    Each Form 4 is listed twice (issuer and reporting owner); we dedupe on
    the filing path.
    """
    wanted = set(form_types)
    out, seen = [], set()
    started = False
    for line in text.splitlines():
        if not started:
            if line.startswith("---"):
                started = True
            continue
        parts = line.split()
        if len(parts) < 5 or parts[0] not in wanted:
            continue
        filename, date, cik = parts[-1], parts[-2], parts[-3]
        if filename in seen:
            continue
        seen.add(filename)
        out.append({
            "form": parts[0],
            "company": " ".join(parts[1:-3]),
            "cik": cik,
            "date_filed": date,
            "url": ARCHIVES + filename,
        })
    return out


# ---------- Form 4 XML ----------

_DOC_RE = re.compile(r"<ownershipDocument>.*?</ownershipDocument>", re.S)


def extract_ownership_xml(filing_text: str) -> str | None:
    m = _DOC_RE.search(filing_text)
    return m.group(0) if m else None


def _val(el: ET.Element | None, path: str) -> str | None:
    """Read a field that may be <x>text</x> or <x><value>text</value></x>."""
    if el is None:
        return None
    node = el.find(path)
    if node is None:
        return None
    v = node.find("value")
    text = v.text if v is not None else node.text
    return text.strip() if text and text.strip() else None


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _flag(s: str | None) -> bool:
    return (s or "").strip().lower() in ("1", "true")


def parse_form4(xml_text: str, filing_url: str = "") -> dict | None:
    """Parse one Form 4 into an issuer/owner record with its transactions."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    issuer = root.find("issuer")
    owners = root.findall("reportingOwner")
    names, roles = [], {"director": False, "officer": False,
                        "ten_pct": False, "title": ""}
    for o in owners:
        name = _val(o, "reportingOwnerId/rptOwnerName")
        if name:
            names.append(name)
        rel = o.find("reportingOwnerRelationship")
        roles["director"] |= _flag(_val(rel, "isDirector"))
        roles["officer"] |= _flag(_val(rel, "isOfficer"))
        roles["ten_pct"] |= _flag(_val(rel, "isTenPercentOwner"))
        title = _val(rel, "officerTitle")
        if title and not roles["title"]:
            roles["title"] = title

    txns = []
    for t in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        txns.append({
            "security": _val(t, "securityTitle"),
            "date": _val(t, "transactionDate"),
            "code": _val(t, "transactionCoding/transactionCode"),
            "shares": _num(_val(t, "transactionAmounts/transactionShares")),
            "price": _num(_val(t, "transactionAmounts/transactionPricePerShare")),
            "acq_disp": _val(t, "transactionAmounts/transactionAcquiredDisposedCode"),
            "shares_after": _num(_val(
                t, "postTransactionAmounts/sharesOwnedFollowingTransaction")),
        })

    return {
        "issuer_name": _val(issuer, "issuerName"),
        "issuer_cik": _val(issuer, "issuerCik"),
        "ticker": (_val(issuer, "issuerTradingSymbol") or "").upper() or None,
        "owner": "; ".join(person_name(n) for n in names) or "Unknown",
        "roles": roles,
        "period": _val(root, "periodOfReport"),
        "is_10b5_1": _flag(_val(root, "aff10b5One")),
        "transactions": txns,
        "url": filing_url,
    }


def open_market_buy(doc: dict, date_filed: str = "") -> dict | None:
    """Collapse a filing's open-market purchases ("P") into one buy event."""
    buys = [t for t in doc["transactions"]
            if t["code"] == "P" and t["shares"] and t["acq_disp"] in (None, "A")]
    if not buys:
        return None
    shares = sum(t["shares"] for t in buys)
    value = sum(t["shares"] * (t["price"] or 0) for t in buys)
    last = max(buys, key=lambda t: (t["date"] or "", t["shares_after"] or 0))
    after = last["shares_after"]
    before = (after - shares) if after is not None else None
    return {
        "kind": "insider",
        "ticker": doc["ticker"],
        "company": doc["issuer_name"],
        "who": doc["owner"],
        "roles": doc["roles"],
        "trade_date": min(t["date"] or "" for t in buys) or doc["period"],
        "disclosed": _fmt_idx_date(date_filed),
        "shares": shares,
        "avg_price": round(value / shares, 4) if shares else None,
        "value": round(value, 2),
        "shares_before": before,
        "shares_after": after,
        "is_10b5_1": doc["is_10b5_1"],
        "url": doc["url"],
    }


def _fmt_idx_date(s: str) -> str:
    """EDGAR index dates are YYYYMMDD (or already YYYY-MM-DD)."""
    if re.fullmatch(r"\d{8}", s or ""):
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return s or ""


# ---------- orchestration ----------

def business_days_back(n: int, today: dt.date | None = None) -> list[dt.date]:
    day = today or dt.date.today()
    out = []
    while len(out) < n:
        if day.weekday() < 5:
            out.append(day)
        day -= dt.timedelta(days=1)
    return out


def person_name(raw: str) -> str:
    """EDGAR files people as 'LAST FIRST M' or 'Last, First M'; return 'First M. Last'.
    Entities (trusts, LLCs, funds) are left as written."""
    raw = " ".join(raw.split())
    if not raw or re.search(r"\b(LLC|L\.P\.|LP|INC|CORP|TRUST|FUND|PARTNERS|CAPITAL|HOLDINGS|MANAGEMENT|LTD|GROUP|FOUNDATION)\b", raw, re.I):
        return raw
    if "," in raw:
        last, first = [x.strip() for x in raw.split(",", 1)]
    else:
        parts = raw.split(" ")
        if len(parts) < 2:
            return raw
        last, first = parts[0], " ".join(parts[1:])
    def cap(w: str) -> str:
        if len(w) == 1:
            return w.upper() + "."
        if "-" in w:
            return "-".join(cap(x) for x in w.split("-"))
        if w.lower().startswith("mc") and len(w) > 2:
            return "Mc" + w[2:3].upper() + w[3:].lower()
        return w[:1].upper() + w[1:].lower()
    first = " ".join(cap(w) for w in first.split())
    last = " ".join(cap(w) for w in last.split())
    return f"{first} {last}".strip()


def fetch_insider_buys(fetcher, days: int = 3, max_filings: int = 500,
                       log=print) -> list[dict]:
    from .http import Blocked

    filings = []
    for day in business_days_back(days):
        try:
            body = fetcher.get(daily_index_url(day), cache=day < dt.date.today())
        except Blocked as e:
            if day == dt.date.today() and "access denied" in str(e).lower():
                # EDGAR answers 403 (not 404) for an index that isn't posted yet.
                log(f"  no EDGAR index for {day} yet; checking earlier days")
                continue
            log(f"  SEC refused the request ({e}). The SEC requires a real contact "
                "email: set SEC_USER_AGENT to 'Your Name you@example.com'.")
            return []
        if body is None:
            log(f"  no EDGAR index for {day} (weekend/holiday or not posted yet)")
            continue
        found = parse_form_index(body.decode("latin-1"))
        log(f"  {day}: {len(found)} Form 4 filings")
        filings.extend(found)

    filings = filings[:max_filings]
    events = []
    for i, f in enumerate(filings, 1):
        if i % 100 == 0:
            log(f"  parsed {i}/{len(filings)} filings, {len(events)} buys so far")
        try:
            body = fetcher.get(f["url"])
        except Blocked as e:
            log(f"  SEC refused the request ({e}); stopping early.")
            break
        if not body:
            continue
        xml = extract_ownership_xml(body.decode("utf-8", "replace"))
        doc = parse_form4(xml, f["url"]) if xml else None
        if not doc or doc["ticker"] in (None, "NONE", "N/A", "NA"):
            continue
        ev = open_market_buy(doc, f["date_filed"])
        if ev:
            events.append(ev)
    return events
