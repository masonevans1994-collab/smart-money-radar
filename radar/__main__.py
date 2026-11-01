"""Command line entry point.

    python -m radar --demo                      # preview with fake data
    SEC_USER_AGENT="Jane Doe jane@example.com" python -m radar --days 3
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import congress, dashboard, demo, edgar, scoring
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
    p.add_argument("--no-congress", action="store_true", help="skip House filings")
    p.add_argument("--min-score", type=int, default=0, help="hide signals below this")
    p.add_argument("--demo", action="store_true", help="use made-up sample data")
    p.add_argument("--out", default="dashboard.html")
    p.add_argument("--json", default="signals.json")
    args = p.parse_args(argv)

    review = []
    if args.demo:
        ins_raw, con_raw = demo.insider_events(), demo.congress_trades()
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

    ins, con = scoring.score_insider(ins_raw), scoring.score_congress(con_raw)
    scoring.cross_signal(ins, con)
    ins = [x for x in ins if x["score"] >= args.min_score]
    con = [x for x in con if x["score"] >= args.min_score]

    for p_ in (args.json, args.out):
        Path(p_).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "demo": args.demo,
        "insiders": ins, "congress": con, "review": review,
    }, indent=2, default=str))
    Path(args.out).write_text(dashboard.render(ins, con, review, demo=args.demo))

    print(f"\n{len(ins)} insider buys, {len(con)} Congress trades.")
    for x in sorted(ins + con, key=lambda x: x["score"], reverse=True)[:10]:
        print(f"  [{x['score']:>3}] {x['headline']}")
    print(f"\nDashboard: {Path(args.out).resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
