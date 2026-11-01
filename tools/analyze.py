"""One-off: how did these companies' stocks react to past federal awards?"""
import datetime as dt
import json
import os
import sys

from radar import prices, reaction
from radar.http import Fetcher

COMPANIES = [("HON", "HONEYWELL"), ("FLR", "FLUOR"), ("ACN", "ACCENTURE FEDERAL"),
             ("LHX", "L3HARRIS"), ("LMT", "LOCKHEED MARTIN"), ("RKLB", "ROCKET LAB"),
             ("KTOS", "KRATOS"), ("PLTR", "PALANTIR")]

ua = os.environ["SEC_USER_AGENT"]
f = Fetcher(ua)
today = dt.date.today()
start = today - dt.timedelta(days=365 * 3 + 60)
book = prices.PriceBook(f, start, today)
bench = book.history("SPY")
report = {"generated": today.isoformat(), "companies": {}}
for ticker, name in COMPANIES:
    try:
        awards = reaction.fetch_awards(name, ua, years=3, min_amount=25e6, today=today)
    except Exception as e:  # noqa: BLE001
        print(ticker, "awards failed:", e); continue
    hist = book.history(ticker)
    rows = reaction.reactions(awards, hist, bench)
    summ = reaction.summarize(rows)
    report["companies"][ticker] = {"name": name, "awards_found": len(awards), "summary": summ,
                                   "rows": sorted(rows, key=lambda r: r["date"], reverse=True)[:40]}
    print(f"\n== {ticker} ({name}): {len(awards)} awards of $25M+, {len(rows)} with price data")
    for w, s in summ["windows"].items():
        print(f"   {w:>2}d: avg vs S&P {s['avg_vs_spy']:+.2f}%  median {s['median_vs_spy']:+.2f}%  "
              f"beat {s['beat_pct']}%  (raw avg {s['avg_raw']:+.2f}%, n={s['n']})")
    print("   ", summ["verdict"])
    for b in summ["biggest"][:3]:
        print(f"    biggest: {b['date']} ${b['value']/1e6:,.0f}M {b['agency'][:40]} -> 30d vs S&P "
              f"{b['d30_vs_spy'] if b['d30_vs_spy'] is not None else 'n/a'}")
os.makedirs("public", exist_ok=True)
json.dump(report, open("public/reaction-report.json", "w"), indent=1, default=str)
print("\nreport written")
