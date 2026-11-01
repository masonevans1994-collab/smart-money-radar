"""Temporary diagnostics: which Senate request variant is refused."""
import os, urllib.request, urllib.error, http.cookiejar
ua = os.environ["SEC_USER_AGENT"]
H = "https://efdsearch.senate.gov/search/home/"
def tryit(label, headers, opener=None):
    req = urllib.request.Request(H, headers=headers)
    try:
        with (opener.open(req, timeout=30) if opener else urllib.request.urlopen(req, timeout=30)) as r:
            print("OK ", r.status, label)
    except urllib.error.HTTPError as e:
        print("FAIL", e.code, label, e.read()[:300])
jar_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
tryit("plain UA", {"User-Agent": ua})
tryit("UA + identity", {"User-Agent": ua, "Accept-Encoding": "identity"})
tryit("UA + referer", {"User-Agent": ua, "Referer": "https://efdsearch.senate.gov/search/"})
tryit("cookie opener UA", {"User-Agent": ua}, jar_opener)
tryit("cookie opener UA+referer+identity", {"User-Agent": ua, "Referer": "https://efdsearch.senate.gov/search/", "Accept-Encoding": "identity"}, jar_opener)
