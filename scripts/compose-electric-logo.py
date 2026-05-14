"""
Compose the full electric logo:
- mouth frame from brand/logo.svg (path 0)
- electric bug from brand/bug-electric.svg (transformed into position)

The original bug occupied x=453..801, y=455..816 inside the 1254x1254 mouth canvas.
The bug-electric viewBox is 0 0 428 441 (matches the bug-only.svg extraction we
handed Travis for Illustrator). Translate by (413, 415) to land it in the same spot.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGO_SRC = ROOT / "brand" / "logo.svg"
BUG_SRC = ROOT / "brand" / "bug-electric.svg"
OUT = ROOT / "brand" / "logo-electric.svg"

# Read both sources
logo_text = LOGO_SRC.read_text()
bug_text = BUG_SRC.read_text()

# Extract mouth path (path 0 — the first <path>) from logo.svg
paths_in_logo = re.findall(r"<path\b[^/]*/>", logo_text)
if not paths_in_logo:
    raise SystemExit("no paths found in logo.svg")
mouth_path = paths_in_logo[0]

# Extract bug content (everything inside <svg>...</svg>) from bug-electric.svg
m = re.search(r"<svg\b[^>]*>(.*?)</svg>", bug_text, re.DOTALL)
if not m:
    raise SystemExit("could not parse bug-electric.svg <svg> body")
bug_body = m.group(1).strip()

# Compose: viewBox from original logo (1254x1254), mouth first, then bug translated
out_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="1254" height="1254">
  <g id="mouth">
    {mouth_path}
  </g>
  <g id="bug" transform="translate(413 415)">
    {bug_body}
  </g>
</svg>
'''
OUT.write_text(out_svg)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
