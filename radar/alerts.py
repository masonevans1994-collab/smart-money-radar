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
    icon = {"contract": "🏛️", "congress": "🗳️", "insider": "💼"}.get(s.get("kind"), "•")
    lines = [f"{icon} {s['ticker']} · score {s['score']}", s["headline"]]
    lines += [f"• {r}" for r in s.get("reasons", [])[1:4]]
    if s.get("change_pct") is not None:
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
