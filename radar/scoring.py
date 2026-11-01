"""Rank signals 0-100 and explain each score in plain English.

The scores are deliberately simple and transparent so users (and you) can
see why something ranked high. Tune the weights here.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict

STOCK_ACT_DAYS = 45


def _money(v: float) -> str:
    if v >= 1e9:
        return f"${v / 1e9:.1f}B"
    if v >= 1e6:
        return f"${v / 1e6:.1f}M"
    if v >= 1e3:
        return f"${v / 1e3:.0f}K"
    return f"${v:,.0f}"


def _role(roles: dict) -> tuple[int, str]:
    title = (roles.get("title") or "").lower()
    if any(k in title for k in ("chief executive", "ceo", "president", "chair")):
        return 25, roles["title"] or "CEO"
    if any(k in title for k in ("chief financial", "cfo", "coo", "chief operating")):
        return 20, roles["title"]
    if roles.get("officer"):
        return 15, roles.get("title") or "Officer"
    if roles.get("director"):
        return 10, "Director"
    if roles.get("ten_pct"):
        return 5, "10% owner"
    return 3, "Insider"


def score_insider(events: list[dict]) -> list[dict]:
    buyers = defaultdict(set)
    for e in events:
        buyers[e["ticker"]].add(e["who"])

    out = []
    for e in events:
        score, why = 0, []
        v = e["value"] or 0
        pts = 40 if v >= 10e6 else 30 if v >= 1e6 else 20 if v >= 250e3 \
            else 10 if v >= 50e3 else 5
        score += pts
        why.append(f"Bought {_money(v)} of stock on the open market")

        pts, label = _role(e["roles"])
        score += pts
        e["role_label"] = label
        if pts >= 15:
            why.append(f"Buyer is the {label}, who knows the business best")

        before, shares = e.get("shares_before"), e["shares"]
        if before is not None and before <= 0:
            score += 15
            why.append("Brand-new position for this insider")
        elif before:
            pct = shares / before * 100
            e["pct_increase"] = round(pct, 1)
            if pct >= 100:
                score += 15
                why.append(f"More than doubled their stake (+{pct:.0f}%)")
            elif pct >= 25:
                score += 10
                why.append(f"Grew their stake by {pct:.0f}%")
            elif pct >= 10:
                score += 5

        n = len(buyers[e["ticker"]])
        if n >= 3:
            score += 20
            why.append(f"Cluster buy: {n} insiders bought {e['ticker']} recently")
        elif n == 2:
            score += 10
            why.append(f"2 insiders bought {e['ticker']} recently")

        if e.get("is_10b5_1"):
            score -= 10
            why.append("Pre-scheduled (10b5-1) plan, so less of a signal")

        e["score"] = max(0, min(100, score))
        e["reasons"] = why
        e["headline"] = f"{e['who']} ({label}) bought {_money(v)} of {e['ticker']}"
        out.append(e)
    return sorted(out, key=lambda x: x["score"], reverse=True)


def score_congress(trades: list[dict]) -> list[dict]:
    members = defaultdict(set)
    for t in trades:
        members[(t["ticker"], t["type"].split()[0])].add(t["who"])

    out = []
    for t in trades:
        score, why = 0, []
        low, high = t["amount_low"], t["amount_high"]
        mid = (low + high) / 2 if high else low * 1.5
        rng = f"{_money(low)}–{_money(high)}" if high else f"over {_money(low)}"
        pts = 35 if mid >= 1e6 else 25 if mid >= 250e3 else 15 if mid >= 50e3 \
            else 10 if mid >= 15e3 else 5
        score += pts
        verb = t["type"].split()[0].lower()
        verb = {"purchase": "bought", "sale": "sold", "exchange": "exchanged"}[verb]
        why.append(f"{t['owner'] if t['owner'] != 'Self' else 'Member'} {verb} {rng}")

        if t["type"] == "Purchase":
            score += 15
        else:
            score += 5

        if t.get("asset_type") == "OP":
            score += 10
            why.append("Options trade: leveraged, short-dated bet")

        n = len(members[(t["ticker"], t["type"].split()[0])])
        if n >= 3:
            score += 20
            why.append(f"{n} members made the same move in {t['ticker']}")
        elif n == 2:
            score += 10
            why.append(f"2 members made the same move in {t['ticker']}")

        if t.get("trade_date") and t.get("disclosed"):
            lag = (dt.date.fromisoformat(t["disclosed"])
                   - dt.date.fromisoformat(t["trade_date"])).days
            t["lag_days"] = lag
            if lag > STOCK_ACT_DAYS:
                score += 10
                why.append(f"Disclosed {lag} days after the trade (limit is 45)")

        t["score"] = max(0, min(100, score))
        t["reasons"] = why
        t["value_mid"] = mid
        whose = f" ({t['owner'].lower()})" if t["owner"] != "Self" else ""
        t["headline"] = f"{t['who']}{whose} {verb} {rng} of {t['ticker']}"
        out.append(t)
    return sorted(out, key=lambda x: x["score"], reverse=True)


def cross_signal(insiders: list[dict], congress: list[dict]) -> None:
    """Boost tickers that both corporate insiders and Congress are buying."""
    ins_buys = {e["ticker"] for e in insiders}
    con_buys = {t["ticker"] for t in congress if t["type"] == "Purchase"}
    both = ins_buys & con_buys
    for x in insiders + congress:
        if x["ticker"] in both and (x["kind"] == "insider" or x["type"] == "Purchase"):
            x["score"] = min(100, x["score"] + 15)
            x["reasons"].append("Company insiders AND members of Congress are both buying")
    insiders.sort(key=lambda x: x["score"], reverse=True)
    congress.sort(key=lambda x: x["score"], reverse=True)
