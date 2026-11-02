"""Federal contract awards matched to publicly traded companies.

Sources (both free, public-domain government data, no key):
  * USAspending.gov: official record of new contract awards.
    Civilian awards appear within days; DoD awards are delayed ~90 days.
  * defense.gov daily contract announcements: every DoD award of $7.5M+,
    published around 5pm ET the same day. This is the timely source.

Each award is matched to a stock ticker (curated aliases for the big
contractors and their subsidiaries, then the Nasdaq/NYSE symbol list).
Awards to private companies are dropped because they can't be traded.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import re
import urllib.error
import urllib.request

USASPENDING = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
USASPENDING_AWARD = "https://www.usaspending.gov/award/{id}"
NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
DOD_RSS = ("https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx"
           "?ContentType=400&Site=945&max=10")

# ---------- company name -> ticker ----------

SUFFIXES = {"INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "LLC",
            "LTD", "LIMITED", "PLC", "HOLDINGS", "HOLDING", "GROUP", "THE", "NEW",
            "LP", "L", "P", "SA", "NV", "AG", "SE", "THE", "DBA"}
GENERIC = {"GENERAL", "AMERICAN", "NATIONAL", "UNITED", "INTERNATIONAL", "SCIENCE",
           "TECHNOLOGY", "TECHNOLOGIES", "SYSTEMS", "SOLUTIONS", "SERVICES", "GLOBAL",
           "FEDERAL", "ADVANCED", "APPLIED", "DEFENSE", "ENERGY", "HEALTH", "MEDICAL",
           "DATA", "DIGITAL", "INDUSTRIES", "ENTERPRISES", "PACIFIC", "ATLANTIC",
           "SOUTHERN", "NORTHERN", "WESTERN", "EASTERN", "FIRST", "STANDARD"}
SKIP_SECURITY = ("WARRANT", "UNIT", "RIGHT", "PREFERRED", "NOTES", "DEPOSITARY",
                 "DEBENTURE", "BOND", "ETF", "FUND", "TRUST")

# Normalized name fragment -> ticker. Covers prime contractors whose
# subsidiaries win under different names. Order matters: first hit wins.
ALIASES = [
    ("LOCKHEED MARTIN", "LMT"), ("SIKORSKY", "LMT"),
    ("RAYTHEON", "RTX"), ("PRATT WHITNEY", "RTX"), ("COLLINS AEROSPACE", "RTX"),
    ("NORTHROP GRUMMAN", "NOC"),
    ("GENERAL DYNAMICS", "GD"), ("ELECTRIC BOAT", "GD"), ("BATH IRON WORKS", "GD"),
    ("GULFSTREAM AEROSPACE", "GD"), ("NATIONAL STEEL AND SHIPBUILDING", "GD"),
    ("BOEING", "BA"),
    ("L3HARRIS", "LHX"), ("L3 HARRIS", "LHX"), ("L3 TECHNOLOGIES", "LHX"),
    ("AEROJET ROCKETDYNE", "LHX"),
    ("HUNTINGTON INGALLS", "HII"), ("NEWPORT NEWS SHIPBUILDING", "HII"),
    ("LEIDOS", "LDOS"), ("BOOZ ALLEN", "BAH"),
    ("SCIENCE APPLICATIONS INTERNATIONAL", "SAIC"), ("CACI", "CACI"),
    ("PALANTIR", "PLTR"), ("KBR", "KBR"), ("PARSONS", "PSN"), ("JACOBS", "J"),
    ("AECOM", "ACM"), ("TEXTRON", "TXT"), ("BELL TEXTRON", "TXT"),
    ("HONEYWELL", "HON"), ("GE AEROSPACE", "GE"), ("GENERAL ELECTRIC", "GE"),
    ("OSHKOSH", "OSK"), ("MCKESSON", "MCK"), ("CARDINAL HEALTH", "CAH"),
    ("HUMANA", "HUM"), ("HEALTH NET FEDERAL", "CNC"), ("CENTENE", "CNC"),
    ("UNITEDHEALTH", "UNH"), ("OPTUM", "UNH"),
    ("ACCENTURE", "ACN"), ("INTERNATIONAL BUSINESS MACHINES", "IBM"),
    ("MICROSOFT", "MSFT"), ("AMAZON WEB SERVICES", "AMZN"), ("ORACLE", "ORCL"),
    ("GOOGLE", "GOOGL"), ("KRATOS", "KTOS"), ("AEROVIRONMENT", "AVAV"),
    ("MERCURY SYSTEMS", "MRCY"), ("V2X", "VVX"), ("VECTRUS", "VVX"),
    ("BWX", "BWXT"), ("FLUOR", "FLR"), ("MAXIMUS", "MMS"), ("ICF ", "ICFI"),
    ("CURTISS WRIGHT", "CW"), ("TRANSDIGM", "TDG"), ("HEXCEL", "HXL"),
    ("ROCKET LAB", "RKLB"), ("PLANET LABS", "PL"), ("BLACKSKY", "BKSY"),
    ("REDWIRE", "RDW"), ("INTUITIVE MACHINES", "LUNR"), ("AXON ENTERPRISE", "AXON"),
    ("MOTOROLA SOLUTIONS", "MSI"), ("DELL ", "DELL"), ("CISCO", "CSCO"),
    ("PFIZER", "PFE"), ("MODERNA", "MRNA"), ("MERCK SHARP", "MRK"),
    ("EMERGENT BIODEFENSE", "EBS"), ("EMERGENT BIOSOLUTIONS", "EBS"),
    ("SIGA TECHNOLOGIES", "SIGA"), ("AMENTUM", "AMTM"), ("GEO GROUP", "GEO"),
    ("CORECIVIC", "CXW"), ("TELEDYNE", "TDY"), ("HEICO", "HEI"),
    ("MOOG", "MOG.A"), ("WOODWARD", "WWD"), ("HOWMET", "HWM"),
    ("SPIRIT AEROSYSTEMS", "BA"), ("WELCH ALLYN", "BAX"), ("HILL ROM", "BAX"), ("ARCHER AVIATION", "ACHR"),
    ("JOBY AERO", "JOBY"), ("IRIDIUM", "IRDM"), ("VIASAT", "VSAT"),
    ("ECHOSTAR", "SATS"), ("FIRSTENERGY", "FE"), ("SIEMENS GOVERNMENT", "SIEGY"),
]


SMALL = {"and", "of", "the", "for", "in", "on", "at", "by", "to"}
KEEP_UPPER = {"LLC", "LP", "LLP", "USA", "US", "USG", "IBM", "KBR", "CACI", "SAIC", "BAE", "GE",
              "AECOM", "ICF", "BWX", "BWXT", "HII", "L3", "L3HARRIS", "V2X", "II", "III", "IV", "NA",
              "AI", "IT", "PLC", "AG", "SA", "NV", "SE", "DBA"}


def nice_case(name: str) -> str:
    """'FLUOR MARINE PROPULSION, LLC' -> 'Fluor Marine Propulsion, LLC'."""
    words = []
    for i, w in enumerate(name.split()):
        core = re.sub(r"[^A-Za-z0-9&]", "", w)
        if core.upper() in KEEP_UPPER or (core.isupper() and len(core) <= 3 and core.isalpha()
                                          and core.upper() not in {"INC", "CO", "THE", "AND", "FOR", "OF", "DE"}):
            words.append(w.upper())
        elif i and core.lower() in SMALL:
            words.append(w.lower())
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return " ".join(words)


def listed_name(security: str) -> str:
    """'Fluor Corporation Common Stock' -> 'Fluor Corporation'."""
    name = security.split(" - ")[0]
    name = re.sub(r"\s+(Common Stock|Class [A-C].*|Ordinary Shares.*|American Depositary.*|"
                  r"New Common Stock|Common Shares.*)$", "", name, flags=re.I)
    return re.sub(r"\s*\(The\)", "", name).strip(" ,")


def plain_description(text: str, recipient: str = "") -> str:
    """Strip procurement boilerplate from an award description, then fix the case.
    'IGF::OT::IGF HONEYWELL-MANAGEMENT AND OPERATION OF THE NATIONAL SECURITY
    CAMPUS-CONTRACT NO. DE-NA0002839' -> 'Management and operation of the
    national security campus.'"""
    t = text or ""
    t = re.sub(r"IGF::\w+::IGF", " ", t)                       # inherently-governmental tags
    t = re.sub(r"\s*[-:;,]?\s*CONTRACT\s+(NO\.?|NUMBER)\s*:?\s*[A-Z0-9-]+\.?", "", t, flags=re.I)
    t = re.sub(r"\b(P\d{5}|MOD(IFICATION)?\s*#?\s*\d+)\b\.?", "", t, flags=re.I)
    first = (recipient or "").split()[0].strip(",.") if recipient else ""
    if first and len(first) > 3:
        t = re.sub(rf"^\s*{re.escape(first)}\s*[-:]\s*", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*$", "", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" -:;,")
    t = sentence_case(t)
    if t and t[-1] not in ".!?":
        t += "."
    return t[:1].upper() + t[1:]


def sentence_case(text: str) -> str:
    """Tame ALL-CAPS government descriptions into readable sentences."""
    letters = [c for c in text if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) < 0.8:
        return text
    # Keep codes like contract numbers (anything with a digit) as written.
    out = " ".join(w if re.search(r"\d", w) else w.lower() for w in text.split(" "))
    out = re.sub(r"(^|[.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    for w in ("u.s.", "dod", "nasa", "va", "idiq", "fy", "usg", "bpa", "cio", "gsa", "nih", "cdc",
              "dla", "usaf", "dhs", "faa", "noaa", "doe", "hhs", "cms", "fema", "gdc"):
        out = re.sub(rf"\b{re.escape(w)}(?=\W|$)", w.upper(), out, flags=re.I)
    out = re.sub(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\b(?=\.?\s+\d{4}|\s+\d{1,2}\b)",
                 lambda m: m.group(0).capitalize(), out)
    out = re.sub(r"\$\s+(?=\d)", "$", out)
    return out


def normalize(name: str) -> list[str]:
    name = name.upper().split(" - ")[0]
    name = re.sub(r"\b(COMMON STOCK|CLASS [A-C]|ORDINARY SHARES|AMERICAN DEPOSITARY SHARES?)\b",
                  " ", name)
    name = name.replace("&", " AND ")
    tokens = re.sub(r"[^A-Z0-9 ]", " ", name.replace(".", "")).split()
    while tokens and tokens[-1] in SUFFIXES:
        tokens.pop()
    while tokens and tokens[0] == "THE":
        tokens.pop(0)
    return tokens


class SymbolBook:
    """Maps company names to tickers using aliases plus listed securities."""

    def __init__(self, listed: dict[str, str] | None = None, names: dict[str, str] | None = None):
        self.index = listed or {}
        self.names = names or {}  # ticker -> listed company name

    @classmethod
    def from_symbol_files(cls, nasdaq_txt: str, other_txt: str) -> "SymbolBook":
        index: dict[str, str] = {}
        names: dict[str, str] = {}
        for text, sym_col in ((nasdaq_txt, "Symbol"), (other_txt, "ACT Symbol")):
            lines = [ln for ln in text.splitlines() if ln and not ln.startswith("File Creation")]
            if not lines:
                continue
            head = lines[0].split("|")
            for ln in lines[1:]:
                row = dict(zip(head, ln.split("|")))
                sym, name = row.get(sym_col, ""), row.get("Security Name", "")
                if (not sym or "$" in sym or row.get("ETF") == "Y"
                        or row.get("Test Issue") == "Y"
                        or any(w in name.upper() for w in SKIP_SECURITY)):
                    continue
                key = " ".join(normalize(name))
                if key and key not in index:
                    index[key] = sym
                names.setdefault(sym, listed_name(name))
        return cls(index, names)

    def match(self, *names: str | None) -> tuple[str, str] | None:
        """Return (ticker, matched_name) for the first name that matches."""
        for name in names:
            if not name:
                continue
            tokens = normalize(name)
            joined = " " + " ".join(tokens) + " "
            for frag, ticker in ALIASES:
                if f" {frag.strip()} " in joined:
                    return ticker, name
            for k in range(len(tokens), 0, -1):
                key = " ".join(tokens[:k])
                if key not in self.index:
                    continue
                if k == 1 and (len(tokens[0]) < 5 or tokens[0] in GENERIC or len(tokens) > 2):
                    # One shared word is too weak when the full name says more
                    # ("FERMI FORWARD DISCOVERY GROUP" is not Fermi Inc).
                    break
                return self.index[key], name
        return None


# ---------- USAspending ----------

FIELDS = ["Award ID", "Recipient Name", "Recipient Parent Name", "Award Amount",
          "Awarding Agency", "Awarding Sub Agency", "Start Date", "Description",
          "generated_internal_id"]
MIN_FIELDS = ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency",
              "Start Date", "Description", "generated_internal_id"]


def _post_json(url: str, body: dict, user_agent: str) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def usaspending_body(since: dt.date, until: dt.date, min_amount: float,
                     page: int, fields: list[str]) -> dict:
    return {
        "filters": {
            "award_type_codes": ["A", "B", "C", "D"],
            "time_period": [{"start_date": since.isoformat(), "end_date": until.isoformat(),
                             "date_type": "new_awards_only"}],
            "award_amounts": [{"lower_bound": min_amount}],
        },
        "fields": fields, "sort": "Award Amount", "order": "desc",
        "limit": 100, "page": page, "subawards": False,
    }


def parse_usaspending(results: list[dict]) -> list[dict]:
    out = []
    for r in results:
        amt = r.get("Award Amount")
        if not amt:
            continue
        gid = r.get("generated_internal_id") or ""
        out.append({
            "source": "USAspending",
            "award_id": r.get("Award ID"),
            "recipient": r.get("Recipient Name") or "",
            "parent": r.get("Recipient Parent Name") or "",
            "value": float(amt),
            "agency": r.get("Awarding Agency") or "",
            "sub_agency": r.get("Awarding Sub Agency") or "",
            "award_date": r.get("Start Date"),
            "description": (r.get("Description") or "").strip(),
            "url": USASPENDING_AWARD.format(id=gid) if gid else "",
        })
    return out


def fetch_usaspending(user_agent: str, days: int = 14, min_amount: float = 10e6,
                      max_pages: int = 5, today: dt.date | None = None,
                      post=_post_json, log=print) -> list[dict]:
    today = today or dt.date.today()
    since = today - dt.timedelta(days=days)
    fields, out = FIELDS, []
    for page in range(1, max_pages + 1):
        try:
            data = post(USASPENDING, usaspending_body(since, today, min_amount, page, fields),
                        user_agent)
        except urllib.error.HTTPError as e:
            if e.code in (400, 422) and fields is FIELDS:
                log(f"  USAspending rejected full field list ({e.code}); retrying minimal")
                fields = MIN_FIELDS
                try:
                    data = post(USASPENDING, usaspending_body(since, today, min_amount, page,
                                                              fields), user_agent)
                except Exception as e2:  # noqa: BLE001
                    log(f"  USAspending failed: {e2}")
                    break
            else:
                log(f"  USAspending failed: {e}")
                break
        except Exception as e:  # noqa: BLE001
            log(f"  USAspending failed: {e}")
            break
        out += parse_usaspending(data.get("results", []))
        if not data.get("page_metadata", {}).get("hasNext"):
            break
    log(f"  USAspending: {len(out)} new contract awards of ${min_amount / 1e6:.0f}M+ since {since}")
    return out


# ---------- DoD daily announcements ----------

_AWARD_RE = re.compile(
    r"^(?P<company>[^,;]{3,120}?)(?:,|\s\()"           # company name up to first comma
    r".{0,400}?\b(?:has been|was|were|is being|are being|is|are)\s+(?:awarded|issued)"
    r".{0,200}?\$(?P<amount>[\d,]{5,})", re.S)
AGENCIES = {"ARMY", "NAVY", "AIR FORCE", "SPACE FORCE", "DEFENSE LOGISTICS AGENCY",
            "MISSILE DEFENSE AGENCY", "U.S. SPECIAL OPERATIONS COMMAND",
            "DEFENSE INFORMATION SYSTEMS AGENCY", "DEFENSE HEALTH AGENCY",
            "WASHINGTON HEADQUARTERS SERVICES", "DEFENSE THREAT REDUCTION AGENCY",
            "U.S. TRANSPORTATION COMMAND", "DEFENSE ADVANCED RESEARCH PROJECTS AGENCY"}


def parse_dod_rss(xml_text: str) -> list[dict]:
    items = []
    for item in re.findall(r"<item>(.*?)</item>", xml_text, re.S):
        title = re.search(r"<title>(.*?)</title>", item, re.S)
        link = re.search(r"<link>(.*?)</link>", item, re.S)
        date = re.search(r"<pubDate>(.*?)</pubDate>", item, re.S)
        if link:
            items.append({
                "title": html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", title.group(1))).strip()
                if title else "",
                "url": link.group(1).strip(),
                "pub": date.group(1).strip() if date else "",
            })
    return items


def announcement_date(title: str, pub: str) -> str | None:
    """'Contracts For Oct. 31, 2026' -> '2026-10-31' (falls back to pubDate)."""
    m = re.search(r"([A-Z][a-z]{2,8})\.? (\d{1,2}), (\d{4})", title)
    if m:
        try:
            return dt.datetime.strptime(f"{m.group(1)[:3]} {m.group(2)} {m.group(3)}",
                                        "%b %d %Y").date().isoformat()
        except ValueError:
            pass
    try:
        return dt.datetime.strptime(pub[5:16], "%d %b %Y").date().isoformat()
    except ValueError:
        return None


def parse_dod_article(page: str, day: str | None, url: str) -> list[dict]:
    paras = [html.unescape(re.sub(r"<[^>]+>", "", p)).strip()
             for p in re.findall(r"<p[^>]*>(.*?)</p>", page, re.S | re.I)]
    out, agency = [], ""
    for p in paras:
        text = re.sub(r"\s+", " ", p)
        if not text:
            continue
        if text.upper().rstrip(".") in AGENCIES:
            agency = text.title() if text.isupper() else text
            continue
        m = _AWARD_RE.search(text)
        if not m:
            continue
        company = re.sub(r"\s*\*$", "", m.group("company").strip())
        out.append({
            "source": "DoD announcement",
            "award_id": (re.search(r"\(([A-Z0-9]{6,}-?[A-Z0-9-]*)\)", text) or [None, None])[1],
            "recipient": company, "parent": "",
            "value": float(m.group("amount").replace(",", "")),
            "agency": "Department of Defense", "sub_agency": agency,
            "award_date": day, "description": text[:600], "url": url,
        })
    return out


def fetch_dod(get_text, days: int = 7, today: dt.date | None = None, log=print) -> list[dict]:
    today = today or dt.date.today()
    try:
        items = parse_dod_rss(get_text(DOD_RSS))
    except Exception as e:  # noqa: BLE001
        log(f"  DoD contracts feed failed: {e}")
        return []
    out = []
    for it in items:
        day = announcement_date(it["title"], it["pub"])
        if day and dt.date.fromisoformat(day) < today - dt.timedelta(days=days):
            continue
        try:
            out += parse_dod_article(get_text(it["url"]), day, it["url"])
        except Exception as e:  # noqa: BLE001
            # war.gov refuses automated readers; don't keep knocking.
            log(f"  DoD article pages unavailable ({e}); skipping the rest")
            break
    log(f"  DoD announcements: {len(out)} awards from {len(items)} daily posts")
    return out


# ---------- combine ----------

def match_awards(awards: list[dict], book: SymbolBook) -> tuple[list[dict], int]:
    """Attach tickers; drop awards to private companies. Returns (matched, n_private)."""
    matched, private = [], 0
    for a in awards:
        hit = book.match(a.get("parent"), a.get("recipient"))
        if not hit:
            private += 1
            continue
        ticker, name = hit
        listed = book.names.get(ticker) or nice_case(name)
        matched.append({**a, "kind": "contract", "ticker": ticker,
                        "company": listed, "who": nice_case(a["recipient"]),
                        "description": plain_description(a.get("description") or "", a.get("recipient") or ""),
                        "trade_date": a["award_date"], "disclosed": a["award_date"] or ""})
    return matched, private


# ---------- one card per award ----------

SOURCE_RANK = {"Company 8-K": 0, "DoD announcement": 1, "USAspending": 2,
               "USAspending (modification)": 3}


def dedupe(awards: list[dict], day_window: int = 5, value_tolerance: float = 0.15) -> list[dict]:
    """Merge the same award reported by several sources into one record.

    Same award = same award ID, or same ticker with a value within 15% and
    dates within a few days. The freshest source wins; other sources are
    listed in 'also_reported_by' and fill any missing description.
    """
    import datetime as dt

    def day(a):
        try:
            return dt.date.fromisoformat((a.get("award_date") or "")[:10])
        except ValueError:
            return None

    kept: list[dict] = []
    for a in sorted(awards, key=lambda x: SOURCE_RANK.get(x.get("source", ""), 9)):
        match = None
        for k in kept:
            if k["ticker"] != a["ticker"] or bool(k.get("is_modification")) != bool(a.get("is_modification")):
                continue
            if a.get("award_id") and a.get("award_id") == k.get("award_id"):
                match = k
                break
            d1, d2 = day(a), day(k)
            close_value = abs(a["value"] - k["value"]) <= value_tolerance * max(a["value"], k["value"])
            if d1 and d2 and abs((d1 - d2).days) <= day_window and close_value:
                match = k
                break
        if match:
            match.setdefault("also_reported_by", []).append(a.get("source"))
            if not match.get("description") and a.get("description"):
                match["description"] = a["description"]
            if a.get("sub_agency") and not match.get("sub_agency"):
                match["sub_agency"] = a["sub_agency"]
        else:
            kept.append(dict(a))
    return kept
