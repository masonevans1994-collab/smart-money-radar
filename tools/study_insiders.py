"""Do insider open-market buys (especially several insiders at once) predict the stock?

Uses the SEC's quarterly "Insider Transactions" data sets (every Form 4, as tables),
finds open-market purchases, groups them into clusters (2+ different insiders buying
the same company within 10 days), then measures the stock 5/30/90/180 trading days
after the news was public versus the S&P 500. Prints a report; writes public/study-insiders.json.
"""
import csv
import datetime as dt
import io
import json
import os
import statistics
import sys
import zipfile
from bisect import bisect_left
from collections import defaultdict

from radar import prices
from radar.http import Fetcher

DATASET = "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/{q}_form345.zip"
WINDOWS = (5, 30, 90, 180)
MIN_SINGLE = 25_000      # what the app shows
MIN_CLUSTER = 100_000    # total bought across the cluster
MAX_TICKERS = int(os.environ.get("STUDY_MAX_TICKERS", "420"))
PRICE_BUDGET_MIN = int(os.environ.get("STUDY_PRICE_MINUTES", "150"))
MAX_VALUE = 200_000_000  # above this a "purchase" is almost always a data error or a fund, not a person


def quarters(start: dt.date, end: dt.date):
    y, q = start.year, (start.month - 1) // 3 + 1
    while (y, q) <= (end.year, (end.month - 1) // 3 + 1):
        yield f"{y}q{q}"
        q += 1
        if q == 5:
            y, q = y + 1, 1


def read_tsv(z: zipfile.ZipFile, name: str):
    with z.open(name) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
        yield from csv.DictReader(text, delimiter="\t")


def load_quarter(fetcher: Fetcher, q: str, log=print) -> list[dict]:
    """Open-market purchases in one quarter: one row per filing."""
    body = fetcher.get(DATASET.format(q=q))
    if body is None:
        log(f"  {q}: not published yet")
        return []
    z = zipfile.ZipFile(io.BytesIO(body))
    subs = {}
    for r in read_tsv(z, "SUBMISSION.tsv"):
        subs[r["ACCESSION_NUMBER"]] = (r.get("ISSUERTRADINGSYMBOL", "").strip().upper(),
                                      r.get("FILING_DATE", ""), r.get("ISSUERNAME", ""))
    owners = defaultdict(set)
    roles = defaultdict(set)
    for r in read_tsv(z, "REPORTINGOWNER.tsv"):
        owners[r["ACCESSION_NUMBER"]].add(r.get("RPTOWNERNAME", "").strip().upper())
        if r.get("RPTOWNER_RELATIONSHIP"):
            roles[r["ACCESSION_NUMBER"]].add(r["RPTOWNER_RELATIONSHIP"])
    buys = defaultdict(lambda: {"value": 0.0, "shares": 0.0, "dates": []})
    for r in read_tsv(z, "NONDERIV_TRANS.tsv"):
        if r.get("TRANS_CODE") != "P" or r.get("TRANS_ACQUIRED_DISP_CD") != "A":
            continue
        try:
            shares, price = float(r.get("TRANS_SHARES") or 0), float(r.get("TRANS_PRICEPERSHARE") or 0)
        except ValueError:
            continue
        if shares <= 0 or price <= 0:
            continue
        b = buys[r["ACCESSION_NUMBER"]]
        b["value"] += shares * price
        b["shares"] += shares
        b["dates"].append(r.get("TRANS_DATE", ""))
    out = []
    for acc, b in buys.items():
        sym, filed, name = subs.get(acc, ("", "", ""))
        if not sym or not filed or len(sym) > 5 or not sym.isalnum():
            continue
        out.append({"acc": acc, "ticker": sym, "name": name, "filed": _iso(filed),
                    "trade": _iso(min(d for d in b["dates"] if d) if any(b["dates"]) else filed),
                    "value": round(b["value"]), "owners": owners.get(acc, set()),
                    "officer": "Officer" in roles.get(acc, set()) or "CEO" in "".join(roles.get(acc, set()))})
    log(f"  {q}: {len(out)} filings with open-market purchases", flush=True)
    return out


def _iso(d: str) -> str:
    """'15-MAR-2024' or '2024-03-15' -> '2024-03-15'."""
    d = d.strip()
    for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return dt.datetime.strptime(d, fmt).date().isoformat()
        except ValueError:
            pass
    return d[:10]


def clusters(filings: list[dict], days: int = 10) -> list[dict]:
    """Groups of 2+ different insiders buying the same stock within `days`."""
    by_t = defaultdict(list)
    for f in filings:
        by_t[f["ticker"]].append(f)
    out = []
    for t, fs in by_t.items():
        fs.sort(key=lambda f: f["trade"])
        i = 0
        while i < len(fs):
            start = dt.date.fromisoformat(fs[i]["trade"])
            group = [fs[i]]
            j = i + 1
            while j < len(fs) and (dt.date.fromisoformat(fs[j]["trade"]) - start).days <= days:
                group.append(fs[j]); j += 1
            people = set().union(*(g["owners"] for g in group))
            out.append({"ticker": t, "name": group[0]["name"], "n_filings": len(group), "n_people": len(people),
                        "value": sum(g["value"] for g in group), "public": max(g["filed"] for g in group),
                        "officer": any(g["officer"] for g in group)})
            i = j
    return out


def forward(rows: list[tuple[str, float]], bench: list[tuple[str, float]], day: str) -> dict:
    """Moves from the first close on/after `day` (when the filing was public) to +w trading days."""
    out = {}
    days = [d for d, _ in rows]
    bdays = [d for d, _ in bench]
    i0, j0 = bisect_left(days, day), bisect_left(bdays, day)
    if i0 >= len(rows) or j0 >= len(bench) or days[i0] > (dt.date.fromisoformat(day) + dt.timedelta(days=7)).isoformat():
        return out
    base, bbase = rows[i0][1], bench[j0][1]
    for w in WINDOWS:
        i, j = i0 + w, j0 + w
        if i < len(rows) and j < len(bench) and base > 0 and bbase > 0:
            out[f"d{w}"] = round((rows[i][1] / base - 1) * 100, 2)
            out[f"d{w}_vs_spy"] = round(out[f"d{w}"] - (bench[j][1] / bbase - 1) * 100, 2)
    return out


def stats(items: list[dict], w: int) -> dict | None:
    vals = [x[f"d{w}_vs_spy"] for x in items if x.get(f"d{w}_vs_spy") is not None]
    raw = [x[f"d{w}"] for x in items if x.get(f"d{w}") is not None]
    if len(vals) < 10:
        return None
    return {"n": len(vals), "avg_vs_spy": round(statistics.mean(vals), 2),
            "median_vs_spy": round(statistics.median(vals), 2),
            "beat_pct": round(100 * sum(v > 0 for v in vals) / len(vals)),
            "up_pct": round(100 * sum(v > 0 for v in raw) / len(raw)), "avg_raw": round(statistics.mean(raw), 2)}


def show(label: str, items: list[dict], report: dict) -> None:
    print(f"\n{label}:")
    for w in WINDOWS:
        s = stats(items, w)
        report[f"{label}|d{w}"] = s
        if s:
            print(f"  {w:3d} days: n={s['n']:5d}  stock up {s['up_pct']:3d}%  beat S&P {s['beat_pct']:3d}%  "
                  f"avg vs S&P {s['avg_vs_spy']:+.2f}%  median {s['median_vs_spy']:+.2f}%")
        else:
            print(f"  {w:3d} days: not enough data")


def main() -> int:
    ua = os.environ.get("SEC_USER_AGENT", "")
    f = Fetcher(ua)
    today = dt.date.today()
    start = today - dt.timedelta(days=365 * 3 + 30)
    print("Loading SEC insider-transaction data sets...", flush=True)
    filings = []
    for q in quarters(start, today):
        try:
            filings += load_quarter(f, q)
        except Exception as e:  # noqa: BLE001
            print(f"  {q}: failed ({e})")
    # Only buys that would have been public before today-200 trading days have full windows;
    # keep everything and let the windows be missing where it's too recent.
    filings = [x for x in filings if x["filed"] >= start.isoformat()]
    print(f"{len(filings)} filings with open-market purchases since {start}")

    filings = [x for x in filings if x["value"] <= MAX_VALUE]
    singles = [x for x in filings if x["value"] >= MIN_SINGLE]
    cl = [c for c in clusters(filings) if c["n_people"] >= 2 and c["value"] >= MIN_CLUSTER]
    print(f"{len(singles)} single buys of ${MIN_SINGLE:,}+; {len(cl)} clusters (2+ insiders within 10 days, ${MIN_CLUSTER:,}+)")

    # Prices: a random (seeded) sample of cluster tickers, then of single-buy tickers,
    # so the sample isn't skewed toward the oddest, largest filings.
    import random
    rng = random.Random(7)
    cluster_t = sorted({c["ticker"] for c in cl})
    single_t = sorted({x["ticker"] for x in singles} - set(cluster_t))
    rng.shuffle(cluster_t); rng.shuffle(single_t)
    wanted = (cluster_t[: int(MAX_TICKERS * 0.7)] + single_t)[:MAX_TICKERS]
    # No retries for prices: a throttled feed should fail fast, not stall the whole study.
    pf = Fetcher(ua, retries=0)
    book = prices.PriceBook(pf, start - dt.timedelta(days=10), today, log=lambda *_: None)
    bench = book.history("SPY")
    if not bench:
        print("no S&P prices; aborting"); return 1
    print(f"Fetching prices for {len(wanted)} tickers (budget {PRICE_BUDGET_MIN} min)...", flush=True)
    hist = {}
    t0 = dt.datetime.now()
    for i, t in enumerate(wanted, 1):
        hist[t] = book.history(t)
        if i % 25 == 0:
            print(f"  {i}/{len(wanted)} ({sum(1 for h in hist.values() if h)} with data, "
                  f"{(dt.datetime.now() - t0).seconds // 60} min)", flush=True)
        if (dt.datetime.now() - t0).seconds > PRICE_BUDGET_MIN * 60:
            print(f"  price budget used up after {i} tickers", flush=True)
            break
    print(f"  prices found for {sum(1 for h in hist.values() if h)} of {len(wanted)}; sources {book.source_ok}", flush=True)

    def measure(items, key):
        out = []
        for x in items:
            rows = hist.get(x["ticker"])
            if not rows:
                continue
            fw = forward(rows, bench, x[key])
            if fw:
                out.append({**x, **fw})
        return out

    m_cl = measure(cl, "public")
    m_single = measure(singles, "filed")
    report = {"generated": today.isoformat(), "filings": len(filings), "clusters": len(cl), "cuts": {}}
    show("Any single insider buy of $25K+ (what the app shows today)", m_single, report["cuts"])
    show("Single buys of $250K+", [x for x in m_single if x["value"] >= 250_000], report["cuts"])
    show("Single buys by an officer (CEO/CFO etc.), $100K+", [x for x in m_single if x["officer"] and x["value"] >= 100_000], report["cuts"])
    show("Clusters: 2+ insiders within 10 days, $100K+ total", m_cl, report["cuts"])
    show("Clusters: 3+ insiders", [x for x in m_cl if x["n_people"] >= 3], report["cuts"])
    show("Clusters: $1M+ total", [x for x in m_cl if x["value"] >= 1_000_000], report["cuts"])
    show("Clusters: 3+ insiders and $1M+", [x for x in m_cl if x["n_people"] >= 3 and x["value"] >= 1_000_000], report["cuts"])

    # Year by year, so one hot year can't carry the result.
    for y in sorted({x["public"][:4] for x in m_cl}):
        show(f"Clusters in {y}", [x for x in m_cl if x["public"].startswith(y)], report["cuts"])

    best = sorted((x for x in m_cl if x.get("d90_vs_spy") is not None), key=lambda x: -x["value"])[:12]
    print("\nBiggest clusters (90-day move vs S&P):")
    for x in best:
        print(f"  {x['ticker']:5s} {x['public']} {x['n_people']} insiders ${x['value']/1e6:,.1f}M -> "
              f"30d {x.get('d30_vs_spy', 0):+.1f}%  90d {x['d90_vs_spy']:+.1f}%  180d {x.get('d180_vs_spy') if x.get('d180_vs_spy') is not None else 'n/a'}")

    os.makedirs("public", exist_ok=True)
    json.dump(report, open("public/study-insiders.json", "w"), indent=1, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
