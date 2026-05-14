"""
Generate brand/og.png for the travis-eats-bugs marketing page.

1200x630 (Open Graph standard), warm dark background, mouth+bug icon centered
in warm cream, generous negative space. No text per Travis's spec.
"""

import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# OG image deploys with the marketing page on travismakes-org
OUT_DIR = ROOT.parent / "travismakes-org" / "travis-eats-bugs"
LOGO_SRC = OUT_DIR / "logo.svg"
TEMP_SVG = OUT_DIR / ".og-temp.svg"
OUT_PNG = OUT_DIR / "og.png"

OG_W, OG_H = 1200, 630
ICON_TARGET_H = 460  # generous canvas + room around the icon
BG_COLOR = "#0c0908"   # warm dark void per canon §0
FG_COLOR = "#fcf6ec"   # warm cream per canon §0

logo_text = LOGO_SRC.read_text()

# Pull viewBox from logo so we know native dimensions
m = re.search(r'\bviewBox="([^"]+)"', logo_text)
if not m:
    raise SystemExit("logo.svg missing viewBox")
vb = [float(v) for v in m.group(1).split()]
vb_x, vb_y, vb_w, vb_h = vb

# Scale icon to ICON_TARGET_H, keep aspect
scale = ICON_TARGET_H / vb_h
icon_w = vb_w * scale
icon_h = vb_h * scale
icon_tx = (OG_W - icon_w) / 2 - vb_x * scale
icon_ty = (OG_H - icon_h) / 2 - vb_y * scale

# Pull just the visible content of logo.svg (everything between <svg> and </svg>),
# wrap in a group that paints in cream via fill="currentColor" inheritance.
inner = re.search(r"<svg\b[^>]*>(.*?)</svg>", logo_text, re.DOTALL).group(1).strip()

# Force the icon group to render in cream. The mouth path has no fill (defaults to
# black via SVG default); the bug paths inherit currentColor. Set color on the
# wrapper and override fill via a CSS-like outer attribute.
master = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {OG_W} {OG_H}" width="{OG_W}" height="{OG_H}">
  <rect width="{OG_W}" height="{OG_H}" fill="{BG_COLOR}"/>
  <g transform="translate({icon_tx:.2f} {icon_ty:.2f}) scale({scale:.4f})" fill="{FG_COLOR}" color="{FG_COLOR}">
    {inner}
  </g>
</svg>
"""
TEMP_SVG.write_text(master)

subprocess.run(
    ["rsvg-convert", "-w", str(OG_W), "-h", str(OG_H), str(TEMP_SVG), "-o", str(OUT_PNG)],
    check=True,
)
TEMP_SVG.unlink()
print(f"wrote {OUT_PNG.name} ({OUT_PNG.stat().st_size // 1024} KB, {OG_W}x{OG_H})")
