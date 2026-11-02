"""Phone alerts for new high-scoring signals via Discord and/or Telegram.

Configured with GitHub repo secrets (any you set are used):
  DISCORD_WEBHOOK_URL               a channel webhook URL
  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
Thresholds (optional repo variables): ALERT_MIN_CONTRACT (default 60),
ALERT_MIN_OTHER (default 85). Only signals that weren't in the previously
published feed are sent, so you never get the same alert twice.
"""

from __future__ import annotations

import json
import os
import urllib.request


def signal_key(s: dict) -> str:
    """Same identity the app uses for NEW badges."""
    amount = s.get("amount_low") if s.get("kind") == "congress" else s.get("value")
    if isinstance(amount, float) and amount.is_integer():
        amount = int(amount)
    return f"{s.get('kind')}|{s.get('ticker')}|{s.get('who')}|{s.get('trade_date') or ''}|{amount}"


def previous_keys(feed_text: str | None) -> set[str] | None:
    if not feed_text:
        return None
    try:
        feed = json.loads(feed_text)
    except ValueError:
        return None
    rows = feed.get("contracts", []) + feed.get("insiders", []) + feed.get("congress", [])
    return {signal_key(s) for s in rows}


def pick_new(signals: list[dict], prev: set[str] | None, min_contract: int = 60,
             min_other: int = 85, limit: int = 10) -> list[dict]:
    if prev is None:
        return []  # no baseline yet: don't flood on the first run
    out = []
    for s in sorted(signals, key=lambda x: x["score"], reverse=True):
        floor = min_contract if s.get("kind") == "contract" else min_other
        if s["score"] >= floor and signal_key(s) not in prev:
            out.append(s)
    return out[:limit]


def format_alert(s: dict, app_url: str = "") -> str:
    if s.get("kind") == "digest":
        return s["headline"]
    icon = {"contract": "🏛️", "congress": "🗳️", "insider": "💼"}.get(s.get("kind"), "•")
    lines = [f"{icon} {s['ticker']} · score {s['score']}", s["headline"]]
    lines += [f"• {r}" for r in s.get("reasons", [])[1:4]]
    if s.get("change_pct") is not None and not _too_soon(s):
        lines.append(f"Stock {s['change_pct']:+.1f}% since")
    if s.get("url"):
        lines.append(s["url"])
    if app_url:
        lines.append(f"App: {app_url}")
    return "\n".join(lines)


def _post(url: str, payload: dict) -> None:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "smart-money-radar"})
    with urllib.request.urlopen(req, timeout=20):
        pass


def send(alerts: list[dict], app_url: str = "", env=os.environ, post=_post, log=print) -> int:
    if not alerts:
        return 0
    discord = env.get("DISCORD_WEBHOOK_URL")
    tg_token, tg_chat = env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHAT_ID")
    if not discord and not (tg_token and tg_chat):
        log(f"  {len(alerts)} alert(s) ready, but no Discord/Telegram secret is set")
        return 0
    sent = 0
    for s in alerts:
        text = format_alert(s, app_url)
        try:
            if discord:
                post(discord, {"content": text[:1990]})
            if tg_token and tg_chat:
                post(f"https://api.telegram.org/bot{tg_token}/sendMessage",
                     {"chat_id": tg_chat, "text": text[:4000], "disable_web_page_preview": True})
            sent += 1
        except Exception as e:  # noqa: BLE001 - never fail the run over an alert
            log(f"  alert failed: {type(e).__name__}")
            break
    log(f"  sent {sent} alert(s)")
    return sent


def _too_soon(s: dict) -> bool:
    """No trading day since the award yet (signed Friday, read on the weekend)."""
    return bool(s.get("price_date")) and bool(s.get("trade_date")) and s["price_date"] <= s["trade_date"]


def _mv(x: dict) -> str:
    v = x.get("change_pct")
    return "" if v is None or _too_soon(x) else f" (stock {v:+.1f}% since)"


def weekly_digest(contracts: list[dict], today, app_url: str = "") -> str | None:
    """Plain-language summary of the past 7 days' contract awards."""
    import datetime as dt
    cutoff = (today - dt.timedelta(days=7)).isoformat()
    recent = [c for c in contracts if (c.get("trade_date") or "") >= cutoff]
    if not recent:
        return None
    total = sum(c["value"] for c in recent)
    companies = {c["ticker"] for c in recent}
    big = sorted(recent, key=lambda c: c["value"], reverse=True)[:3]
    movers = sorted((c for c in recent if c.get("change_pct") is not None and not _too_soon(c)),
                    key=lambda c: c["change_pct"], reverse=True)
    lines = [f"📋 Your week in government contracts",
             f"{len(recent)} contract{'s' if len(recent) != 1 else ''} worth ${total / 1e6:,.0f}M went to "
             f"{len(companies)} public compan{'ies' if len(companies) != 1 else 'y'}.", "",
             "Biggest:"]
    lines += [f"• ${c['value'] / 1e6:,.0f}M to {c.get('company', c['ticker'])} ({c['ticker']}){_mv(c)}" for c in big]
    if movers:
        lines += ["", f"Best mover: {movers[0]['ticker']} {movers[0]['change_pct']:+.1f}% since its award",
                  f"Worst mover: {movers[-1]['ticker']} {movers[-1]['change_pct']:+.1f}% since its award"]
    if app_url:
        lines += ["", f"Open Radar: {app_url}"]
    lines += ["", "From public records. Not investment advice."]
    return "\n".join(lines)
