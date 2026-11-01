"""Sector context: compare a stock's move since an award with its peer group.

Peer groups are sector ETFs (free daily closes, same source as prices).
Membership is by the awarding agency's area and the contractor list; the
app says "defense stocks" or "health-care stocks" in plain words.
"""

from __future__ import annotations

import datetime as dt

from .prices import close_on_or_before

SECTORS = {
    "defense": ("ITA", "defense and aerospace stocks"),
    "health": ("XLV", "health-care stocks"),
    "tech": ("XLK", "technology stocks"),
    "industrial": ("XLI", "industrial stocks"),
    "energy": ("XLE", "energy stocks"),
    "space": ("ARKX", "space stocks"),
    "market": ("SPY", "the overall market"),
}

DEFENSE = {"LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "LDOS", "BAH", "SAIC", "CACI", "KTOS",
           "AVAV", "MRCY", "TXT", "TDG", "HEI", "CW", "BWXT", "KBR", "PSN", "AMTM", "VVX", "OSK",
           "HXL", "TDY", "MOG.A", "WWD", "HWM", "DRS", "PLTR", "AXON"}
SPACE = {"RKLB", "PL", "BKSY", "RDW", "LUNR", "ASTS", "IRDM", "VSAT", "SATS"}
TECH = {"MSFT", "ORCL", "GOOGL", "AMZN", "IBM", "ACN", "CSCO", "DELL", "MSI", "PLTR", "NOW", "CRM"}
HEALTH = {"MCK", "CAH", "HUM", "CNC", "UNH", "PFE", "MRNA", "MRK", "EBS", "SIGA", "BAX", "MDLN", "ABT",
          "JNJ", "LLY", "CVS", "OMI", "HSIC"}
ENERGY = {"FLR", "XOM", "CVX", "BWXT", "FE", "DUK", "SO", "NEE", "BKR", "HAL"}


def sector_for(ticker: str, agency: str = "") -> str:
    t = ticker.upper()
    if t in SPACE:
        return "space"
    if t in DEFENSE:
        return "defense"
    if t in HEALTH:
        return "health"
    if t in TECH:
        return "tech"
    if t in ENERGY:
        return "energy"
    a = agency.lower()
    if any(k in a for k in ("defense", "war", "army", "navy", "air force", "missile")):
        return "defense"
    if any(k in a for k in ("veterans", "health", "medic", "disease")):
        return "health"
    if "aeronautics" in a or "nasa" in a:
        return "space"
    if "energy" in a:
        return "energy"
    return "industrial"


def add_sector_context(signals: list[dict], book, log=print) -> int:
    """Attach sector name and the peer group's move over the same window."""
    done = 0
    for s in signals:
        if s.get("kind") != "contract" or not s.get("trade_date") or s.get("change_pct") is None:
            continue
        key = sector_for(s["ticker"], f"{s.get('agency', '')} {s.get('sub_agency', '')}")
        etf, label = SECTORS[key]
        rows = book.history(etf)
        then = close_on_or_before(rows, s["trade_date"])
        if not rows or not then:
            continue
        now = rows[-1][1]
        s["sector"] = label
        s["sector_pct"] = round((now / then - 1) * 100, 1)
        done += 1
    log(f"  sector context added to {done} contracts")
    return done
