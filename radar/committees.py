"""Congressional committee rosters, for conflict-of-interest flags.

Source: the public-domain @unitedstates/congress-legislators project.
A flag fires when a member trades a stock in an area their committee
oversees, or buys a company before it wins a contract from an agency
their committee oversees.
"""

from __future__ import annotations

import json
import re

BASE = "https://unitedstates.github.io/congress-legislators/"
FILES = ("legislators-current.json", "committees-current.json",
         "committee-membership-current.json")

# Agency (or branch) keyword -> committee/subcommittee name keywords.
OVERSIGHT = [
    (("defense", "war", "army", "navy", "air force", "space force", "missile",
      "special operations", "darpa", "logistics agency"),
     ("armed services", "defense", "intelligence")),
    (("veterans",), ("veterans",)),
    (("aeronautics", "nasa", "space administration"),
     ("science, space", "commerce, science", "space")),
    (("homeland security", "customs", "immigration", "fema", "coast guard", "secret service"),
     ("homeland security",)),
    (("health and human services", "hhs", "food and drug", "medicare", "disease control",
      "national institutes of health"),
     ("energy and commerce", "health, education", "health", "finance")),
    (("energy",), ("energy",)),
    (("transportation", "aviation administration"), ("transportation", "commerce")),
    (("agriculture",), ("agriculture",)),
    (("treasury", "internal revenue"), ("financial services", "banking", "finance", "ways and means")),
    (("interior",), ("natural resources", "interior", "energy and natural")),
    (("labor",), ("education and the workforce", "health, education, labor")),
    (("general services", "office of personnel"), ("oversight", "governmental affairs")),
    (("justice", "federal bureau of investigation"), ("judiciary",)),
    (("state", "agency for international development"), ("foreign affairs", "foreign relations")),
]

# Publicly traded defense contractors (for flagging trades by members on
# defense-related committees even when no contract is in the feed).
DEFENSE_TICKERS = {
    "LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "LDOS", "BAH", "SAIC", "CACI",
    "PLTR", "KTOS", "AVAV", "MRCY", "TXT", "TDG", "HEI", "CW", "BWXT", "KBR", "PSN",
    "AMTM", "VVX", "OSK", "HXL", "TDY", "RKLB", "MOG.A", "WWD", "HWM", "DRS", "ESLT",
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z ]", "", s.lower().replace("-", " ")).strip()


def clean_member_name(who: str) -> tuple[str, str]:
    """'Hon. Pete Sessions' -> ('pete', 'sessions'); handles middle names/suffixes."""
    name = re.sub(r"^(hon|sen|rep|mr|mrs|ms|dr)\.?\s+", "", who.strip(), flags=re.I)
    name = re.sub(r",?\s+(jr|sr|ii|iii|iv)\.?$", "", name, flags=re.I)
    parts = [p for p in re.split(r"\s+", name) if p and not re.fullmatch(r"[A-Z]\.", p)]
    if not parts:
        return "", ""
    return _norm(parts[0]), _norm(parts[-1])


class Roster:
    def __init__(self, legislators: list, committees: list, membership: dict):
        names: dict[str, str] = {}
        for c in committees:
            names[c["thomas_id"]] = c["name"]
            for sub in c.get("subcommittees", []):
                names[c["thomas_id"] + sub["thomas_id"]] = f"{c['name']}: {sub['name']}"
        self.by_member: dict[str, list[str]] = {}
        for cid, members in membership.items():
            for m in members:
                if m.get("bioguide"):
                    self.by_member.setdefault(m["bioguide"], []).append(names.get(cid, cid))
        self.people = []
        for p in legislators:
            n = p.get("name", {})
            term = (p.get("terms") or [{}])[-1]
            firsts = {_norm(n.get("first", "")), _norm(n.get("nickname", "")),
                      _norm(n.get("official_full", "").split(" ")[0])} - {""}
            self.people.append({
                "bioguide": p.get("id", {}).get("bioguide"),
                "last": _norm(n.get("last", "")),
                "firsts": firsts,
                "chamber": "Senate" if term.get("type") == "sen" else "House",
                "label": f"{'Sen.' if term.get('type') == 'sen' else 'Rep.'} "
                         f"{n.get('official_full') or n.get('first', '') + ' ' + n.get('last', '')}",
            })

    @classmethod
    def from_json(cls, leg: str, com: str, mem: str) -> "Roster":
        return cls(json.loads(leg), json.loads(com), json.loads(mem))

    def find(self, who: str, chamber: str | None = None) -> dict | None:
        first, last = clean_member_name(who)
        if not last:
            return None
        pool = [p for p in self.people if p["last"] == last
                and (not chamber or p["chamber"] == chamber)]
        exact = [p for p in pool if first in p["firsts"]]
        if len(exact) == 1:
            return exact[0]
        if len(pool) == 1:
            return pool[0]
        return None

    def committees(self, who: str, chamber: str | None = None) -> list[str]:
        p = self.find(who, chamber)
        return self.by_member.get(p["bioguide"], []) if p else []


def overseeing(committee_names: list[str], agency_text: str) -> list[str]:
    """Committees (from the member's list) that oversee the named agency."""
    agency = agency_text.lower()
    keys = set()
    for agency_words, committee_words in OVERSIGHT:
        if any(w in agency for w in agency_words):
            keys.update(committee_words)
    return [c for c in committee_names if any(k in c.lower() for k in keys)]


def short(committee: str) -> str:
    """'Committee on Armed Services: Readiness' -> 'Armed Services (Readiness)'."""
    c = re.sub(r"^(House |Senate |Joint )?(Committee on |Permanent Select Committee on |"
               r"Select Committee on )", "", committee)
    if ": " in c:
        main, sub = c.split(": ", 1)
        return f"{main} ({sub})"
    return c
