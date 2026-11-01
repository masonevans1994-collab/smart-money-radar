# Smart Money Radar (prototype)

```
 GitHub Actions (free, every 30 min)        Phone app (app/)
 ┌──────────────────────────────┐          ┌──────────────────────┐
 │ python -m radar              │  JSON    │ Expo / React Native  │
 │  SEC Form 4 + House filings  │ ───────▶ │ iPhone + Android     │
 │  → signals.json on Pages     │          │ feed, search, alerts │
 └──────────────────────────────┘          └──────────────────────┘
```

- **Mobile app:** see [`app/README.md`](app/README.md) to run it on your phone.
- **Backend:** `.github/workflows/radar.yml` runs the Python code below on a
  schedule and publishes `signals.json` for the app.

Ranks the most notable **corporate insider buys** (SEC Form 4) and **U.S. House
stock trades** (STOCK Act periodic transaction reports) from free public
filings, scores each 0–100, explains *why* in plain English, and writes a
mobile-friendly dashboard.

## Quick start

```bash
pip install -r requirements.txt

# Preview with made-up data (no internet needed)
python -m radar --demo
open dashboard.html

# Real data: the SEC requires a User-Agent with your name and email
export SEC_USER_AGENT="Your Name you@example.com"
python -m radar --days 3            # last 3 business days of Form 4s
python -m radar --days 1 --min-score 50 --no-congress
```

Outputs `dashboard.html` (open it in any browser) and `signals.json` (for a
future API or app). Responses are cached in `.cache/`, so re-runs are fast.

A full day of Form 4s is roughly 1,000–2,000 filings at ~8 requests/second,
so a 3-day scan takes a few minutes. Use `--max-filings` to cap it while testing.

## How scoring works (`radar/scoring.py`)

| Insider buys | Points |
|---|---|
| Size of purchase ($50K → $10M+) | 5–40 |
| Role (CEO/President/Chair > CFO/COO > officer > director) | 3–25 |
| Stake increase (new position or 2x stake) | 5–15 |
| Cluster: 2 or 3+ insiders buying the same stock | 10–20 |
| Pre-scheduled 10b5-1 plan | −10 |

| Congress trades | Points |
|---|---|
| Size (midpoint of disclosed range) | 5–35 |
| Purchase vs sale | 15 / 5 |
| Options trade | 10 |
| Several members making the same move | 10–20 |
| Disclosed later than the 45-day STOCK Act limit | 10 |

**Cross-signal:** +15 when company insiders and members of Congress are both buying the same ticker.

## Data sources

- SEC EDGAR daily index and Form 4 XML: `sec.gov/Archives/edgar/daily-index/`
- House Clerk: `disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip`
  plus one PDF per filing. Scanned paper filings can't be parsed, so they
  show up as "needs a manual look" in the dashboard footer.

## Tests

```bash
pytest -q
```

The tests use sample filings in the real EDGAR/House formats, including a
generated PDF that runs through the actual PDF reader.

## Suggested next steps

1. **Senate trades** from efdsearch.senate.gov (needs a terms-of-use session).
2. **Price moves**: add prices so each signal shows "+12% since the buy",
   plus the "why did it move?" alerts.
3. **Scheduler + alerts**: run every 15 minutes during market hours and
   push or email new 70+ signals.
4. **Committee-conflict flag**: match each member's committees to the
   stock's sector.
5. **Turn it into a product**: put `signals.json` behind a small API, then
   a web app with accounts, a watchlist and a paid tier for instant alerts.

*For information only, not investment advice.*
