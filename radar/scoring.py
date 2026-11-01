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


def score_contracts(contracts: list[dict], congress: list[dict],
                    insiders: list[dict]) -> list[dict]:
    """Rank contract awards; flag Congress members who traded the stock first."""
    wins = defaultdict(int)
    for c in contracts:
        wins[c["ticker"]] += 1
    out = []
    for c in contracts:
        score, why = 0, []
        v = c["value"]
        score += 40 if v >= 1e9 else 30 if v >= 250e6 else 22 if v >= 100e6 \
            else 15 if v >= 50e6 else 8
        agency = c.get("sub_agency") or c.get("agency") or "the government"
        what = "add-on to an existing contract" if c.get("is_modification") else "contract"
        why.append(f"Won a {_money(v)} {what} from {agency}")
        if c.get("source") == "DoD announcement":
            score += 5
            why.append("Announced by the Pentagon the same day it was signed")
        elif c.get("source") == "Company 8-K":
            score += 5
            why.append("The company announced it in an official SEC filing")
        if wins[c["ticker"]] >= 2:
            score += 10
            why.append(f"{c['ticker']} won {wins[c['ticker']]} government contracts this month")

        award_day = c.get("award_date")
        buyers = []
        for t in congress:
            if t["ticker"] != c["ticker"] or not t.get("trade_date") or not award_day:
                continue
            gap = (dt.date.fromisoformat(award_day) - dt.date.fromisoformat(t["trade_date"])).days
            if 0 <= gap <= 90 and t["type"] == "Purchase":
                buyers.append((gap, t["who"], t.get("chamber")))
        if buyers:
            gap, who, _ = min(buyers)
            score += 25
            more = f" (+{len(buyers) - 1} more)" if len(buyers) > 1 else ""
            why.append(f"{who} bought {c['ticker']} stock {gap} days before this award{more}")
            c["congress_before"] = len(buyers)
            c["_buyers"] = sorted(buyers)
        if any(e["ticker"] == c["ticker"] for e in insiders):
            score += 10
            why.append("The company's own executives have been buying its stock")

        c["score"] = max(0, min(100, score))
        c["reasons"] = why
        c["headline"] = (f"{c['company']} ({c['ticker']}) won {_money(v)} "
                         f"{'more ' if c.get('is_modification') else ''}from {agency}")
        out.append(c)
    return sorted(out, key=lambda x: x["score"], reverse=True)


def size_adjust(contracts: list[dict]) -> None:
    """Re-score contracts by award size relative to company market value."""
    for c in contracts:
        pct, cap = c.get("award_pct"), c.get("market_cap")
        if pct is None or not cap:
            continue
        if pct >= 10:
            pts, why = 30, f"Huge for this company: the award equals {pct:.0f}% of what the whole company is worth"
        elif pct >= 3:
            pts, why = 20, f"Big for this company: equal to {pct:.1f}% of its total value ({_money(cap)})"
        elif pct >= 1:
            pts, why = 10, f"Noticeable: {pct:.1f}% of the company's {_money(cap)} total value"
        elif pct < 0.1:
            pts, why = -10, f"Small for a company worth {_money(cap)}"
        else:
            pts, why = 0, f"{pct:.2f}% of the company's {_money(cap)} total value"
        c["score"] = max(0, min(100, c["score"] + pts))
        c["reasons"].insert(1, why)
    contracts.sort(key=lambda x: x["score"], reverse=True)


def committee_flags(contracts: list[dict], roster) -> None:
    """Flag contract awards where a member who bought the stock beforehand sits
    on a committee overseeing the agency that awarded the contract."""
    from .committees import overseeing, short
    for c in contracts:
        buyers = c.pop("_buyers", [])
        if roster is None or not buyers:
            continue
        agency = f"{c.get('agency', '')} {c.get('sub_agency', '')}"
        for gap, who, chamber in buyers:
            hits = overseeing(roster.committees(who, chamber), agency)
            if hits:
                c["score"] = min(100, c["score"] + 15)
                c["committee_flag"] = f"{who} · {short(hits[0])}"
                c["reasons"].insert(1, f"{who} sits on {short(hits[0])}, which oversees "
                                       f"{c.get('sub_agency') or c.get('agency')}, "
                                       f"and bought {c['ticker']} {gap} days before this award")
                break
    for c in contracts:
        c.pop("_buyers", None)
    contracts.sort(key=lambda x: x["score"], reverse=True)
