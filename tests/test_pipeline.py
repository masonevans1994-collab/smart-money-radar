"""End-to-end run of both fetchers against an offline fake web."""

import datetime as dt
import io
import zipfile

import pytest

from radar import congress, edgar, scoring
from tests.test_radar import FORM4_FILING, FORM_IDX, HOUSE_XML


def _ptr_pdf() -> bytes:
    canvas = pytest.importorskip("reportlab.pdfgen.canvas")
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(792, 612))
    y = 560
    for line in [
        "PERIODIC TRANSACTION REPORT",
        "ID Owner Asset Transaction Type Date Notification Date Amount",
        "SP   Quartzline Semiconductors - Common    P   10/01/2026   10/03/2026   $250,001 -",
        "     Stock (QRTZ) [ST]                                                  $500,000",
        "     Brookway Foods Inc. (BRKW) [ST]   S (partial)   08/20/2026   08/22/2026   $15,001 - $50,000",
    ]:
        c.drawString(30, y, line)
        y -= 18
    c.save()
    return buf.getvalue()


class FakeFetcher:
    def __init__(self, pages):
        self.pages = pages

    def get(self, url, cache=True):
        for key, body in self.pages.items():
            if url.endswith(key):
                return body
        return None


def test_edgar_pipeline():
    day = edgar.business_days_back(1)[0]
    f = FakeFetcher({
        edgar.daily_index_url(day).rsplit("/", 1)[1]: FORM_IDX.encode(),
        "0001234567-26-000042.txt": FORM4_FILING.encode(),
    })
    events = edgar.fetch_insider_buys(f, days=1, log=lambda *_: None)
    assert len(events) == 1 and events[0]["ticker"] == "DMRB"
    ranked = scoring.score_insider(events)
    assert ranked[0]["score"] > 50


def test_house_pipeline_with_real_pdf():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("2026FD.xml", HOUSE_XML)
    f = FakeFetcher({"2026FD.zip": buf.getvalue(), "20031234.pdf": _ptr_pdf()})
    trades, review = congress.fetch_house_trades(
        f, days=14, today=dt.date(2026, 11, 1), log=lambda *_: None)
    assert review == []
    assert [t["ticker"] for t in trades] == ["QRTZ", "BRKW"]
    assert trades[0]["owner"] == "Spouse" and trades[0]["amount_high"] == 500000
    ranked = scoring.score_congress(trades)
    assert any("days after the trade" in r for t in ranked for r in t["reasons"])
