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


def test_closest_match_and_company_history():
    rows = [{"id": "A", "value": 1e8, "d30_vs_spy": 2.0, "date": "2026-01-10", "agency": "Navy"},
            {"id": "B", "value": 3e8, "d30_vs_spy": -1.0, "date": "2026-02-10", "agency": "Army"},
            {"id": "C", "value": 2.9e8, "d30_vs_spy": None, "date": "2026-03-10", "agency": "Army"}]
    assert reaction.closest_match(rows, 2.8e8)["id"] == "B"
    assert reaction.closest_match(rows, 2.8e8, exclude_id="B")["id"] == "A"

    days = [f"2026-{m:02d}-{d:02d}" for m in (1, 2) for d in range(1, 29)]
    series = [(d, 100 + i) for i, d in enumerate(days)]

    class Book:
        def history(self, t): return series

    class Cache:
        store = {}
        def get(self, k): return self.store.get(k)
        def put(self, k, v): self.store[k] = v
    cache = Cache()
    cache.put("reaction|Fluor|25000000.0",
              [{"date": "2026-01-10", "value": 5e7, "agency": "Navy", "id": "X"},
               {"date": "2026-01-12", "value": 6e7, "agency": "Navy", "id": "Y"}])
    cs = [{"ticker": "FLR", "company": "Fluor Corporation", "value": 5.5e7, "score": 40, "award_id": "Z"}]
    assert reaction.company_history(cs, "ua", Book(), cache=cache, log=lambda *_: None) == 1
    assert cs[0]["history"]["closest"]["value"] in (5e7, 6e7) and cs[0]["history"]["n"] == 2


def test_search_name():
    assert reaction.search_name("Fluor Corporation") == "Fluor"
    assert reaction.search_name("L3Harris Technologies, Inc.") == "L3Harris"
    assert reaction.search_name("Accenture plc") == "Accenture"
    assert reaction.search_name("General Dynamics Corporation") == "General Dynamics"
    assert reaction.search_name("Honeywell International Inc.") == "Honeywell"
    assert reaction.search_name("The Boeing Company") == "Boeing"


def test_fetch_awards_uses_the_signing_date():
    from radar import reaction
    def post(url, body, ua):
        return {"results": [{"Award Amount": 5e7, "Start Date": "2026-01-01", "Base Obligation Date": "2025-12-18",
                             "Awarding Agency": "Department of Defense"}],
                "page_metadata": {"hasNext": False}}
    out = reaction.fetch_awards("Honeywell", "ua", post=post)
    assert out[0]["date"] == "2025-12-18"
