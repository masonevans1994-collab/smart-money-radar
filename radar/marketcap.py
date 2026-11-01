"""Company size (market value) so an award can be judged relative to it.

Shares outstanding come from the SEC's XBRL API (data.sec.gov), which
needs the same declared User-Agent as EDGAR. Market value = shares x the
latest price we already looked up. All failures are soft.
"""

from __future__ import annotations

import json

TICKERS = "https://www.sec.gov/files/company_tickers.json"
SHARES = ("https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/dei/"
          "EntityCommonStockSharesOutstanding.json")


def parse_ticker_map(text: str) -> dict[str, int]:
    data = json.loads(text)
    return {v["ticker"].upper(): int(v["cik_str"]) for v in data.values()}


def latest_shares(text: str) -> float | None:
    """Most recent reported shares outstanding (summed across share classes)."""
    try:
        facts = json.loads(text)["units"]["shares"]
    except (KeyError, ValueError, TypeError):
        return None
    if not facts:
        return None
    latest_end = max(f.get("end", "") for f in facts)
    latest = [f for f in facts if f.get("end") == latest_end]
    # One fact per share class in the newest filing for that date.
    newest_accn = max(f.get("accn", "") for f in latest)
    vals = [f["val"] for f in latest if f.get("accn") == newest_accn]
    total = float(sum(vals))
    return total or None


def add_market_caps(contracts: list[dict], fetcher, log=print) -> int:
    """Set market_cap and award_pct on contract signals. Returns how many got one."""
    if not contracts:
        return 0
    try:
        body = fetcher.get(TICKERS, cache=False)
        cik_map = parse_ticker_map(body.decode()) if body else {}
    except Exception as e:  # noqa: BLE001
        log(f"  company sizes unavailable ({e})")
        return 0
    done = 0
    for c in contracts:
        cik = cik_map.get(c["ticker"].replace(".", "-")) or cik_map.get(c["ticker"])
        price = c.get("price_now")
        if not cik or not price:
            continue
        try:
            body = fetcher.get(SHARES.format(cik=cik))
            shares = latest_shares(body.decode()) if body else None
        except Exception:  # noqa: BLE001
            shares = None
        if not shares:
            continue
        c["market_cap"] = round(shares * price)
        c["award_pct"] = round(c["value"] / c["market_cap"] * 100, 2)
        done += 1
    return done
