"""Contract wins that companies announce themselves, plus big contract expansions.

* 8-K filings: public companies often disclose material contract awards
  within days (press release as exhibit 99). Found with EDGAR full-text
  search, which needs the same declared SEC User-Agent as EDGAR.
* USAspending transactions: large modifications (expansions, options
  exercised) to existing contracts, which can dwarf the original award.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import re
import urllib.error

from .contracts import USASPENDING_AWARD, _post_json

EFTS = ("https://efts.sec.gov/LATEST/search-index?q={q}&forms=8-K&dateRange=custom"
        "&startdt={start}&enddt={end}&from={offset}")
ARCHIVE = "https://www.sec.gov/Archives/edgar/data/{cik}/{folder}/{file}"
QUERIES = ('"awarded a contract"', '"was awarded a"', '"has been awarded"',
           '"contract award"', '"selected by the"')

_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|bn|mm|m\b)?", re.I)
_AWARD_WORDS = re.compile(r"\b(award(?:ed)?|won|wins|selected|received|receives)\b", re.I)
_CONTRACT_WORDS = re.compile(r"\b(contract|task order|delivery order|IDIQ|order)\b", re.I)
AGENCY_RE = re.compile(
    r"(U\.S\. (?:Army|Navy|Air Force|Space Force|Marine Corps|Coast Guard|Special Operations Command)|"
    r"Department of (?:Defense|War|Veterans Affairs|Homeland Security|Energy|Health and Human Services|"
    r"Transportation|State|Justice|the Navy|the Army|the Air Force)|NASA|"
    r"Missile Defense Agency|Defense Logistics Agency|DARPA|Space Development Agency|"
    r"Army|Navy|Air Force|Space Force)")


def efts_url(query: str, start: dt.date, end: dt.date, offset: int = 0) -> str:
    from urllib.parse import quote
    return EFTS.format(q=quote(query), start=start.isoformat(), end=end.isoformat(), offset=offset)


def parse_efts(text: str) -> list[dict]:
    """Full-text search hits -> candidate documents."""
    try:
        hits = json.loads(text)["hits"]["hits"]
    except (KeyError, ValueError, TypeError):
        return []
    out = []
    for h in hits:
        src = h.get("_source", {})
        adsh, _, filename = h.get("_id", "").partition(":")
        names = src.get("display_names") or [""]
        m = re.search(r"\(([A-Z][A-Z0-9.\-]{0,6})(?:,\s*[A-Z0-9.\-]+)*\)\s*\(CIK", names[0])
        ciks = src.get("ciks") or []
        if not (m and adsh and filename and ciks):
            continue
        company = re.sub(r"\s*\(.*$", "", names[0]).strip()
        out.append({
            "ticker": m.group(1), "company": company.title(),
            "cik": int(ciks[0]), "adsh": adsh, "file": filename,
            "filed": src.get("file_date"),
            "url": ARCHIVE.format(cik=int(ciks[0]), folder=adsh.replace("-", ""), file=filename),
        })
    return out


def _amount(num: str, unit: str | None) -> float:
    v = float(num.replace(",", ""))
    u = (unit or "").lower()
    if u in ("billion", "bn"):
        v *= 1e9
    elif u in ("million", "mm", "m"):
        v *= 1e6
    return v


def extract_award(doc_html: str) -> dict | None:
    """Pick the sentence announcing the award and its dollar value."""
    text = html.unescape(re.sub(r"<[^>]+>", " ", doc_html))
    text = re.sub(r"\s+", " ", text)
    # Keep abbreviations ("U.S. Army", "Inc.", "Md.") from ending a sentence.
    text = re.sub(r"\b(U\.S|Inc|Corp|Co|Ltd|No|Md|Va|Calif|Fla|Ala|Mass|Conn|Ariz|Colo|Mr|Ms|Dr|St)\. ",
                  lambda m: m.group(1) + ".\u2063", text)
    best = None
    for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text):
        sent = sent.replace("\u2063", " ")
        if len(sent) > 700 or not (_AWARD_WORDS.search(sent) and _CONTRACT_WORDS.search(sent)):
            continue
        if re.search(r"\b(revenue|backlog|quarter|guidance|net income|earnings)\b", sent, re.I):
            continue  # financial results, not a single award
        amounts = [_amount(n, u) for n, u in _MONEY.findall(sent)]
        amounts = [a for a in amounts if a >= 1e6]
        if not amounts:
            continue
        value = max(amounts)
        if not best or value > best["value"]:
            ag = AGENCY_RE.search(sent)
            best = {"value": value, "sentence": sent.strip()[:600],
                    "agency": ag.group(1) if ag else ""}
    return best


def fetch_8k_awards(fetcher, days: int = 10, min_amount: float = 10e6,
                    max_docs: int = 60, today: dt.date | None = None, log=print) -> list[dict]:
    from .http import Blocked
    today = today or dt.date.today()
    start = today - dt.timedelta(days=days)
    docs, seen = [], set()
    try:
        for q in QUERIES:
            body = fetcher.get(efts_url(q, start, today), cache=False)
            for d in parse_efts(body.decode("utf-8", "replace") if body else ""):
                if d["adsh"] not in seen and re.search(r"\.(htm|html|txt)$", d["file"], re.I):
                    seen.add(d["adsh"])
                    docs.append(d)
    except Blocked as e:
        log(f"  SEC full-text search refused ({e}); needs SEC_USER_AGENT")
        return []
    except Exception as e:  # noqa: BLE001
        log(f"  SEC full-text search failed: {e}")
        return []

    out = []
    for d in sorted(docs, key=lambda x: x["filed"] or "", reverse=True)[:max_docs]:
        try:
            body = fetcher.get(d["url"])
        except Exception:  # noqa: BLE001
            break  # refused: stop politely
        award = extract_award(body.decode("utf-8", "replace")) if body else None
        if not award or award["value"] < min_amount:
            continue
        out.append({
            "kind": "contract", "source": "Company 8-K", "ticker": d["ticker"],
            "company": d["company"], "who": d["company"], "recipient": d["company"],
            "parent": "", "value": award["value"],
            "agency": award["agency"] or "Government customer", "sub_agency": "",
            "award_date": d["filed"], "trade_date": d["filed"], "disclosed": d["filed"],
            "award_id": d["adsh"], "description": award["sentence"], "url": d["url"],
        })
    log(f"  company 8-Ks: {len(out)} contract announcements of ${min_amount / 1e6:.0f}M+ "
        f"from {len(docs)} matching filings")
    return out


# ---------- big modifications on existing contracts ----------

TXN_URL = "https://api.usaspending.gov/api/v2/search/spending_by_transaction/"
TXN_FIELDS = ["Award ID", "Recipient Name", "Action Date", "Transaction Amount",
              "Awarding Agency", "Awarding Sub Agency", "Transaction Description", "Mod",
              "generated_internal_id"]
TXN_MIN_FIELDS = ["Award ID", "Recipient Name", "Action Date", "Transaction Amount",
                  "Awarding Agency", "Mod"]


def txn_body(since: dt.date, until: dt.date, fields: list[str], page: int) -> dict:
    return {
        "filters": {
            "award_type_codes": ["A", "B", "C", "D"],
            "time_period": [{"start_date": since.isoformat(), "end_date": until.isoformat()}],
        },
        "fields": fields, "sort": "Transaction Amount", "order": "desc",
        "limit": 100, "page": page,
    }


def parse_modifications(results: list[dict], min_amount: float) -> list[dict]:
    out = []
    for r in results:
        amt = r.get("Transaction Amount") or 0
        mod = str(r.get("Mod") or "0").strip()
        if amt < min_amount or mod in ("0", "", "None", "00"):
            continue  # new awards are covered elsewhere; skip de-obligations
        gid = r.get("generated_internal_id") or ""
        out.append({
            "source": "USAspending (modification)", "award_id": r.get("Award ID"),
            "recipient": r.get("Recipient Name") or "", "parent": "",
            "value": float(amt), "agency": r.get("Awarding Agency") or "",
            "sub_agency": r.get("Awarding Sub Agency") or "",
            "award_date": r.get("Action Date"),
            "description": (r.get("Transaction Description") or "").strip(),
            "url": USASPENDING_AWARD.format(id=gid) if gid else "",
            "is_modification": True,
        })
    return out


def fetch_modifications(user_agent: str, days: int = 14, min_amount: float = 50e6,
                        pages: int = 2, today: dt.date | None = None, post=_post_json,
                        log=print) -> list[dict]:
    today = today or dt.date.today()
    since = today - dt.timedelta(days=days)
    fields, out = TXN_FIELDS, []
    for page in range(1, pages + 1):
        try:
            data = post(TXN_URL, txn_body(since, today, fields, page), user_agent)
        except urllib.error.HTTPError as e:
            if e.code in (400, 422) and fields is TXN_FIELDS:
                fields = TXN_MIN_FIELDS
                try:
                    data = post(TXN_URL, txn_body(since, today, fields, page), user_agent)
                except Exception as e2:  # noqa: BLE001
                    log(f"  USAspending modifications failed: {e2}")
                    break
            else:
                log(f"  USAspending modifications failed: {e}")
                break
        except Exception as e:  # noqa: BLE001
            log(f"  USAspending modifications failed: {e}")
            break
        rows = data.get("results", [])
        out += parse_modifications(rows, min_amount)
        if not data.get("page_metadata", {}).get("hasNext") or \
                (rows and (rows[-1].get("Transaction Amount") or 0) < min_amount):
            break
    log(f"  USAspending: {len(out)} contract expansions of ${min_amount / 1e6:.0f}M+ since {since}")
    return out
