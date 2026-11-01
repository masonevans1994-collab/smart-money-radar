"""Command line entry point.

    python -m radar --demo                      # preview with fake data
    SEC_USER_AGENT="Jane Doe jane@example.com" python -m radar --days 3
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import datetime as dt
from datetime import datetime, timezone
from pathlib import Path

from . import (alerts, committees, congress, contract_context, contract_news, contracts,
               dashboard, demo, reaction, sectors,
               edgar, history, marketcap, prices, scoring, senate)
from .http import Fetcher


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="radar", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--days", type=int, default=3,
                   help="business days of SEC Form 4 filings to scan (default 3)")
    p.add_argument("--congress-days", type=int, default=14,
                   help="calendar days of House filings to scan (default 14)")
    p.add_argument("--max-filings", type=int, default=600,
                   help="cap on Form 4 filings fetched (each is one request)")
    p.add_argument("--no-congress", action="store_true", help="skip House and Senate filings")
    p.add_argument("--no-senate", action="store_true", help="skip Senate filings")
    p.add_argument("--no-prices", action="store_true", help="skip price performance")
    p.add_argument("--contract-days", type=int, default=30,
                   help="days of new contract awards to scan (default 30)")
    p.add_argument("--min-contract", type=float, default=10e6,
                   help="smallest contract award to include, in dollars (default 10M)")
    p.add_argument("--no-contracts", action="store_true", help="skip contract awards")
    p.add_argument("--min-score", type=int, default=0, help="hide signals below this")
    p.add_argument("--demo", action="store_true", help="use made-up sample data")
    p.add_argument("--out", default="dashboard.html")
    p.add_argument("--json", default="signals.json")
    p.add_argument("--history", default="history.json", help="track-record file to write")
    p.add_argument("--published", default=os.environ.get("PUBLISHED_BASE", ""),
                   help="URL folder of the last published signals.json/history.json")
    args = p.parse_args(argv)

    review, awards, roster = [], [], None
    status = {}
    if args.demo:
        ins_raw, con_raw = demo.insider_events(), demo.congress_trades()
        awards = demo.contract_awards()
    else:
        ua = os.environ.get("SEC_USER_AGENT", "")
        try:
            fetcher = Fetcher(ua)
        except ValueError as e:
            print(e, file=sys.stderr)
            return 2
        print("Scanning SEC Form 4 filings...")
        ins_raw = edgar.fetch_insider_buys(fetcher, args.days, args.max_filings)
        status["insiders"] = "ok" if ins_raw else "unavailable"
        con_raw = []
        if not args.no_congress:
            print("Scanning House periodic transaction reports...")
            try:
                con_raw, review = congress.fetch_house_trades(
                    fetcher, args.congress_days)
                status["house"] = "ok" if con_raw else "empty"
            except RuntimeError as e:
                print(f"  skipped: {e}")
                status["house"] = "unavailable"
            if not args.no_senate:
                print("Scanning Senate periodic transaction reports...")
                s_trades, s_review = senate.fetch_senate_trades(ua, args.congress_days)
                con_raw += s_trades
                review += s_review
                status["senate"] = "ok" if s_trades else "unavailable"
        if not args.no_contracts:
            print("Scanning federal contract awards...")
            awards = load_contracts(fetcher, ua, args)
            status["contracts"] = "ok" if awards else "unavailable"
            roster = load_roster(fetcher)

    if not args.demo and not awards and not args.no_contracts:
        prev_text = fetch_text(args.published + "signals.json") if args.published else None
        try:
            prev = json.loads(prev_text) if prev_text else {}
        except ValueError:
            prev = {}
        if prev.get("contracts"):
            print(f"  contract sources unavailable; keeping {len(prev['contracts'])} from the last good run")
            awards = [{k: v for k, v in c.items() if k not in ("score", "reasons", "headline")}
                      for c in prev["contracts"]]
            status["contracts"] = "stale"
    ins, con = scoring.score_insider(ins_raw), scoring.score_congress(con_raw)
    # Plain company names for Congress trades ("Disney", not just "DIS").
    named = 0
    for t in con:
        name = SYMBOL_NAMES.get(t.get("ticker", ""))
        if name and not t.get("company"):
            t["company"] = name
            named += 1
    if con:
        print(f"  company names found for {named} of {len(con)} Congress trades ({len(SYMBOL_NAMES)} symbols known)")
    scoring.cross_signal(ins, con)
    con_all = scoring.score_contracts(awards, con, ins)
    scoring.committee_flags(con_all, roster)
    if not args.demo and con_all:
        print("Comparing each award with the company's contract history...")
        contract_context.add_context(con_all, os.environ.get("SEC_USER_AGENT", ""))
    if args.demo:
        scoring.size_adjust(con_all)

    track, hist_entries, prev_feed = None, [], None
    if args.demo:
        track = demo.track_record()
    elif not args.no_prices and (ins or con or con_all):
        print("Looking up price moves and the track record...")
        everything = con_all + ins + con
        prev_feed = fetch_text(args.published + "signals.json") if args.published else None
        hist_entries = history.merge(
            history.load(fetch_text(args.published + "history.json") if args.published else None),
            everything, dt.date.today())
        # Three years of prices so past-award reactions can be measured.
        start = dt.date.today() - dt.timedelta(days=365 * 3 + 60)
        book = prices.PriceBook(fetcher, start)
        prices.add_performance(everything, book)
        n = marketcap.add_market_caps(con_all, fetcher)
        print(f"  company sizes found for {n} of {len(con_all)} contract winners")
        scoring.size_adjust(con_all)
        sectors.add_sector_context(con_all, book)
        if con_all:
            print("Looking up how each company's stock reacted to its past awards...")
            reaction.company_history(con_all, ua, book)
        history.reprice(hist_entries, book)
        track = history.summarize(hist_entries)
        print(f"  price sources: {book.source_ok}; history: {len(hist_entries)} signals tracked")
        status["prices"] = "ok" if sum(v for k, v in book.source_ok.items() if k != "none") else "unavailable"

    ins = [x for x in ins if x["score"] >= args.min_score]
    con = [x for x in con if x["score"] >= args.min_score]
    con_all = [x for x in con_all if x["score"] >= args.min_score]

    for p_ in (args.json, args.out):
        Path(p_).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "demo": args.demo,
        "contracts": con_all, "insiders": ins, "congress": con, "review": review,
        "track_record": track,
        "status": status,
    }, separators=(",", ":"), default=str))
    if hist_entries:
        Path(args.history).parent.mkdir(parents=True, exist_ok=True)
        Path(args.history).write_text(json.dumps({"entries": hist_entries}, default=str))
    if not args.demo:
        print("Checking for new alerts...")
        prev = alerts.previous_keys(prev_feed)
        if prev is None:
            print("  no previous feed to compare against; alerts start next run")
        new = alerts.pick_new(con_all + ins + con, prev,
                              int(os.environ.get("ALERT_MIN_CONTRACT") or 60),
                              int(os.environ.get("ALERT_MIN_OTHER") or 85))
        alerts.send(new, args.published)
        if os.environ.get("SEND_DIGEST") == "1":
            digest = alerts.weekly_digest(con_all, dt.date.today(), args.published)
            if digest:
                alerts.send([{"headline": digest, "ticker": "Weekly", "score": 0, "reasons": [],
                              "kind": "digest", "url": ""}], "")
    Path(args.out).write_text(dashboard.render(ins, con, review, demo=args.demo, contracts=con_all))

    print(f"\n{len(con_all)} contract awards, {len(ins)} insider buys, {len(con)} Congress trades.")
    for x in sorted(con_all + ins + con, key=lambda x: x["score"], reverse=True)[:15]:
        print(f"  [{x['score']:>3}] {x['headline']}")
    print(f"\nDashboard: {Path(args.out).resolve()}")
    return 0


def load_contracts(fetcher, ua, args) -> list[dict]:
    # Transactions carry the exact signing date for both new awards and
    # expansions; the award search fills in descriptions/IDs for new awards.
    txns = contract_news.fetch_modifications(ua, args.contract_days, min_amount=50e6, pages=5,
                                             min_new=args.min_contract)
    searched = contracts.fetch_usaspending(ua, args.contract_days, args.min_contract)
    by_id = {a["award_id"]: a for a in searched if a.get("award_id")}
    raw = []
    for t in txns:
        base = by_id.pop(t["award_id"], None) if not t["is_modification"] else None
        if base:  # prefer the signing date; keep the search's richer fields
            t = {**base, "award_date": t["award_date"], "value": max(t["value"], base["value"])}
        raw.append(t)
    raw += by_id.values()  # anything the transaction search missed

    def get_text(url):
        body = fetcher.get(url, cache="/Article/" in url)
        if body is None:
            raise RuntimeError("not found")
        return body.decode("utf-8", "replace")

    dod = contracts.fetch_dod(get_text, days=min(args.contract_days, 10))
    raw += [a for a in dod if a["value"] >= args.min_contract]
    try:
        book = contracts.SymbolBook.from_symbol_files(
            fetcher.get(contracts.NASDAQ_LISTED, cache=False).decode("utf-8", "replace"),
            fetcher.get(contracts.OTHER_LISTED, cache=False).decode("utf-8", "replace"))
        print(f"  symbol list: {len(book.index)} listed companies")
        SYMBOL_NAMES.update(book.names)
    except Exception as e:  # noqa: BLE001 - aliases alone still match the big names
        print(f"  symbol list unavailable ({e}); using built-in contractor list only")
        book = contracts.SymbolBook()
    matched, private = contracts.match_awards(raw, book)
    print(f"  {len(matched)} awards to public companies ({private} to private companies skipped)")
    matched += contract_news.fetch_8k_awards(fetcher, days=min(args.contract_days, 14),
                                             min_amount=args.min_contract)
    merged = contracts.dedupe(matched)
    if len(merged) < len(matched):
        print(f"  merged {len(matched) - len(merged)} duplicate report(s) of the same award")
    return merged


SYMBOL_NAMES: dict[str, str] = {}  # ticker -> listed company name, filled by load_contracts


def fetch_text(url: str) -> str | None:
    """Fetch the previously published file (fresh, not cached)."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "smart-money-radar"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8")
    except Exception:  # noqa: BLE001 - first run, or Pages not up yet
        return None


def load_roster(fetcher):
    try:
        texts = [fetcher.get(committees.BASE + f, cache=False).decode("utf-8") for f in committees.FILES]
        r = committees.Roster.from_json(*texts)
        print(f"  committee rosters: {len(r.people)} members of Congress")
        return r
    except Exception as e:  # noqa: BLE001
        print(f"  committee rosters unavailable ({e})")
        return None


if __name__ == "__main__":
    sys.exit(main())
