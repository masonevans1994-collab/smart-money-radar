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
if items:
    page = f.get(items[0]["url"], cache=False).decode("utf-8", "replace")
    i = page.find("awarded")
    print("page len", len(page), "first 'awarded' at", i)
    print(page[max(0, i - 3000): i + 1500])

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
