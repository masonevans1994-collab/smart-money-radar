import json

from radar import committees, scoring

LEG = [
    {"id": {"bioguide": "S000001"}, "name": {"first": "Jane", "last": "Example", "official_full": "Jane Example"},
     "terms": [{"type": "sen", "state": "ZZ"}]},
    {"id": {"bioguide": "H000002"}, "name": {"first": "Peter", "nickname": "Pete", "last": "Sessions",
     "official_full": "Pete Sessions"}, "terms": [{"type": "rep", "state": "TX", "district": 17}]},
    {"id": {"bioguide": "H000003"}, "name": {"first": "David", "last": "Taylor",
     "official_full": "David J. Taylor"}, "terms": [{"type": "rep", "state": "OH", "district": 2}]},
]
COM = [{"type": "senate", "name": "Senate Committee on Armed Services", "thomas_id": "SSAS",
        "subcommittees": [{"name": "Airland", "thomas_id": "13"}]},
       {"type": "house", "name": "House Committee on Veterans' Affairs", "thomas_id": "HSVR", "subcommittees": []},
       {"type": "house", "name": "House Committee on Agriculture", "thomas_id": "HSAG", "subcommittees": []}]
MEM = {"SSAS13": [{"name": "Jane Example", "bioguide": "S000001"}],
       "HSVR": [{"name": "Pete Sessions", "bioguide": "H000002"}],
       "HSAG": [{"name": "David Taylor", "bioguide": "H000003"}]}


def roster():
    return committees.Roster.from_json(json.dumps(LEG), json.dumps(COM), json.dumps(MEM))


def test_member_lookup():
    r = roster()
    assert r.find("Sen. Jane Example", "Senate")["bioguide"] == "S000001"
    assert r.find("Hon. Pete Sessions", "House")["bioguide"] == "H000002"
    assert r.find("Hon. David J. Taylor")["bioguide"] == "H000003"
    assert r.committees("Hon. David J. Taylor") == ["House Committee on Agriculture"]
    assert r.find("Hon. Nobody Here") is None


def test_overseeing_and_short():
    names = ["Senate Committee on Armed Services: Airland", "House Committee on Agriculture"]
    assert committees.overseeing(names, "Department of Defense Air Force") == [names[0]]
    assert committees.overseeing(names, "Department of Veterans Affairs") == []
    assert committees.short(names[0]) == "Armed Services (Airland)"


def test_contract_committee_flag():
    c = [{"ticker": "LMT", "value": 2.5e8, "agency": "Department of Defense", "sub_agency": "Air Force",
          "award_date": "2026-10-30", "source": "USAspending", "company": "Lockheed", "who": "Lockheed"}]
    trades = [{"ticker": "LMT", "trade_date": "2026-10-01", "type": "Purchase",
               "who": "Sen. Jane Example", "chamber": "Senate"}]
    ranked = scoring.score_contracts(c, trades, [])
    before = ranked[0]["score"]
    scoring.committee_flags(ranked, roster())
    assert ranked[0]["score"] == before + 15
    assert "sits on Armed Services (Airland), which oversees Air Force" in ranked[0]["reasons"][1]
    assert "_buyers" not in ranked[0]
