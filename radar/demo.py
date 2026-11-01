"""Made-up sample data so the dashboard can be previewed without network access.

Every company, ticker, person and trade here is fictional.
"""

import datetime as dt


def _d(days_ago: int) -> str:
    return (dt.date.today() - dt.timedelta(days=days_ago)).isoformat()


def _ins(ticker, company, who, title, officer, director, shares, price,
         before, traded, plan=False):
    return {
        "kind": "insider", "ticker": ticker, "company": company, "who": who,
        "roles": {"title": title, "officer": officer, "director": director,
                  "ten_pct": False},
        "trade_date": _d(traded), "disclosed": _d(traded - 2),
        "shares": shares, "avg_price": price, "value": shares * price,
        "shares_before": before, "shares_after": before + shares,
        "is_10b5_1": plan, "url": "",
    }


def insider_events():
    return [
        _ins("DMRB", "Demo Robotics Inc", "Avery Lin", "Chief Executive Officer",
             True, True, 120_000, 18.40, 95_000, 4),
        _ins("DMRB", "Demo Robotics Inc", "Jordan Pike", "", False, True,
             15_000, 18.55, 40_000, 4),
        _ins("DMRB", "Demo Robotics Inc", "Sam Okafor", "Chief Financial Officer",
             True, False, 22_000, 18.10, 60_000, 3),
        _ins("SNDL", "Sandlot Energy Co", "Riley Moreno", "", False, True,
             250_000, 6.20, 0, 5),
        _ins("QRTZ", "Quartzline Semiconductors", "Morgan Hale", "President",
             True, False, 9_000, 142.00, 310_000, 2),
        _ins("BRKW", "Brookway Foods", "Casey Grant", "VP Operations",
             True, False, 2_000, 31.75, 18_000, 6, plan=True),
    ]


def _con(who, district, ticker, typ, low, high, traded, disclosed,
         owner="Self", asset="ST"):
    return {
        "kind": "congress", "who": who, "district": district, "ticker": ticker,
        "type": typ, "amount_low": low, "amount_high": high, "owner": owner,
        "asset_type": asset, "trade_date": _d(traded), "notified_date": _d(traded - 3),
        "disclosed": _d(disclosed), "url": "",
    }


def congress_trades():
    return [
        _con("Hon. Dana Example", "ZZ01", "QRTZ", "Purchase", 250_001, 500_000,
             20, 3, owner="Spouse", asset="OP"),
        _con("Hon. Lee Sample", "ZZ04", "QRTZ", "Purchase", 15_001, 50_000, 18, 5),
        _con("Hon. Pat Placeholder", "ZZ07", "SNDL", "Purchase", 1_001, 15_000, 70, 6),
        _con("Hon. Dana Example", "ZZ01", "BRKW", "Sale (partial)", 50_001, 100_000,
             30, 3, owner="Spouse"),
    ]


def contract_awards():
    def a(ticker, company, value, agency, days_ago, desc, source="DoD announcement"):
        return {"kind": "contract", "source": source, "ticker": ticker, "company": company,
                "who": company, "recipient": company, "parent": "", "value": value,
                "agency": "Department of Defense", "sub_agency": agency,
                "award_date": _d(days_ago), "trade_date": _d(days_ago), "disclosed": _d(days_ago),
                "award_id": "DEMO-0001", "description": desc, "url": ""}
    out = [
        a("QRTZ", "Quartzline Semiconductors", 480e6, "Air Force", 2,
          "Radiation-hardened processors for satellite programs (demo)."),
        a("DMRB", "Demo Robotics Inc", 1.2e9, "Army", 1,
          "Autonomous ground vehicles, five-year contract (demo)."),
        a("SNDL", "Sandlot Energy Co", 65e6, "Defense Logistics Agency", 5,
          "Fuel supply for domestic bases (demo).", source="USAspending"),
    ]
    sizes = {"QRTZ": (2.1e9, 41.80, 38.20), "DMRB": (3.4e9, 19.95, 18.40), "SNDL": (6.2e9, 6.05, 6.20)}
    for c in out:
        cap, now, then = sizes[c["ticker"]]
        c.update(market_cap=cap, award_pct=round(c["value"] / cap * 100, 2), price_now=now,
                 price_then=then, price_date=_d(0), change_pct=round((now - then) / then * 100, 1))
        steps = 24
        c["spark"] = [round(then * (0.97 + 0.01 * ((i * 7) % 5)) if i < 8 else
                            then + (now - then) * (i - 8) / (steps - 9) + then * 0.006 * ((i * 3) % 4 - 1.5), 2)
                      for i in range(steps)]
        c["spark_mark"] = 8
    for c, (lab, pct) in zip(out, [("defense and aerospace stocks", 2.1), ("defense and aerospace stocks", 1.4), ("energy stocks", -0.6)]):
        c["sector"], c["sector_pct"] = lab, pct
    out[0]["history"] = {"n": 11, "verdict": "After its last 11 big awards, this stock beat the market over the next month 73% of the time, by +4.4% on average. On the day itself it moved +0.6% on average.",
                         "windows": {"1": {"n": 11, "avg_vs_spy": 0.6, "median_vs_spy": 0.3, "beat_pct": 64, "avg_raw": 0.7},
                                     "30": {"n": 11, "avg_vs_spy": 4.4, "median_vs_spy": 3.1, "beat_pct": 73, "avg_raw": 6.0}},
                         "closest": {"date": _d(140), "value": 410e6, "agency": "Department of Defense", "d1": 1.2, "d30": 9.8, "d30_vs_spy": 7.1}}
    out[1]["history"] = {"n": 25, "verdict": "After its last 25 big awards, this stock usually trailed the market over the next month (36% of the time it beat it; -1.4% on average). On the day itself it moved -0.4% on average.",
                         "windows": {"1": {"n": 25, "avg_vs_spy": -0.2, "median_vs_spy": 0.05, "beat_pct": 64, "avg_raw": -0.4},
                                     "30": {"n": 25, "avg_vs_spy": -1.4, "median_vs_spy": -1.1, "beat_pct": 36, "avg_raw": 1.8}},
                         "closest": {"date": _d(71), "value": 1.1e9, "agency": "Department of Defense", "d1": -0.8, "d30": -4.1, "d30_vs_spy": -9.2}}
    return out


def track_record():
    g = lambda gid, label, n, ret, vs, beat, v30: {
        "id": gid, "label": label, "n": n, "avg_return": ret, "avg_vs_spy": vs,
        "beat_spy_pct": beat, "n_30d": n // 2, "avg_vs_spy_30d": v30,
        "best": "Demo Robotics Inc (DMRB) won $1.2B from Army", "since": _d(120)}
    return {"benchmark": "S&P 500 (SPY)", "demo": True, "groups": [
        g("contracts", "Contract wins", 48, 4.1, 1.9, 56, 1.2),
        g("contracts_big", "Contract wins scored 70+", 11, 9.8, 6.7, 73, 4.4),
        g("contracts_congress", "Contracts where Congress bought first", 4, 12.5, 9.1, 75, None),
        g("congress_buys", "Congress purchases", 130, 3.0, 0.4, 51, 0.2),
        g("insider_buys", "Insider buys", 0, 0, 0, 0, None),
    ]}
