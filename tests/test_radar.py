"""Tests against sample text in the real EDGAR and House formats."""

import datetime as dt
import io
import zipfile

from radar import congress, dashboard, edgar, scoring

FORM_IDX = """Description:           Daily Index of EDGAR Dissemination Feed by Form Type
Last Data Received:    October 30, 2026
Total Submissions:     3

Form Type   Company Name                                                  CIK         Date Filed  File Name
---------------------------------------------------------------------------------------------------------------------------------------------
3           SOMEONE ELSE                                                  1111111     20261030    edgar/data/1111111/0001111111-26-000001.txt
4           DEMO ROBOTICS INC                                             1234567     20261030    edgar/data/1234567/0001234567-26-000042.txt
4           LIN AVERY                                                     7654321     20261030    edgar/data/1234567/0001234567-26-000042.txt
4/A         OTHER CO                                                      2222222     20261030    edgar/data/2222222/0002222222-26-000009.txt
SC 13G      BIG FUND LP                                                   3333333     20261030    edgar/data/3333333/0003333333-26-000003.txt
"""

FORM4_FILING = """<SEC-DOCUMENT>0001234567-26-000042.txt
<DOCUMENT><TYPE>4<TEXT><XML>
<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0508</schemaVersion>
  <documentType>4</documentType>
  <periodOfReport>2026-10-28</periodOfReport>
  <aff10b5One>0</aff10b5One>
  <issuer>
    <issuerCik>0001234567</issuerCik>
    <issuerName>Demo Robotics Inc</issuerName>
    <issuerTradingSymbol>dmrb</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0007654321</rptOwnerCik><rptOwnerName>Lin Avery</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector><isOfficer>1</isOfficer><isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle>Chief Executive Officer</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-10-28</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50000</value></transactionShares>
        <transactionPricePerShare><value>18.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>150000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-10-29</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50000</value></transactionShares>
        <transactionPricePerShare><value>20.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>200000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-10-29</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>F</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>20.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>199000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>
</XML></TEXT></DOCUMENT></SEC-DOCUMENT>
"""

HOUSE_XML = """<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member><Prefix>Hon.</Prefix><Last>Example</Last><First>Dana</First><Suffix /><FilingType>P</FilingType><StateDst>ZZ01</StateDst><Year>2026</Year><FilingDate>10/27/2026</FilingDate><DocID>20031234</DocID></Member>
  <Member><Prefix /><Last>Sample</Last><First>Lee</First><Suffix /><FilingType>O</FilingType><StateDst>ZZ04</StateDst><Year>2026</Year><FilingDate>5/15/2026</FilingDate><DocID>10070001</DocID></Member>
</FinancialDisclosure>"""

PTR_TEXT = """Clerk of the House of Representatives • Legislative Resource Center
PERIODIC TRANSACTION REPORT
Name: Hon. Dana Example
Status: Member
State/District: ZZ01
ID Owner Asset Transaction Type Date Notification Date Amount Cap. Gains > $200?
SP Quartzline Semiconductors - Common Stock P 10/01/2026 10/03/2026 $250,001 -
(QRTZ) [ST] $500,000
F S: New
Brookway Foods Inc. (BRKW) [ST] S (partial) 08/20/2026 08/22/2026 $15,001 - $50,000
JT Big Index Fund (BIGX) [OP] P 10/02/2026 10/02/2026 Over $50,000,000
D: Call options
"""


def test_parse_form_index_dedupes_and_filters():
    rows = edgar.parse_form_index(FORM_IDX)
    assert len(rows) == 1
    assert rows[0]["company"] == "DEMO ROBOTICS INC"
    assert rows[0]["url"].endswith("0001234567-26-000042.txt")


def test_daily_index_url_quarter():
    assert edgar.daily_index_url(dt.date(2026, 10, 30)).endswith(
        "2026/QTR4/form.20261030.idx")


def test_form4_open_market_buy():
    xml = edgar.extract_ownership_xml(FORM4_FILING)
    doc = edgar.parse_form4(xml, "u")
    assert doc["ticker"] == "DMRB" and doc["roles"]["officer"]
    ev = edgar.open_market_buy(doc, "20261030")
    assert ev["shares"] == 100000
    assert ev["value"] == 50000 * 18 + 50000 * 20
    assert ev["avg_price"] == 19.0
    assert ev["shares_after"] == 200000 and ev["shares_before"] == 100000
    assert ev["trade_date"] == "2026-10-28" and ev["disclosed"] == "2026-10-30"


def test_house_index_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("2026FD.xml", HOUSE_XML)
        z.writestr("2026FD.txt", "ignored")
    rows = congress.read_house_zip(buf.getvalue(), 2026)
    assert len(rows) == 1
    assert rows[0]["member"] == "Hon. Dana Example"
    assert rows[0]["filing_date"] == dt.date(2026, 10, 27)
    assert rows[0]["url"].endswith("/ptr-pdfs/2026/20031234.pdf")


def test_ptr_text_parsing():
    # Row 1 wraps (ticker after the amount); rows 2-3 keep it before the type.
    rows = congress.parse_ptr_text(PTR_TEXT)
    assert [r["ticker"] for r in rows] == ["QRTZ", "BRKW", "BIGX"]
    qrtz = rows[0]
    assert qrtz["type"] == "Purchase" and qrtz["owner"] == "Spouse"
    assert (qrtz["amount_low"], qrtz["amount_high"]) == (250001, 500000)
    assert qrtz["asset_type"] == "ST" and qrtz["trade_date"] == dt.date(2026, 10, 1)
    assert rows[1]["owner"] == "Self"
    brkw = next(r for r in rows if r["ticker"] == "BRKW")
    assert brkw["type"] == "Sale (partial)"
    assert (brkw["amount_low"], brkw["amount_high"]) == (15001, 50000)
    bigx = next(r for r in rows if r["ticker"] == "BIGX")
    assert bigx["asset_type"] == "OP" and bigx["amount_high"] is None
    assert bigx["owner"] == "Joint"


def test_scoring_and_render():
    from radar import demo
    ins = scoring.score_insider(demo.insider_events())
    con = scoring.score_congress(demo.congress_trades())
    assert ins[0]["ticker"] == "DMRB"  # 3-insider cluster with CEO
    assert all(0 <= x["score"] <= 100 and x["reasons"] for x in ins + con)
    late = next(x for x in con if x["ticker"] == "SNDL")
    assert any("days after the trade" in r for r in late["reasons"])
    html = dashboard.render(ins, con, [], demo=True)
    assert "/*__DATA__*/" not in html and "DMRB" in html


def test_ptr_ticker_wrapped_below_full_row():
    text = ("DC Very Long Holdings Company Class A Common P 09/02/2026 09/05/2026 "
            "$1,001 - $15,000\nShares (VLHC) [ST]\n"
            "Acme Widgets (ACMW) [ST] S 09/03/2026 09/05/2026 $50,001 - $100,000\n")
    rows = congress.parse_ptr_text(text)
    assert [(r["ticker"], r["owner"], r["type"]) for r in rows] == [
        ("VLHC", "Dependent child", "Purchase"), ("ACMW", "Self", "Sale")]
