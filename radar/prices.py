"""Free daily closing prices, used to show how a stock moved since a trade.

Primary source is Stooq's CSV download; Yahoo's chart endpoint is the
fallback. Both are free and keyless but unofficial, so every failure is
soft: a signal simply has no performance figure.
"""

from __future__ import annotations

import bisect
import csv
import datetime as dt
import io
import json

STOOQ = "https://stooq.com/q/d/l/?s={sym}&i=d&d1={d1}&d2={d2}"
YAHOO = ("https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
         "?interval=1d&period1={p1}&period2={p2}")


def stooq_symbol(ticker: str) -> str:
    return ticker.lower().replace(".", "-") + ".us"


def yahoo_symbol(ticker: str) -> str:
    return ticker.upper().replace(".", "-")


def parse_stooq(text: str) -> list[tuple[str, float]]:
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            out.append((row["Date"], float(row["Close"])))
        except (KeyError, TypeError, ValueError):
            continue
    return sorted(out)


def parse_yahoo(text: str) -> list[tuple[str, float]]:
    try:
        res = json.loads(text)["chart"]["result"][0]
        stamps = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError, ValueError):
        return []
    out = []
    for t, c in zip(stamps, closes):
        if c is not None:
            day = dt.datetime.fromtimestamp(t, dt.timezone.utc).date().isoformat()
            out.append((day, float(c)))
    return sorted(out)


class PriceBook:
    """Looks up and caches closing-price history per ticker for one run."""

    def __init__(self, fetcher, start: dt.date, today: dt.date | None = None, log=print):
        self.fetcher = fetcher
        self.start = start
        self.today = today or dt.date.today()
        self.log = log
        self.hist: dict[str, list[tuple[str, float]]] = {}
        self.source_ok = {"stooq": 0, "yahoo": 0, "none": 0}

    def history(self, ticker: str) -> list[tuple[str, float]]:
        if ticker in self.hist:
            return self.hist[ticker]
        d1, d2 = self.start.strftime("%Y%m%d"), self.today.strftime("%Y%m%d")
        rows: list[tuple[str, float]] = []
        try:
            # Cached per day (URL contains today's date) to stay polite.
            body = self.fetcher.get(STOOQ.format(sym=stooq_symbol(ticker), d1=d1, d2=d2))
            rows = parse_stooq(body.decode("utf-8", "replace")) if body else []
            if rows:
                self.source_ok["stooq"] += 1
        except Exception:  # noqa: BLE001
            rows = []
        if not rows:
            try:
                p1 = int(dt.datetime.combine(self.start, dt.time()).timestamp())
                p2 = int(dt.datetime.combine(self.today + dt.timedelta(days=1), dt.time()).timestamp())
                body = self.fetcher.get(YAHOO.format(sym=yahoo_symbol(ticker), p1=p1, p2=p2))
                rows = parse_yahoo(body.decode("utf-8", "replace")) if body else []
                if rows:
                    self.source_ok["yahoo"] += 1
            except Exception:  # noqa: BLE001
                rows = []
        if not rows:
            self.source_ok["none"] += 1
        self.hist[ticker] = rows
        return rows


def close_on_or_before(rows: list[tuple[str, float]], day: str) -> float | None:
    i = bisect.bisect_right([d for d, _ in rows], day)
    return rows[i - 1][1] if i else None


def add_performance(signals: list[dict], book: PriceBook) -> None:
    """Attach price_then / price_now / change_pct to each signal in place."""
    for s in signals:
        if not s.get("ticker") or not s.get("trade_date"):
            continue
        rows = book.history(s["ticker"])
        if not rows:
            continue
        then = s.get("avg_price") or close_on_or_before(rows, s["trade_date"])
        now_day, now = rows[-1]
        if not then or then <= 0:
            continue
        s["price_then"] = round(then, 2)
        s["price_now"] = round(now, 2)
        s["price_date"] = now_day
        s["change_pct"] = round((now - then) / then * 100, 1)
