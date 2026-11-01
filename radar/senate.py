"""U.S. Senate stock trades from Periodic Transaction Reports (PTRs).

efdsearch.senate.gov requires accepting its terms once per session, then
offers a JSON search of reports. Electronically filed PTRs are HTML pages
with a transaction table; paper filings are scanned images and are listed
for manual review instead.
"""

from __future__ import annotations

import datetime as dt
import html
import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from .congress import BRACKETS, parse_amount

BASE = "https://efdsearch.senate.gov"
HOME = BASE + "/search/home/"
SEARCH = BASE + "/search/"
REPORTS = BASE + "/search/report/data/"
PTR_REPORT_TYPE = "[11]"

TYPE_MAP = {"purchase": "Purchase", "sale (full)": "Sale", "sale": "Sale",
            "sale (partial)": "Sale (partial)", "exchange": "Exchange"}
OWNER_MAP = {"self": "Self", "spouse": "Spouse", "joint": "Joint",
             "child": "Dependent child", "dependent child": "Dependent child"}


class SenateSession:
    """Cookie-holding client that has accepted the site's terms."""

    def __init__(self, user_agent: str, min_interval: float = 0.5):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar))
        self.ua = user_agent
        self.min_interval = min_interval
        self._last = 0.0

    def _req(self, url: str, data: dict | None = None, referer: str = SEARCH,
             retries: int = 2) -> str:
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        for attempt in range(retries + 1):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            req = urllib.request.Request(url, data=body, headers={
                "User-Agent": self.ua, "Referer": referer, "Accept-Encoding": "identity",
            })
            try:
                with self.opener.open(req, timeout=30) as r:
                    return r.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                # The site intermittently refuses some cloud IPs; back off briefly.
                if e.code in (403, 429, 503) and attempt < retries:
                    time.sleep(5 * (attempt + 1))
                    continue
                raise
        raise RuntimeError("unreachable")

    def _csrf_cookie(self) -> str:
        return next((c.value for c in self.jar if c.name == "csrftoken"), "")

    def accept_terms(self) -> None:
        page = self._req(HOME)
        m = re.search(r'name="csrfmiddlewaretoken"\s+value="([^"]+)"', page)
        token = m.group(1) if m else self._csrf_cookie()
        self._req(HOME, {"csrfmiddlewaretoken": token,
                         "prohibition_agreement": "1"}, referer=HOME)

    def search_ptrs(self, since: dt.date) -> list[list]:
        rows, start = [], 0
        while True:
            payload = {
                "start": str(start), "length": "100", "report_types": PTR_REPORT_TYPE,
                "filer_types": "[]", "submitted_start_date": since.strftime("%m/%d/%Y 00:00:00"),
                "submitted_end_date": "", "candidate_state": "", "senator_state": "",
                "office_id": "", "first_name": "", "last_name": "",
                "csrfmiddlewaretoken": self._csrf_cookie(),
            }
            data = json.loads(self._req(REPORTS, payload))
            batch = data.get("data", [])
            rows += batch
            if len(batch) < 100:
                return rows
            start += 100

    def get(self, path: str) -> str:
        return self._req(urllib.parse.urljoin(BASE, path))


# ---------- parsing ----------

def _clean(cell: str) -> str:
    text = re.sub(r"<[^>]+>", " ", cell)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def parse_report_rows(rows: list[list]) -> list[dict]:
    """Search results -> filings. Row: [first, last, office, link html, date]."""
    out = []
    for r in rows:
        if len(r) < 5:
            continue
        m = re.search(r'href="([^"]+)"', r[3])
        if not m:
            continue
        first, last = _clean(r[0]), _clean(r[1])
        filed = dt.datetime.strptime(_clean(r[4]), "%m/%d/%Y").date()
        out.append({
            "member": f"Sen. {first} {last}".strip(),
            "office": _clean(r[2]),
            "path": m.group(1),
            "paper": "/paper/" in m.group(1),
            "filing_date": filed,
            "url": urllib.parse.urljoin(BASE, m.group(1)),
        })
    return out


def parse_ptr_html(page: str) -> list[dict]:
    """Transaction table of an e-filed Senate PTR."""
    tbody = re.search(r"<tbody>(.*?)</tbody>", page, re.S | re.I)
    if not tbody:
        return []
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbody.group(1), re.S | re.I):
        cells = [_clean(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
        if len(cells) < 8:
            continue
        # #, Transaction Date, Owner, Ticker, Asset Name, Asset Type, Type, Amount, Comment
        _, date_s, owner, ticker, asset, asset_type, typ, amount = cells[:8]
        ticker = ticker.strip().upper()
        if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,6}", ticker):
            continue  # "--" for bonds, funds without tickers, etc.
        try:
            trade_date = dt.datetime.strptime(date_s, "%m/%d/%Y").date()
        except ValueError:
            trade_date = None
        try:
            low, high = parse_amount(amount)
        except (IndexError, ValueError):
            continue
        if high is not None and high <= low:
            high = BRACKETS.get(low)
        out.append({
            "ticker": ticker,
            "asset_type": "OP" if "option" in asset_type.lower() else "ST",
            "type": TYPE_MAP.get(typ.lower(), typ),
            "trade_date": trade_date,
            "amount_low": low,
            "amount_high": high,
            "owner": OWNER_MAP.get(owner.lower(), owner or "Self"),
            "asset_name": asset,
        })
    return out


# ---------- orchestration ----------

def fetch_senate_trades(user_agent: str, days: int = 14, max_filings: int = 60,
                        today: dt.date | None = None, log=print,
                        session: SenateSession | None = None) -> tuple[list, list]:
    today = today or dt.date.today()
    since = today - dt.timedelta(days=days)
    s = session or SenateSession(user_agent)
    step = "accepting terms"
    try:
        s.accept_terms()
        step = "searching reports"
        filings = parse_report_rows(s.search_ptrs(since))
    except Exception as e:  # noqa: BLE001 - never sink the whole run
        log(f"  Senate site failed while {step}: {e} (will retry next run)")
        return [], []
    filings = sorted(filings, key=lambda f: f["filing_date"], reverse=True)[:max_filings]
    log(f"  {len(filings)} Senate PTR filings since {since}")

    trades, review = [], []
    for f in filings:
        if f["paper"]:
            review.append({"member": f["member"], "url": f["url"]})
            continue
        try:
            rows = parse_ptr_html(s.get(f["path"]))
        except Exception as e:  # noqa: BLE001
            log(f"  could not read {f['url']}: {e}")
            rows = []
        if not rows:
            continue
        for r in rows:
            trades.append({
                "kind": "congress", "chamber": "Senate",
                "who": f["member"], "district": "",
                "disclosed": f["filing_date"].isoformat(), "url": f["url"],
                "notified_date": None, **r,
                "trade_date": r["trade_date"].isoformat() if r["trade_date"] else None,
            })
    return trades, review
