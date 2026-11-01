"""Is this award unusual for the company? Compare it with the winner's own
federal contract history (USAspending, last 3 years).

One small query per matched winner, cached on disk for the day so the
30-minute schedule doesn't repeat it.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path

from .contracts import USASPENDING, _post_json

YEARS = 3


def history_body(name: str, today: dt.date) -> dict:
    return {
        "filters": {
            "award_type_codes": ["A", "B", "C", "D"],
            "recipient_search_text": [name],
            "time_period": [{"start_date": (today - dt.timedelta(days=365 * YEARS)).isoformat(),
                             "end_date": today.isoformat()}],
            "award_amounts": [{"lower_bound": 1_000_000}],
        },
        "fields": ["Award ID", "Award Amount"],
        "sort": "Award Amount", "order": "desc", "limit": 100, "page": 1,
    }


def describe(value: float, history: list[float]) -> tuple[int, str] | None:
    """Score bonus and plain-English context for an award vs past awards."""
    past = sorted(history, reverse=True)
    n = len(past)
    if n <= 2:
        return 10, f"Rare win: only {n} other federal contract{'s' if n != 1 else ''} of $1M+ in {YEARS} years"
    bigger = sum(v > value * 1.0001 for v in past)
    if bigger == 0:
        return 15, f"Largest federal contract this company has won in {YEARS} years"
    if bigger / n <= 0.05:
        return 10, f"In the top 5% of this company's {n}+ contracts over {YEARS} years"
    median = past[n // 2]
    if value < median:
        return -5, f"Routine size for this company (it has won {n}+ contracts over {YEARS} years)"
    return None


class ContextCache:
    def __init__(self, cache_dir: str | Path = ".cache", today: dt.date | None = None):
        self.dir = Path(cache_dir) / "contract-context"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.today = today or dt.date.today()

    def _path(self, name: str) -> Path:
        h = hashlib.sha256(f"{name}|{self.today}".encode()).hexdigest()[:24]
        return self.dir / f"{h}.json"

    def get(self, name: str):
        p = self._path(name)
        return json.loads(p.read_text()) if p.exists() else None

    def put(self, name: str, values: list[float]) -> None:
        self._path(name).write_text(json.dumps(values))


def add_context(contracts: list[dict], user_agent: str, cache: ContextCache | None = None,
                post=_post_json, max_lookups: int = 25, log=print) -> int:
    """Adjust contract scores with company-history context. Returns lookups made."""
    cache = cache or ContextCache()
    looked, done = 0, 0
    for c in contracts:
        name = (c.get("recipient") or c.get("company") or "").strip()
        if not name or c.get("source") == "Company 8-K" or c.get("is_modification"):
            # 8-K names are parent companies; expansions of one long-running
            # contract would make any company look like a "rare" winner.
            continue
        values = cache.get(name)
        if values is None:
            if looked >= max_lookups:
                continue
            looked += 1
            try:
                data = post(USASPENDING, history_body(name, cache.today), user_agent)
                values = [float(r.get("Award Amount") or 0) for r in data.get("results", [])]
                cache.put(name, values)
            except Exception as e:  # noqa: BLE001
                log(f"  history lookup failed for {name}: {type(e).__name__}")
                continue
        # Drop this award itself from its own history when we can see it.
        hist = list(values)
        if c.get("value") in hist:
            hist.remove(c["value"])
        ctx = describe(c["value"], hist)
        if ctx:
            pts, why = ctx
            c["score"] = max(0, min(100, c["score"] + pts))
            c["reasons"].insert(1, why)
            c["history_note"] = why
            done += 1
    contracts.sort(key=lambda x: x["score"], reverse=True)
    log(f"  company history: context added to {done} of {len(contracts)} awards ({looked} lookups)")
    return looked
