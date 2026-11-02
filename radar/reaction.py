"""How a company's stock has reacted to its past federal contract awards.

For each award of at least `min_amount` in the last `years`, measure the
stock's move from the close before the award to 1, 5 and 30 trading days
after, minus the S&P 500 (SPY) move over the same window. All data is
public: USAspending for awards, daily closes for prices.
"""

from __future__ import annotations

import datetime as dt
import statistics
from bisect import bisect_left

from .contracts import USASPENDING, _post_json

WINDOWS = (1, 5, 30)


def awards_body(name: str, since: dt.date, until: dt.date, min_amount: float, page: int) -> dict:
    return {
        "filters": {
            "award_type_codes": ["A", "B", "C", "D"],
            "recipient_search_text": [name],
            "time_period": [{"start_date": since.isoformat(), "end_date": until.isoformat()}],
            "award_amounts": [{"lower_bound": min_amount}],
        },
        # "Base Obligation Date" is when the deal was actually signed; "Start Date" is
        # when the work begins, which is often a fiscal placeholder like Jan 1 or Oct 1.
        "fields": ["Award ID", "Recipient Name", "Award Amount", "Start Date", "Base Obligation Date",
                   "Awarding Agency", "Description"],
        "sort": "Start Date", "order": "desc", "limit": 100, "page": page,
    }


def fetch_awards(name: str, user_agent: str, years: int = 3, min_amount: float = 25e6,
                 today: dt.date | None = None, post=_post_json, max_pages: int = 5) -> list[dict]:
    today = today or dt.date.today()
    since = today - dt.timedelta(days=365 * years)
    out = []
    for page in range(1, max_pages + 1):
        data = post(USASPENDING, awards_body(name, since, today, min_amount, page), user_agent)
        for r in data.get("results", []):
            signed = (r.get("Base Obligation Date") or r.get("Start Date") or "")[:10]
            if page == 1 and not out and not r.get("Base Obligation Date"):
                print(f"  past awards: no Base Obligation Date in results (keys: {sorted(r)[:8]})")
            if r.get("Award Amount") and signed:
                out.append({"date": signed, "value": float(r["Award Amount"]),
                            "agency": r.get("Awarding Agency") or "", "id": r.get("Award ID"),
                            "recipient": r.get("Recipient Name") or "",
                            "description": (r.get("Description") or "")[:120]})
        if not data.get("page_metadata", {}).get("hasNext"):
            break
    return out


def _index_on_or_before(days: list[str], day: str) -> int | None:
    i = bisect_left(days, day)
    if i < len(days) and days[i] == day:
        return i
    return i - 1 if i > 0 else None


def reactions(awards: list[dict], prices: list[tuple[str, float]],
              bench: list[tuple[str, float]], windows=WINDOWS) -> list[dict]:
    """Per-award price moves (%) vs the benchmark; skips awards without data."""
    if not prices or not bench:
        return []
    p_days = [d for d, _ in prices]
    b_days = [d for d, _ in bench]
    out = []
    for a in awards:
        i0 = _index_on_or_before(p_days, a["date"])
        j0 = _index_on_or_before(b_days, a["date"])
        if i0 is None or j0 is None or i0 == 0:
            continue
        base, bbase = prices[i0 - 1][1], bench[j0 - 1][1]  # close before the award day
        row = {**a}
        for w in windows:
            i, j = i0 + w - 1, j0 + w - 1
            if i >= len(prices) or j >= len(bench):
                row[f"d{w}"] = None
                continue
            move = (prices[i][1] / base - 1) * 100
            bmove = (bench[j][1] / bbase - 1) * 100
            row[f"d{w}"] = round(move, 2)
            row[f"d{w}_vs_spy"] = round(move - bmove, 2)
        out.append(row)
    return out


def summarize(rows: list[dict], windows=WINDOWS) -> dict:
    """Averages, medians and hit rates per window, plus a plain-English verdict."""
    out = {"n": len(rows), "windows": {}}
    for w in windows:
        vals = [r[f"d{w}_vs_spy"] for r in rows if r.get(f"d{w}_vs_spy") is not None]
        if not vals:
            continue
        out["windows"][w] = {
            "n": len(vals),
            "avg_vs_spy": round(statistics.mean(vals), 2),
            "median_vs_spy": round(statistics.median(vals), 2),
            "beat_pct": round(100 * sum(v > 0 for v in vals) / len(vals)),
            "avg_raw": round(statistics.mean(r[f"d{w}"] for r in rows if r.get(f"d{w}") is not None), 2),
        }
    big = sorted(rows, key=lambda r: r["value"], reverse=True)[:5]
    out["biggest"] = [{"date": r["date"], "value": r["value"], "agency": r["agency"],
                       "d30_vs_spy": r.get("d30_vs_spy")} for r in big]
    out["verdict"] = verdict(out)
    return out


def verdict(summary: dict) -> str:
    w30 = summary["windows"].get(30)
    w1 = summary["windows"].get(1)
    n = summary["n"]
    if not w30 or w30["n"] < 5:
        return "Not enough past awards to say what usually happens."
    beat, avg = w30["beat_pct"], w30["avg_vs_spy"]
    day1 = f" On the day itself it moved {w1['avg_raw']:+.1f}% on average." if w1 else ""
    if beat >= 60 and avg >= 1:
        return (f"After its last {n} big awards, this stock beat the market over the next month "
                f"{beat}% of the time, by {avg:+.1f}% on average.{day1}")
    if beat <= 40 and avg <= -1:
        return (f"After its last {n} big awards, this stock usually trailed the market over the next "
                f"month ({beat}% of the time it beat it; {avg:+.1f}% on average).{day1}")
    return (f"After its last {n} big awards, this stock moved about like the market over the next "
            f"month ({beat}% beat it; {avg:+.1f}% on average). Contracts alone haven't moved it much.{day1}")


# ---------- per-company history for the feed ----------

STOP = {"the", "inc", "inc.", "corp", "corp.", "corporation", "co", "co.", "company", "plc", "llc",
        "ltd", "holdings", "group", "international", "technologies", "industries", "usa", "u.s."}


def search_name(listed: str) -> str:
    """USAspending's recipient search matches best on the distinctive first word(s):
    'Fluor Corporation' -> 'Fluor'; 'L3Harris Technologies, Inc.' -> 'L3Harris';
    'General Dynamics Corporation' -> 'General Dynamics'."""
    words = [w.strip(",.") for w in listed.split(" (")[0].split()]
    keep = []
    for w in words:
        if w.lower().strip(",.") in STOP and keep:
            break
        if w.lower().strip(",.") not in STOP:
            keep.append(w)
        if len(keep) == 2:
            break
    return " ".join(keep) or listed


def closest_match(rows: list[dict], value: float, exclude_id: str | None = None) -> dict | None:
    """The past award nearest in size that has a 30-day result."""
    pool = [r for r in rows if r.get("d30_vs_spy") is not None and r.get("id") != exclude_id]
    if not pool:
        return None
    return min(pool, key=lambda r: abs(r["value"] - value) / max(value, 1))


def company_history(contracts: list[dict], user_agent: str, book, min_amount: float = 25e6,
                    years: int = 3, max_companies: int = 25, cache=None, log=print) -> int:
    """Attach `history` (pattern + closest match) to each contract signal."""
    from .contract_context import ContextCache

    cache = cache or ContextCache()
    bench = book.history("SPY")
    today = dt.date.today()
    done, seen = 0, {}
    for c in sorted(contracts, key=lambda x: x["score"], reverse=True):
        t = c["ticker"]
        if t in seen:
            summ, rows = seen[t]
        else:
            if len(seen) >= max_companies:
                continue
            name = search_name(c.get("company") or c.get("recipient") or "")
            key = f"reaction|{name}|{min_amount}"
            awards = cache.get(key)
            if awards is None:
                try:
                    awards = fetch_awards(name, user_agent, years, min_amount, today)
                    cache.put(key, awards)
                except Exception as e:  # noqa: BLE001
                    log(f"  history lookup failed for {name}: {type(e).__name__}")
                    seen[t] = (None, [])
                    continue
            rows = reactions(awards, book.history(t), bench)
            summ = summarize(rows) if rows else None
            seen[t] = (summ, rows)
        if not summ:
            continue
        match = closest_match(rows, c["value"], c.get("award_id"))
        recent = sorted(rows, key=lambda r: r["date"], reverse=True)[:12]
        windows = {w: {k: v for k, v in d.items() if k in ("n", "avg_vs_spy", "beat_pct")}
                   for w, d in summ["windows"].items() if w in (1, 30)}
        c["history"] = {
            "n": summ["n"], "verdict": summ["verdict"],
            "windows": windows,
            "awards": [{"date": r["date"], "value": round(r["value"]), "agency": r["agency"],
                        "d30": r.get("d30"), "d30_vs_spy": r.get("d30_vs_spy")} for r in recent],
            "closest": ({"date": match["date"], "value": round(match["value"]), "agency": match["agency"],
                         "d1": match.get("d1"), "d30": match.get("d30"), "d30_vs_spy": match["d30_vs_spy"]}
                        if match else None),
        }
        done += 1
    log(f"  company history: {done} contracts got past-award context ({len(seen)} companies)")
    return done
