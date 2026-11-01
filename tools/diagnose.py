"""Temporary diagnostics printed to the Actions log."""
import os, re, urllib.request, urllib.error, datetime as dt
from radar import contracts
from radar.http import Fetcher

ua = os.environ["SEC_USER_AGENT"]
f = Fetcher(ua)

print("==== DoD RSS")
rss = f.get(contracts.DOD_RSS, cache=False).decode("utf-8", "replace")
items = contracts.parse_dod_rss(rss)
print(items[:3])
i = rss.find("<item>")
print("RSS len", len(rss)); print(rss[i:i+4000])
BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for agent in (ua, BROWSER):
    try:
        req = urllib.request.Request(items[0]["url"], headers={"User-Agent": agent, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=30) as r:
            page = r.read().decode("utf-8", "replace")
            j = page.find("awarded"); print("ARTICLE OK", agent[:15], len(page)); print(page[max(0,j-2500):j+800])
    except Exception as e:
        print("ARTICLE FAIL", agent[:15], e)

print("==== USAspending unmatched names")
raw = contracts.fetch_usaspending(ua, 14, 10e6)
book = contracts.SymbolBook.from_symbol_files(
    f.get(contracts.NASDAQ_LISTED, cache=False).decode(), f.get(contracts.OTHER_LISTED, cache=False).decode())
for a in raw:
    print(" ", "MATCH" if book.match(a["parent"], a["recipient"]) else "-----",
          a["recipient"], "|", a["parent"], "|", a["value"], "|", a["agency"])

print("==== Senate")
for agent in (ua, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"):
    req = urllib.request.Request("https://efdsearch.senate.gov/search/home/", headers={"User-Agent": agent})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("OK", r.status, agent[:20], r.read(300))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, agent[:20], dict(e.headers).get("Server"), e.read()[:500])
