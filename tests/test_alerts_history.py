import datetime as dt
import json

from radar import alerts, history


def sig(kind, ticker, score, value=1e8, date="2026-10-01", **kw):
    return {"kind": kind, "ticker": ticker, "who": ticker + " Co", "trade_date": date,
            "value": value, "score": score, "headline": f"{ticker} won", "reasons": ["a", "b", "c"], **kw}


def test_pick_new_and_send():
    old = sig("contract", "LMT", 90)
    prev = alerts.previous_keys(json.dumps({"contracts": [old], "insiders": [], "congress": []}))
    now = [old, sig("contract", "HII", 65), sig("contract", "AVAV", 40),
           sig("insider", "XYZ", 80), sig("insider", "ABC", 90)]
    picked = alerts.pick_new(now, prev)
    assert [s["ticker"] for s in picked] == ["ABC", "HII"]
    assert alerts.pick_new(now, None) == []  # no baseline -> no flood

    posts = []
    n = alerts.send(picked, "https://app", env={"DISCORD_WEBHOOK_URL": "https://discord/x",
                                                "TELEGRAM_BOT_TOKEN": "T", "TELEGRAM_CHAT_ID": "9"},
                    post=lambda url, p: posts.append((url, p)), log=lambda *_: None)
    assert n == 2 and len(posts) == 4
    assert posts[0][1]["content"].startswith("💼 ABC · score 90")
    assert posts[1][0] == "https://api.telegram.org/botT/sendMessage"
    assert alerts.send(picked, env={}, log=lambda *_: None) == 0


def test_history_merge_reprice_summary():
    entries = history.merge([], [sig("contract", "LMT", 75, congress_before=1),
                                 sig("contract", "HII", 40)], dt.date(2026, 11, 1))
    assert len(entries) == 2
    entries = history.merge(entries, [sig("contract", "LMT", 80, congress_before=1)], dt.date(2026, 11, 1))
    assert len(entries) == 2 and next(e for e in entries if e["ticker"] == "LMT")["score"] == 80

    series = {
        "SPY": [("2026-10-01", 500.0), ("2026-10-31", 510.0), ("2026-11-02", 515.0)],
        "LMT": [("2026-10-01", 100.0), ("2026-10-31", 110.0), ("2026-11-02", 120.0)],
        "HII": [("2026-10-01", 200.0), ("2026-11-02", 190.0)],
    }

    class Book:
        def history(self, t):
            return series.get(t, [])
    history.reprice(entries, Book())
    lmt = next(e for e in entries if e["ticker"] == "LMT")
    assert lmt["ret"] == 20.0 and lmt["vs_spy"] == 17.0
    assert lmt["ret_30d"] == 10.0 and lmt["vs_spy_30d"] == 8.0
    summ = history.summarize(entries, today=dt.date(2026, 11, 2))
    g = {x["id"]: x for x in summ["groups"]}
    assert g["contracts"]["n"] == 2 and g["contracts"]["beat_spy_pct"] == 50
    assert g["contracts_big"]["n"] == 1 and g["contracts_big"]["avg_vs_spy"] == 17.0
    assert g["contracts_congress"]["n"] == 1
    assert g["insider_buys"]["n"] == 0


def test_weekly_digest():
    cs = [{"ticker": "HON", "company": "Honeywell", "value": 323e6, "trade_date": "2026-10-30", "change_pct": 0.0},
          {"ticker": "FLR", "company": "Fluor", "value": 372e6, "trade_date": "2026-10-27", "change_pct": 1.0},
          {"ticker": "OLD", "company": "Old", "value": 9e9, "trade_date": "2026-09-01", "change_pct": 5.0}]
    d = alerts.weekly_digest(cs, dt.date(2026, 11, 1), "https://app")
    assert "2 contracts worth $695M went to 2 public companies." in d
    assert "• $372M to Fluor (FLR) (stock +1.0% since)" in d
    assert "Best mover: FLR +1.0%" in d and "Worst mover: HON +0.0%" in d
    assert alerts.weekly_digest([], dt.date(2026, 11, 1)) is None
    assert alerts.format_alert({"kind": "digest", "headline": d}) == d
