import datetime as dt

from radar import prices, senate

ROWS = [
    ["Jane", "Example", "Example, Jane (Senator)",
     '<a href="/search/view/ptr/abc-123/" target="_blank">Periodic Transaction Report for 10/20/2026</a>',
     "10/21/2026"],
    ["John", "Sample", "Sample, John (Senator)",
     '<a href="/search/view/paper/def-456/" target="_blank">Periodic Transaction Report</a>',
     "10/22/2026"],
]

PTR_HTML = """<table class="table"><thead><tr><th>#</th></tr></thead><tbody>
<tr><td>1</td><td>10/01/2026</td><td>Spouse</td>
<td><a href="https://finance.yahoo.com/q?s=LMT" target="_blank">LMT</a></td>
<td>Lockheed Martin Corporation</td><td>Stock</td><td>Purchase</td><td>$15,001 - $50,000</td><td>--</td></tr>
<tr><td>2</td><td>10/02/2026</td><td>Self</td><td>--</td><td>US Treasury Note</td>
<td>Other Securities</td><td>Purchase</td><td>$1,001 - $15,000</td><td>--</td></tr>
<tr><td>3</td><td>10/03/2026</td><td>Joint</td><td>BRK.B</td><td>Berkshire Hathaway</td>
<td>Stock Option</td><td>Sale (Partial)</td><td>Over $50,000,000</td><td>--</td></tr>
</tbody></table>"""


def test_senate_report_rows():
    f = senate.parse_report_rows(ROWS)
    assert f[0]["member"] == "Sen. Jane Example" and not f[0]["paper"]
    assert f[0]["filing_date"] == dt.date(2026, 10, 21)
    assert f[0]["url"] == "https://efdsearch.senate.gov/search/view/ptr/abc-123/"
    assert f[1]["paper"]


def test_senate_ptr_html():
    rows = senate.parse_ptr_html(PTR_HTML)
    assert [(r["ticker"], r["type"], r["owner"], r["amount_low"], r["amount_high"], r["asset_type"])
            for r in rows] == [
        ("LMT", "Purchase", "Spouse", 15001, 50000, "ST"),
        ("BRK.B", "Sale (partial)", "Joint", 50000000, None, "OP"),
    ]


class FakeSession:
    def accept_terms(self): pass
    def search_ptrs(self, since): return ROWS
    def get(self, path): return PTR_HTML


def test_senate_pipeline():
    trades, review = senate.fetch_senate_trades(
        "t t@x.com", today=dt.date(2026, 11, 1), session=FakeSession(), log=lambda *_: None)
    assert len(trades) == 2 and trades[0]["chamber"] == "Senate"
    assert trades[0]["disclosed"] == "2026-10-21" and trades[0]["trade_date"] == "2026-10-01"
    assert review[0]["member"] == "Sen. John Sample"


def test_price_parsers_and_performance():
    stooq = "Date,Open,High,Low,Close,Volume\n2026-10-01,1,1,1,100,5\n2026-10-02,1,1,1,104,5\n2026-10-30,1,1,1,110,5\n"
    rows = prices.parse_stooq(stooq)
    assert prices.close_on_or_before(rows, "2026-10-03") == 104
    assert prices.close_on_or_before(rows, "2026-09-01") is None
    yahoo = '{"chart":{"result":[{"timestamp":[1790000000,1790086400],"indicators":{"quote":[{"close":[50.0,null]}]}}]}}'
    assert len(prices.parse_yahoo(yahoo)) == 1

    class F:
        def get(self, url, cache=True):
            return stooq.encode() if "stooq" in url else None
    book = prices.PriceBook(F(), dt.date(2026, 9, 1), dt.date(2026, 11, 1), log=lambda *_: None)
    sigs = [{"ticker": "LMT", "trade_date": "2026-10-02"},
            {"ticker": "X", "trade_date": "2026-10-02", "avg_price": 120.0}]
    prices.add_performance(sigs, book)
    assert sigs[0]["change_pct"] == 5.8 and sigs[0]["price_then"] == 104
    assert sigs[1]["change_pct"] == -8.3  # uses the insider's own price
    assert prices.stooq_symbol("BRK.B") == "brk-b.us" and prices.yahoo_symbol("brk.b") == "BRK-B"
