import datetime as dt
import urllib.error

from radar import contracts, scoring

NASDAQ = """Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
KTOS|Kratos Defense & Security Solutions, Inc. - Common Stock|Q|N|N|100|N|N
PLTR|Palantir Technologies Inc. - Class A Common Stock|Q|N|N|100|N|N
AVAV|AeroVironment, Inc. - Common Stock|Q|N|N|100|N|N
GNRL|General Widget Corp - Common Stock|Q|N|N|100|N|N
FRMI|Fermi Inc. - Common Stock|Q|N|N|100|N|N
QQQ|Invesco QQQ Trust|G|N|N|100|Y|N
File Creation Time: 1101202612:00|||||||"""
OTHER = """ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
LMT|Lockheed Martin Corporation Common Stock|N|LMT|N|100|N|LMT
BA|Boeing Company (The) Common Stock|N|BA|N|100|N|BA
HII|Huntington Ingalls Industries, Inc. Common Stock|N|HII|N|100|N|HII
CW|Curtiss-Wright Corporation Common Stock|N|CW|N|100|N|CW
LMT$A|Lockheed Preferred|N|LMT$A|N|100|N|LMT$A
File Creation Time: 1101202612:00||||||||"""


def book():
    return contracts.SymbolBook.from_symbol_files(NASDAQ, OTHER)


def test_symbol_matching():
    b = book()
    assert b.match("LOCKHEED MARTIN CORPORATION")[0] == "LMT"
    assert b.match("SIKORSKY AIRCRAFT CORPORATION")[0] == "LMT"           # alias
    assert b.match("", "KRATOS DEFENSE & SECURITY SOLUTIONS, INC.")[0] == "KTOS"
    assert b.match("THE BOEING COMPANY")[0] == "BA"
    assert b.match("ELECTRIC BOAT CORP")[0] == "GD"
    assert b.match("HUNTINGTON INGALLS INCORPORATED")[0] == "HII"
    assert b.match("AEROVIRONMENT INC")[0] == "AVAV"
    assert b.match("CURTISS-WRIGHT CONTROLS INC")[0] == "CW"
    assert b.match("GENERAL ATOMICS AERONAUTICAL SYSTEMS") is None         # private
    assert b.match("GENERAL SERVICES CO") is None                          # too generic
    assert b.match("ANDURIL INDUSTRIES INC") is None                       # private
    assert b.match("FERMI FORWARD DISCOVERY GROUP, LLC") is None            # not Fermi Inc
    assert b.match("FERMI INC")[0] == "FRMI"


USA = {"results": [
    {"Award ID": "70CDCR26C0001", "Recipient Name": "PALANTIR USG INC",
     "Recipient Parent Name": "PALANTIR TECHNOLOGIES INC", "Award Amount": 96000000.0,
     "Awarding Agency": "Department of Homeland Security", "Awarding Sub Agency": "ICE",
     "Start Date": "2026-10-20", "Description": "DATA PLATFORM", "generated_internal_id": "CONT_AWD_1"},
    {"Award ID": "X", "Recipient Name": "SOME PRIVATE LLC", "Award Amount": 20000000.0,
     "Awarding Agency": "Department of Energy", "Start Date": "2026-10-21",
     "generated_internal_id": "CONT_AWD_2"},
], "page_metadata": {"hasNext": False}}


def test_usaspending_fetch_and_fallback():
    calls = []

    def post(url, body, ua):
        calls.append(body["fields"])
        if len(calls) == 1:
            raise urllib.error.HTTPError(url, 422, "bad field", {}, None)
        assert body["filters"]["time_period"][0]["date_type"] == "new_awards_only"
        return USA
    awards = contracts.fetch_usaspending("ua x@y.z", today=dt.date(2026, 11, 1), post=post,
                                         log=lambda *_: None)
    assert calls[1] == contracts.MIN_FIELDS and len(awards) == 2
    matched, private = contracts.match_awards(awards, book())
    assert private == 1 and matched[0]["ticker"] == "PLTR"
    assert matched[0]["url"] == "https://www.usaspending.gov/award/CONT_AWD_1"


RSS = """<rss><channel><item><title><![CDATA[Contracts For Oct. 30, 2026]]></title>
<link>https://www.defense.gov/News/Contracts/Contract/Article/1234/</link>
<pubDate>Fri, 30 Oct 2026 21:00:00 GMT</pubDate></item></channel></rss>"""
ARTICLE = """<div class="body"><p style="text-align:center"><strong>NAVY</strong></p>
<p>Huntington Ingalls Industries Inc., Newport News, Virginia, is awarded a $1,234,567,890 modification
to previously awarded contract N00024-21-C-2101 for advance planning of carrier refueling.</p>
<p><strong>ARMY</strong></p>
<p>Anduril Industries Inc.,* Costa Mesa, California, was awarded a $99,500,000 firm-fixed-price contract
for counter-drone systems. Bids were solicited via the internet with one received.</p>
<p>Lockheed Martin Corp., Grand Prairie, Texas, has been awarded a $250,000,000 contract for
missile production (W31P4Q-26-C-0001).</p>
<p>*Small business</p></div>"""


def test_dod_announcements():
    pages = {contracts.DOD_RSS: RSS, "https://www.defense.gov/News/Contracts/Contract/Article/1234/": ARTICLE}
    awards = contracts.fetch_dod(pages.__getitem__, today=dt.date(2026, 11, 1), log=lambda *_: None)
    got = [(a["recipient"], a["value"], a["sub_agency"], a["award_date"]) for a in awards]
    assert got == [
        ("Huntington Ingalls Industries Inc.", 1234567890.0, "Navy", "2026-10-30"),
        ("Anduril Industries Inc.", 99500000.0, "Army", "2026-10-30"),
        ("Lockheed Martin Corp.", 250000000.0, "Army", "2026-10-30"),
    ]
    matched, private = contracts.match_awards(awards, book())
    assert [m["ticker"] for m in matched] == ["HII", "LMT"] and private == 1


def test_contract_scoring_flags_congress_buys():
    matched, _ = contracts.match_awards(contracts.fetch_dod(
        {contracts.DOD_RSS: RSS, "https://www.defense.gov/News/Contracts/Contract/Article/1234/": ARTICLE}.__getitem__,
        today=dt.date(2026, 11, 1), log=lambda *_: None), book())
    congress = [{"ticker": "LMT", "trade_date": "2026-10-01", "type": "Purchase", "who": "Sen. Jane Example"},
                {"ticker": "LMT", "trade_date": "2026-11-15", "type": "Purchase", "who": "After"},
                {"ticker": "HII", "trade_date": "2026-10-01", "type": "Sale", "who": "Seller"}]
    ranked = scoring.score_contracts(matched, congress, [])
    lmt = next(c for c in ranked if c["ticker"] == "LMT")
    assert any("Sen. Jane Example bought LMT 29 days before" in r for r in lmt["reasons"])
    hii = next(c for c in ranked if c["ticker"] == "HII")
    assert not any("before this award" in r for r in hii["reasons"])
    assert hii["score"] >= 40  # $1.2B award


def test_market_cap_and_size_adjust():
    from radar import marketcap
    tick = '{"0":{"cik_str":1234,"ticker":"QRTZ","title":"Quartzline"},"1":{"cik_str":936468,"ticker":"LMT","title":"Lockheed"}}'
    shares = {"1234": '{"units":{"shares":[{"end":"2026-06-30","val":40000000,"accn":"a1"},'
                      '{"end":"2026-07-25","val":50000000,"accn":"a2"}]}}',
              "936468": '{"units":{"shares":[{"end":"2026-07-20","val":230000000,"accn":"b1"}]}}'}

    class F:
        def get(self, url, cache=True):
            if url == marketcap.TICKERS:
                return tick.encode()
            for cik, body in shares.items():
                if f"CIK{int(cik):010d}" in url:
                    return body.encode()
    cs = [{"ticker": "QRTZ", "value": 480e6, "price_now": 40.0, "score": 40, "reasons": ["Won"]},
          {"ticker": "LMT", "value": 480e6, "price_now": 500.0, "score": 40, "reasons": ["Won"]},
          {"ticker": "NOPE", "value": 1e7, "price_now": 5.0, "score": 10, "reasons": ["Won"]}]
    assert marketcap.add_market_caps(cs, F(), log=lambda *_: None) == 2
    assert cs[0]["market_cap"] == 2_000_000_000 and cs[0]["award_pct"] == 24.0
    scoring.size_adjust(cs)
    assert cs[0]["ticker"] == "QRTZ" and cs[0]["score"] == 70
    assert "Huge for this company" in cs[0]["reasons"][1]
    lmt = next(c for c in cs if c["ticker"] == "LMT")
    assert lmt["score"] == 40 and "0.42%" in lmt["reasons"][1]


def test_8k_search_and_extract():
    from radar import contract_news
    efts = ('{"hits":{"hits":[{"_id":"0000936468-26-000123:ex99-1.htm","_source":{"ciks":["0000936468"],'
            '"display_names":["LOCKHEED MARTIN CORP  (LMT)  (CIK 0000936468)"],"file_date":"2026-10-30"}},'
            '{"_id":"0000000001-26-000001:ex99.htm","_source":{"ciks":["0000000001"],'
            '"display_names":["SOME PRIVATE THING  (CIK 0000000001)"],"file_date":"2026-10-30"}}]}}')
    docs = contract_news.parse_efts(efts)
    assert len(docs) == 1 and docs[0]["ticker"] == "LMT"
    assert docs[0]["url"] == "https://www.sec.gov/Archives/edgar/data/936468/000093646826000123/ex99-1.htm"
    doc = ("<p>Third quarter revenue was $18.1 billion and backlog reached $160 billion.</p>"
           "<p>BETHESDA, Md. &ndash; Lockheed Martin has been awarded a $1.25 billion contract by the "
           "U.S. Army to produce PAC-3 interceptors.</p><p>The company also received a $5 million order.</p>")
    a = contract_news.extract_award(doc)
    assert a["value"] == 1.25e9 and a["agency"] == "U.S. Army"
    assert "PAC-3" in a["sentence"]
    assert contract_news.extract_award("<p>Revenue rose to $2 billion.</p>") is None


def test_modifications():
    from radar import contract_news
    rows = [{"Award ID": "A1", "Recipient Name": "HUNTINGTON INGALLS INC", "Action Date": "2026-10-28",
             "Transaction Amount": 900e6, "Awarding Agency": "Department of Defense",
             "Awarding Sub Agency": "Department of the Navy", "Mod": "P00045", "generated_internal_id": "G1"},
            {"Award ID": "A2", "Recipient Name": "X", "Action Date": "2026-10-28",
             "Transaction Amount": 800e6, "Mod": "0"},
            {"Award ID": "A3", "Recipient Name": "Y", "Action Date": "2026-10-28",
             "Transaction Amount": 10e6, "Mod": "P1"}]
    mods = contract_news.fetch_modifications(
        "ua", today=dt.date(2026, 11, 1), post=lambda *a: {"results": rows, "page_metadata": {"hasNext": False}},
        log=lambda *_: None)
    assert [m["award_id"] for m in mods] == ["A1"] and mods[0]["is_modification"]
    matched, _ = contracts.match_awards(mods, book())
    ranked = scoring.score_contracts(matched, [], [])
    assert ranked[0]["ticker"] == "HII" and "expansion" in ranked[0]["headline"]
