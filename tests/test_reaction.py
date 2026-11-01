from radar import reaction


def series(start_vals):
    return [(f"2026-{m:02d}-{d:02d}", v) for (m, d), v in start_vals]


def test_reactions_and_summary():
    days = [(1, i) for i in range(1, 32)] + [(2, i) for i in range(1, 29)]
    prices = [(f"2026-{m:02d}-{d:02d}", 100 + i) for i, (m, d) in enumerate(days)]       # +1/day
    bench = [(f"2026-{m:02d}-{d:02d}", 100 + i * 0.5) for i, (m, d) in enumerate(days)]  # +0.5/day
    awards = [{"date": "2026-01-10", "value": 5e7, "agency": "Navy", "id": "A"},
              {"date": "2026-01-03", "value": 9e7, "agency": "Army", "id": "B"},  # weekend-ish still fine
              {"date": "2025-12-01", "value": 1e7, "agency": "X", "id": "C"}]     # before data: skipped
    rows = reaction.reactions(awards, prices, bench)
    assert [r["id"] for r in rows] == ["A", "B"]
    a = rows[0]
    assert a["d1"] == round((109 / 108 - 1) * 100, 2)         # award day close 109 vs prior close 108
    assert a["d1_vs_spy"] > 0 and a["d30_vs_spy"] > a["d5_vs_spy"] > 0
    s = reaction.summarize(rows)
    assert s["n"] == 2 and s["windows"][30]["beat_pct"] == 100
    assert "Not enough" in s["verdict"]
    many = reaction.summarize(rows * 3)
    assert "beat the market" in many["verdict"]
