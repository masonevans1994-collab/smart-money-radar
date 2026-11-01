"""One-off diagnostics printed to the GitHub Actions log."""
import datetime as dt
import os
import re
import urllib.error
import urllib.request

from radar import congress
from radar.http import Fetcher

ua = os.environ["SEC_USER_AGENT"]
print("UA:", ua)
for url in ["https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261030.idx",
            "https://www.sec.gov/files/company_tickers.json"]:
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Encoding": "identity"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("SEC OK", r.status, url, r.read(150))
    except urllib.error.HTTPError as e:
        print("SEC HTTP", e.code, url, e.read()[:600])

f = Fetcher(ua)
since = dt.date.today() - dt.timedelta(days=14)
filings = [x for x in congress.read_house_zip(f.get(congress.HOUSE_ZIP.format(year=2026), cache=False), 2026)
           if x["filing_date"] and x["filing_date"] >= since]
for x in filings:
    if not any(n in x["member"] for n in ("Sessions", "Jackson")):
        continue
    text = congress.pdf_to_text(f.get(x["url"]))
    flat = re.sub(r"\s+", " ", text)
    print("=" * 30, x["member"], x["url"])
    for m in re.finditer(r"\$[\d,]+", flat):
        pass
    i = flat.find("ID Owner")
    print(flat[i:i + 2500])
    print("ROWS:", [(r["ticker"], r["amount_low"], r["amount_high"]) for r in congress.parse_ptr_text(text)][:12])
