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

# Licensed providers (set PRICE_PROVIDER + PRICE_API_KEY as repo secrets to switch).
# Both offer plans that allow display in an app; check the plan you pick.
TIINGO = "https://api.tiingo.com/tiingo/daily/{sym}/prices?startDate={start}&endDate={end}&token={key}"
POLYGON = ("https://api.polygon.io/v2/aggs/ticker/{sym}/range/1/day/{start}/{end}"
           "?adjusted=true&sort=asc&limit=50000&apiKey={key}")

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


def parse_tiingo(text: str) -> list[tuple[str, float]]:
    try:
        rows = json.loads(text)
        return sorted((r["date"][:10], float(r["adjClose"] if r.get("adjClose") is not None else r["close"]))
                      for r in rows if r.get("close") is not None)
    except (KeyError, TypeError, ValueError):
        return []


def parse_polygon(text: str) -> list[tuple[str, float]]:
    try:
        rows = json.loads(text).get("results") or []
        return sorted((dt.datetime.fromtimestamp(r["t"] / 1000, dt.timezone.utc).date().isoformat(), float(r["c"]))
                      for r in rows if r.get("c") is not None)
    except (KeyError, TypeError, ValueError):
        return []


PROVIDERS = {
    "tiingo": (TIINGO, parse_tiingo, lambda t: t.lower().replace(".", "-")),
    "polygon": (POLYGON, parse_polygon, lambda t: t.upper().replace(".", "-")),
}


class PriceBook:
    """Looks up and caches closing-price history per ticker for one run."""

    # Benchmarks and sector funds are always looked up, even when the budget is spent.
    ESSENTIAL = {"SPY", "IWM", "ITA", "XLV", "XLK", "XLI", "XLE", "ARKX", "XLF", "XLU", "XLB", "XLP", "XLY", "XLC", "XLRE"}

    def __init__(self, fetcher, start: dt.date, today: dt.date | None = None, log=print,
                 provider: str | None = None, api_key: str | None = None, budget_s: float | None = None):
        import os
        import time
        self.fetcher = fetcher
        # Free price feeds throttle; past this many seconds, new (non-essential) tickers
        # are skipped and keep their last known numbers instead of stalling the build.
        self.budget_s = budget_s if budget_s is not None else float(os.environ.get("PRICE_BUDGET_S") or 0) or None
        self._t0 = time.monotonic()
        self.skipped = 0
        self.start = start
        self.today = today or dt.date.today()
        self.provider = (provider or os.environ.get("PRICE_PROVIDER") or "").lower()
        self.api_key = api_key or os.environ.get("PRICE_API_KEY") or ""
        if self.provider and self.provider not in PROVIDERS:
            log(f"  unknown PRICE_PROVIDER {self.provider!r}; using the free feeds")
            self.provider = ""
        elif self.provider and not self.api_key:
            log(f"  PRICE_PROVIDER={self.provider} needs PRICE_API_KEY; using the free feeds")
            self.provider = ""
        self.log = log
        self.hist: dict[str, list[tuple[str, float]]] = {}
        self.source_ok = {"stooq": 0, "yahoo": 0, "none": 0}

    def over_budget(self) -> bool:
        import time
        return bool(self.budget_s) and time.monotonic() - self._t0 > self.budget_s

    def history(self, ticker: str) -> list[tuple[str, float]]:
        if ticker in self.hist:
            return self.hist[ticker]
        if ticker not in self.ESSENTIAL and self.over_budget():
            if not self.skipped:
                self.log(f"  price time budget ({self.budget_s:.0f}s) used up; remaining tickers keep their last numbers")
            self.skipped += 1
            return []
        n = len(self.hist) + 1
        if n % 25 == 0:
            import time
            self.log(f"  prices: {n} tickers looked up ({time.monotonic() - self._t0:.0f}s)")
        d1, d2 = self.start.strftime("%Y%m%d"), self.today.strftime("%Y%m%d")
        rows: list[tuple[str, float]] = []
        if self.provider:
            url_t, parse, sym = PROVIDERS[self.provider]
            try:
                body = self.fetcher.get(url_t.format(sym=sym(ticker), start=self.start.isoformat(),
                                                     end=self.today.isoformat(), key=self.api_key))
                rows = parse(body.decode("utf-8", "replace")) if body else []
                if rows:
                    self.source_ok[self.provider] = self.source_ok.get(self.provider, 0) + 1
            except Exception:  # noqa: BLE001
                rows = []
            if rows:
                self.hist[ticker] = rows
                return rows
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
        # Compact daily series for the app's chart: a week before the
        # trade/award through today, at most 60 points.
        lead = (dt.date.fromisoformat(s["trade_date"]) - dt.timedelta(days=10)).isoformat()
        series = [(d, c) for d, c in rows if d >= lead][-60:]
        if len(series) >= 3:
            s["spark"] = [round(c, 2) for _, c in series]
            s["spark_mark"] = next((i for i, (d, _) in enumerate(series) if d >= s["trade_date"]),
                                   len(series) - 1)
