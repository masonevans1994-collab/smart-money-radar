from radar import sectors


def test_sector_context():
    assert sectors.sector_for("LMT") == "defense"
    assert sectors.sector_for("RKLB", "NASA") == "space"
    assert sectors.sector_for("ZZZZ", "Department of Veterans Affairs") == "health"
    assert sectors.sector_for("ZZZZ", "General Services Administration") == "industrial"
    series = {"ITA": [("2026-10-01", 100.0), ("2026-10-30", 104.0)]}

    class Book:
        def history(self, t): return series.get(t, [])
    sig = [{"kind": "contract", "ticker": "LMT", "trade_date": "2026-10-01", "change_pct": 1.0, "agency": "DoD"}]
    assert sectors.add_sector_context(sig, Book(), log=lambda *_: None) == 1
    assert sig[0]["sector_pct"] == 4.0 and sig[0]["sector"] == "defense and aerospace stocks"
