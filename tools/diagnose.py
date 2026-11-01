"""Temporary diagnostics: Senate eFD step by step."""
import os, re, urllib.error, datetime as dt
from radar import senate

s = senate.SenateSession(os.environ["SEC_USER_AGENT"])
page = s._req(senate.HOME)
print("cookies after GET:", [(c.name, c.domain) for c in s.jar])
m = re.search(r'csrfmiddlewaretoken[^>]*', page); print("form token tag:", m.group(0)[:200] if m else None)
print("form action:", re.findall(r'<form[^>]*>', page)[:3])
try:
    s.accept_terms(); print("accept OK; cookies:", [c.name for c in s.jar])
except urllib.error.HTTPError as e:
    print("ACCEPT FAIL", e.code, e.read()[:1500])
try:
    rows = s.search_ptrs(dt.date.today() - dt.timedelta(days=14)); print("search OK", len(rows), rows[:2])
except urllib.error.HTTPError as e:
    print("SEARCH FAIL", e.code, e.read()[:1500])
