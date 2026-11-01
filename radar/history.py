"""Track record: how stocks did after each kind of signal, vs the S&P 500.

Every run merges the current signals into history.json (published next to
signals.json), then re-prices everything with the same free daily closes.
SPY stands in for the S&P 500.
"""

from __future__ import annotations

import datetime as dt
import json

from .alerts import signal_key
from .prices import close_on_or_before

BENCH = "SPY"
KEEP_DAYS = 400
GROUPS = [
    ("contracts", "Contract wins", lambda e: e["kind"] == "contract"),
    ("contracts_big", "Contract wins scored 70+",
     lambda e: e["kind"] == "contract" and e["score"] >= 70),
    ("contracts_congress", "Contracts where Congress bought first",
     lambda e: e["kind"] == "contract" and e.get("congress_before")),
    ("congress_buys", "Congress purchases",
     lambda e: e["kind"] == "congress" and e.get("type") == "Purchase"),
    ("insider_buys", "Insider buys", lambda e: e["kind"] == "insider"),
]


def load(text: str | None) -> list[dict]:
    if not text:
        return []
    try:
        data = json.loads(text)
        return data.get("entries", []) if isinstance(data, dict) else []
    except ValueError:
        return []


def merge(entries: list[dict], signals: list[dict], today: dt.date) -> list[dict]:
    by_key = {e["key"]: e for e in entries}
    for s in signals:
        if not s.get("trade_date") or not s.get("ticker"):
            continue
        k = signal_key(s)
        if k in by_key:
            by_key[k]["score"] = max(by_key[k]["score"], s["score"])
            continue
        by_key[k] = {
            "key": k, "kind": s["kind"], "ticker": s["ticker"], "date": s["trade_date"],
            "score": s["score"], "headline": s.get("headline", ""),
            "type": s.get("type"), "congress_before": s.get("congress_before"),
            "entry_price": s.get("avg_price") if s["kind"] == "insider" else None,
        }
    floor = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    return sorted((e for e in by_key.values() if e["date"] >= floor),
                  key=lambda e: e["date"], reverse=True)[:5000]


def _close_after(rows, day: str):
    for d, c in rows:
        if d >= day:
            return d, c
    return None


def reprice(entries: list[dict], book) -> None:
    bench = book.history(BENCH)
    for e in entries:
        rows = book.history(e["ticker"])
        then = e.get("entry_price") or close_on_or_before(rows, e["date"])
        b_then = close_on_or_before(bench, e["date"])
        if not rows or not then or not bench or not b_then:
            continue
        now, b_now = rows[-1][1], bench[-1][1]
        e["ret"] = round((now / then - 1) * 100, 2)
        e["vs_spy"] = round(e["ret"] - (b_now / b_then - 1) * 100, 2)
        d30 = (dt.date.fromisoformat(e["date"]) + dt.timedelta(days=30)).isoformat()
        hit, b_hit = _close_after(rows, d30), _close_after(bench, d30)
        if hit and b_hit:
            e["ret_30d"] = round((hit[1] / then - 1) * 100, 2)
            e["vs_spy_30d"] = round(e["ret_30d"] - (b_hit[1] / b_then - 1) * 100, 2)


def summarize(entries: list[dict], min_age_days: int = 5, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    cutoff = (today - dt.timedelta(days=min_age_days)).isoformat()
    out = {"benchmark": "S&P 500 (SPY)", "groups": []}
    for gid, label, pred in GROUPS:
        rows = [e for e in entries if pred(e) and "ret" in e and e["date"] <= cutoff]
        r30 = [e for e in rows if "vs_spy_30d" in e]
        if not rows:
            out["groups"].append({"id": gid, "label": label, "n": 0})
            continue
        out["groups"].append({
            "id": gid, "label": label, "n": len(rows),
            "avg_return": round(sum(e["ret"] for e in rows) / len(rows), 1),
            "avg_vs_spy": round(sum(e["vs_spy"] for e in rows) / len(rows), 1),
            "beat_spy_pct": round(100 * sum(e["vs_spy"] > 0 for e in rows) / len(rows)),
            "n_30d": len(r30),
            "avg_vs_spy_30d": round(sum(e["vs_spy_30d"] for e in r30) / len(r30), 1) if r30 else None,
            "best": max(rows, key=lambda e: e["vs_spy"])["headline"][:120],
            "since": min(e["date"] for e in rows),
        })
    return out
