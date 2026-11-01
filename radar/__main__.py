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

from . import congress, contracts, dashboard, demo, edgar, marketcap, prices, scoring, senate
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
    args = p.parse_args(argv)

    review, awards = [], []
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
        con_raw = []
        if not args.no_congress:
            print("Scanning House periodic transaction reports...")
            try:
                con_raw, review = congress.fetch_house_trades(
                    fetcher, args.congress_days)
            except RuntimeError as e:
                print(f"  skipped: {e}")
            if not args.no_senate:
                print("Scanning Senate periodic transaction reports...")
                s_trades, s_review = senate.fetch_senate_trades(ua, args.congress_days)
                con_raw += s_trades
                review += s_review
        if not args.no_contracts:
            print("Scanning federal contract awards...")
            awards = load_contracts(fetcher, ua, args)

    ins, con = scoring.score_insider(ins_raw), scoring.score_congress(con_raw)
    scoring.cross_signal(ins, con)
    con_all = scoring.score_contracts(awards, con, ins)
    if args.demo:
        scoring.size_adjust(con_all)

    if not args.demo and not args.no_prices and (ins or con or con_all):
        print("Looking up price moves since each trade or award...")
        everything = ins + con + con_all
        dates = [x["trade_date"] for x in everything if x.get("trade_date")]
        floor = dt.date.today() - dt.timedelta(days=400)
        start = max(floor, dt.date.fromisoformat(min(dates)) - dt.timedelta(days=7)) \
            if dates else dt.date.today() - dt.timedelta(days=120)
        book = prices.PriceBook(fetcher, start)
        prices.add_performance(everything, book)
        print(f"  price sources: {book.source_ok}")
        n = marketcap.add_market_caps(con_all, fetcher)
        print(f"  company sizes found for {n} of {len(con_all)} contract winners")
        scoring.size_adjust(con_all)
    ins = [x for x in ins if x["score"] >= args.min_score]
    con = [x for x in con if x["score"] >= args.min_score]
    con_all = [x for x in con_all if x["score"] >= args.min_score]

    for p_ in (args.json, args.out):
        Path(p_).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "demo": args.demo,
        "contracts": con_all, "insiders": ins, "congress": con, "review": review,
    }, indent=2, default=str))
    Path(args.out).write_text(dashboard.render(ins, con, review, demo=args.demo, contracts=con_all))

    print(f"\n{len(con_all)} contract awards, {len(ins)} insider buys, {len(con)} Congress trades.")
    for x in sorted(con_all + ins + con, key=lambda x: x["score"], reverse=True)[:15]:
        print(f"  [{x['score']:>3}] {x['headline']}")
    print(f"\nDashboard: {Path(args.out).resolve()}")
    return 0


def load_contracts(fetcher, ua, args) -> list[dict]:
    raw = contracts.fetch_usaspending(ua, args.contract_days, args.min_contract)

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
    except Exception as e:  # noqa: BLE001 - aliases alone still match the big names
        print(f"  symbol list unavailable ({e}); using built-in contractor list only")
        book = contracts.SymbolBook()
    matched, private = contracts.match_awards(raw, book)
    print(f"  {len(matched)} awards to public companies ({private} to private companies skipped)")
    return matched


if __name__ == "__main__":
    sys.exit(main())
