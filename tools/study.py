"""Does a stock tend to go up after a big federal contract award?

One-off study across public contractors of all sizes: every award of $25M+
in the past 3 years, the stock's move over the next 1/5/30 trading days
versus the S&P 500, bucketed by company size and by how big the award is
relative to the company. Prints a report; writes public/study.json.
"""
import datetime as dt
import json
import os
import statistics
import sys

from radar import marketcap, prices, reaction
from radar.http import Fetcher

# (ticker, USAspending recipient search term). Mix of giants, mid-caps and small caps
# across defense, space, health, IT, construction and energy.
COMPANIES = [
    ("LMT", "LOCKHEED MARTIN"), ("RTX", "RAYTHEON"), ("NOC", "NORTHROP GRUMMAN"), ("GD", "GENERAL DYNAMICS"),
    ("BA", "BOEING"), ("LHX", "L3HARRIS"), ("HII", "HUNTINGTON INGALLS"), ("LDOS", "LEIDOS"),
    ("SAIC", "SCIENCE APPLICATIONS INTERNATIONAL"), ("CACI", "CACI"), ("BAH", "BOOZ ALLEN"), ("KBR", "KBR"),
    ("PSN", "PARSONS"), ("KTOS", "KRATOS"), ("AVAV", "AEROVIRONMENT"), ("PLTR", "PALANTIR"),
    ("RKLB", "ROCKET LAB"), ("BWXT", "BWX TECHNOLOGIES"), ("CW", "CURTISS-WRIGHT"), ("HWM", "HOWMET"),
    ("TDG", "TRANSDIGM"), ("TXT", "TEXTRON"), ("OSK", "OSHKOSH"), ("MRCY", "MERCURY SYSTEMS"),
    ("VSEC", "VSE CORPORATION"), ("AIR", "AAR CORP"), ("HON", "HONEYWELL"), ("GE", "GE AEROSPACE"),
    ("ACN", "ACCENTURE FEDERAL"), ("IBM", "INTERNATIONAL BUSINESS MACHINES"), ("ORCL", "ORACLE"),
    ("FLR", "FLUOR"), ("J", "JACOBS"), ("ACM", "AECOM"), ("TTEK", "TETRA TECH"), ("AMEN", "AMENTUM"),
    ("HUM", "HUMANA"), ("CNC", "CENTENE"), ("MOH", "MOLINA"), ("MCK", "MCKESSON"), ("CAH", "CARDINAL HEALTH"),
    ("LUNR", "INTUITIVE MACHINES"), ("RDW", "REDWIRE"), ("BKSY", "BLACKSKY"), ("PL", "PLANET LABS"),
    ("ASTS", "AST SPACEMOBILE"), ("VVX", "V2X"), ("GEV", "GE VERNOVA"), ("MAXR", "MAXAR"),
]

WINDOWS = (1, 5, 30)


def bucket_size(cap: float | None) -> str:
    if cap is None:
        return "unknown size"
    if cap >= 50e9:
        return "giant (over $50B)"
    if cap >= 10e9:
        return "large ($10B to $50B)"
    if cap >= 2e9:
        return "mid ($2B to $10B)"
    return "small (under $2B)"


def bucket_share(pct: float | None) -> str:
    if pct is None:
        return "unknown share"
    if pct < 0.5:
        return "under 0.5% of company"
    if pct < 3:
        return "0.5% to 3%"
    if pct < 10:
        return "3% to 10%"
    return "over 10% of company"


def stats(rows: list[dict], w: int) -> dict | None:
    vals = [r[f"d{w}_vs_spy"] for r in rows if r.get(f"d{w}_vs_spy") is not None]
    raw = [r[f"d{w}"] for r in rows if r.get(f"d{w}") is not None]
    if len(vals) < 5:
        return None
    return {"n": len(vals), "avg_vs_spy": round(statistics.mean(vals), 2),
            "median_vs_spy": round(statistics.median(vals), 2),
            "beat_pct": round(100 * sum(v > 0 for v in vals) / len(vals)),
            "up_pct": round(100 * sum(v > 0 for v in raw) / len(raw)),
            "avg_raw": round(statistics.mean(raw), 2)}


def line(label: str, s: dict | None) -> str:
    if not s:
        return f"  {label:32s} not enough data"
    return (f"  {label:32s} n={s['n']:4d}  stock up {s['up_pct']:3d}%  beat S&P {s['beat_pct']:3d}%  "
            f"avg vs S&P {s['avg_vs_spy']:+.2f}%  median {s['median_vs_spy']:+.2f}%")


def main() -> int:
    ua = os.environ.get("SEC_USER_AGENT", "")
    f = Fetcher(ua)
    today = dt.date.today()
    start = today - dt.timedelta(days=365 * 3 + 60)
    book = prices.PriceBook(f, start, today)
    bench = book.history("SPY")
    if not bench:
        print("no benchmark prices; aborting"); return 1

    # Company sizes (shares outstanding from SEC x latest price).
    probes = [{"ticker": t, "price_now": (book.history(t) or [(None, None)])[-1][1]} for t, _ in COMPANIES]
    probes = [p for p in probes if p["price_now"]]
    # add_market_caps sets market_cap on the dicts it is given.
    sized = [{**p, "value": 1} for p in probes]
    marketcap.add_market_caps(sized, f)
    caps = {p["ticker"]: p.get("market_cap") for p in sized}

    all_rows = []
    per_company = {}
    for ticker, name in COMPANIES:
        try:
            awards = reaction.fetch_awards(name, ua, years=3, min_amount=25e6, today=today)
        except Exception as e:  # noqa: BLE001
            print(f"{ticker}: awards failed: {e}"); continue
        hist = book.history(ticker)
        rows = reaction.reactions(awards, hist, bench, windows=WINDOWS)
        cap = caps.get(ticker)
        for r in rows:
            r["ticker"] = ticker
            r["market_cap"] = cap
            r["award_pct"] = round(100 * r["value"] / cap, 3) if cap else None
        all_rows += rows
        per_company[ticker] = {"name": name, "awards": len(awards), "with_prices": len(rows),
                               "market_cap": cap, "d30": stats(rows, 30)}
        s = stats(rows, 30)
        print(f"{ticker:5s} {name[:28]:28s} cap {'$%.0fB' % (cap / 1e9) if cap else '?':>6s}  "
              f"awards {len(awards):3d}  " + (f"30d: up {s['up_pct']}% beat {s['beat_pct']}% avg vs S&P {s['avg_vs_spy']:+.2f}%" if s else "n/a"))

    print(f"\n=== {len(all_rows)} awards of $25M+ across {len(per_company)} public companies, past 3 years ===")
    report = {"generated": today.isoformat(), "awards": len(all_rows), "companies": per_company, "cuts": {}}
    for w in WINDOWS:
        print(f"\nAll awards, {w} trading day(s) after signing:")
        s = stats(all_rows, w)
        print(line("everyone", s))
        report["cuts"][f"all_d{w}"] = s

    print("\nBy company size, 30 days after:")
    for b in ("giant (over $50B)", "large ($10B to $50B)", "mid ($2B to $10B)", "small (under $2B)", "unknown size"):
        rows = [r for r in all_rows if bucket_size(r["market_cap"]) == b]
        s = stats(rows, 30)
        print(line(b, s)); report["cuts"][f"size:{b}"] = s

    print("\nBy award size relative to the company, 30 days after:")
    for b in ("under 0.5% of company", "0.5% to 3%", "3% to 10%", "over 10% of company", "unknown share"):
        rows = [r for r in all_rows if bucket_share(r["award_pct"]) == b]
        s = stats(rows, 30)
        print(line(b, s)); report["cuts"][f"share:{b}"] = s

    print("\nBy award size relative to the company, 5 days after:")
    for b in ("under 0.5% of company", "0.5% to 3%", "3% to 10%", "over 10% of company"):
        rows = [r for r in all_rows if bucket_share(r["award_pct"]) == b]
        s = stats(rows, 5)
        print(line(b, s)); report["cuts"][f"share5:{b}"] = s

    print("\nBy absolute award size, 30 days after:")
    for lo, hi, label in ((25e6, 100e6, "$25M to $100M"), (100e6, 500e6, "$100M to $500M"),
                          (500e6, 2e9, "$500M to $2B"), (2e9, 1e15, "over $2B")):
        rows = [r for r in all_rows if lo <= r["value"] < hi]
        s = stats(rows, 30)
        print(line(label, s)); report["cuts"][f"abs:{label}"] = s

    # The biggest single-award reactions, to eyeball.
    big = sorted((r for r in all_rows if r.get("d30_vs_spy") is not None and r.get("award_pct")),
                 key=lambda r: r["award_pct"], reverse=True)[:15]
    print("\nLargest awards relative to the company (and the 30-day move vs S&P):")
    for r in big:
        print(f"  {r['ticker']:5s} {r['date']} ${r['value']/1e6:,.0f}M = {r['award_pct']:.1f}% of company  "
              f"-> 1d {r.get('d1_vs_spy'):+.1f}%  5d {r.get('d5_vs_spy'):+.1f}%  30d {r['d30_vs_spy']:+.1f}%")

    os.makedirs("public", exist_ok=True)
    json.dump(report, open("public/study.json", "w"), indent=1, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
