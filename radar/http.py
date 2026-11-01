"""Small polite HTTP client: rate limiting, retries and an on-disk cache.

The SEC requires a descriptive User-Agent ("Your Name your@email.com") and
asks clients to stay under 10 requests per second.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path


class Blocked(RuntimeError):
    """The site refused us (e.g. SEC's 'undeclared automated tool' page)."""


def _title(body: bytes) -> str:
    m = re.search(rb"<title>(.*?)</title>", body or b"", re.S | re.I)
    return m.group(1).decode("utf-8", "replace").strip() if m else "access denied"


class Fetcher:
    def __init__(self, user_agent: str, min_interval: float = 0.12,
                 cache_dir: str | os.PathLike = ".cache", retries: int = 3):
        if not user_agent or "@" not in user_agent:
            raise ValueError(
                "Set a User-Agent with your name and email, e.g. "
                "SEC_USER_AGENT='Jane Doe jane@example.com'")
        self.user_agent = user_agent
        self.min_interval = min_interval
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.retries = retries
        self._last = 0.0

    def _cache_path(self, url: str) -> Path:
        return self.cache_dir / hashlib.sha256(url.encode()).hexdigest()

    def get(self, url: str, cache: bool = True) -> bytes | None:
        """Return the body, None on 404 (e.g. no index on a holiday).

        Raises Blocked on 403 so a refused request isn't mistaken for
        "no data".
        """
        path = self._cache_path(url)
        if cache and path.exists():
            return path.read_bytes()

        delay = 1.0
        for attempt in range(self.retries + 1):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            req = urllib.request.Request(url, headers={
                "User-Agent": self.user_agent,
                "Accept-Encoding": "identity",
            })
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = resp.read()
                if cache:
                    path.write_bytes(body)
                return body
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code == 403:
                    raise Blocked(f"{url}: 403 {_title(e.read())}") from None
                if e.code in (429, 500, 502, 503, 504) and attempt < self.retries:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
            except urllib.error.URLError:
                if attempt < self.retries:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        return None
