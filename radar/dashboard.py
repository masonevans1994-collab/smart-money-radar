"""Render ranked signals into a single self-contained HTML dashboard."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

TEMPLATE = Path(__file__).with_name("dashboard_template.html")


def render(insiders: list[dict], congress: list[dict], review: list[dict],
           demo: bool = False) -> str:
    payload = {
        "generated": dt.datetime.now().strftime("%b %d, %Y %I:%M %p"),
        "demo": demo,
        "insiders": insiders,
        "congress": congress,
        "review": review,
    }
    data = json.dumps(payload, default=str).replace("</", "<\\/")
    return TEMPLATE.read_text().replace("/*__DATA__*/null", data)
