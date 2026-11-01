import datetime as dt

from radar import contract_context as cc


def test_describe():
    assert cc.describe(5e8, [1e8, 2e8, 3e8])[0] == 15                  # biggest
    assert cc.describe(5e7, [1e7])[1].startswith("Rare win: only 1 other")
    hist = [1e9] + [1e7] * 40
    assert cc.describe(6e8, hist)[0] == 10                               # top 5%
    assert cc.describe(5e6, hist)[0] == -5                               # routine
    assert cc.describe(2e8, [3e8, 1e8, 1e8, 5e7, 5e7]) is None            # unremarkable


def test_add_context_uses_cache(tmp_path):
    calls = []

    def post(url, body, ua):
        calls.append(body["filters"]["recipient_search_text"][0])
        return {"results": [{"Award Amount": 3e8}, {"Award Amount": 1e8}, {"Award Amount": 2e7}, {"Award Amount": 1e7}]}
    cache = cc.ContextCache(tmp_path, dt.date(2026, 11, 1))
    cs = [{"recipient": "ROCKET LAB USA INC", "value": 3e8, "score": 30, "reasons": ["won"], "source": "USAspending"}]
    cc.add_context(cs, "ua", cache, post=post, log=lambda *_: None)
    assert cs[0]["score"] == 45 and "Biggest government contract" in cs[0]["reasons"][1]
    cs2 = [{"recipient": "ROCKET LAB USA INC", "value": 1e6, "score": 30, "reasons": ["won"], "source": "USAspending"}]
    cc.add_context(cs2, "ua", cache, post=post, log=lambda *_: None)
    assert calls == ["ROCKET LAB USA INC"]                               # second call served from cache
    assert cs2[0]["score"] == 25
