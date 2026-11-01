"""Make the exported web app installable on phones (home-screen icon, full screen)."""
import json
import shutil
import sys
from pathlib import Path

site, base = Path(sys.argv[1]), sys.argv[2].rstrip("/")  # e.g. public /smart-money-radar
assets = Path(__file__).resolve().parent.parent / "app" / "assets"
for name in ("apple-touch-icon.png", "icon-192.png", "icon-512.png"):
    shutil.copy(assets / name, site / name)
(site / "manifest.webmanifest").write_text(json.dumps({
    "name": "Smart Money Radar", "short_name": "Radar",
    "start_url": f"{base}/", "scope": f"{base}/", "display": "standalone",
    "background_color": "#0d1117", "theme_color": "#0d1117",
    "icons": [{"src": f"{base}/icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": f"{base}/icon-512.png", "sizes": "512x512", "type": "image/png"}],
}, indent=2))
index = site / "index.html"
html = index.read_text()
tags = (f'<link rel="apple-touch-icon" href="{base}/apple-touch-icon.png">'
        f'<link rel="manifest" href="{base}/manifest.webmanifest">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
        '<meta name="apple-mobile-web-app-title" content="Radar">'
        # Keep the site out of search engines until the app is reviewed for a public launch.
        '<meta name="robots" content="noindex, nofollow">')
if "apple-touch-icon" not in html:
    index.write_text(html.replace("</head>", tags + "</head>", 1))
root = site if base.count("/") <= 1 else site.parent
(root / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
print("installable web app ready")
