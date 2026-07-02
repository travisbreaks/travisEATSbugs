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
OUT_PNG = OUT_DIR / "og-v2.png"

OG_W, OG_H = 1200, 630
ICON_TARGET_H = 540  # height of the VISIBLE content (mouth+bug), not the full
                     # viewBox. The icon SVG has ~25% internal padding so a
                     # naive viewBox-based scale leaves the visible mark tiny.
BG_COLOR = "#0c0908"   # warm dark void per canon §0
FG_COLOR = "#fcf6ec"   # warm cream per canon §0

logo_text = LOGO_SRC.read_text()

# Pull viewBox from logo so we know native dimensions
m = re.search(r'\bviewBox="([^"]+)"', logo_text)
if not m:
    raise SystemExit("logo.svg missing viewBox")
vb = [float(v) for v in m.group(1).split()]
vb_x, vb_y, vb_w, vb_h = vb


# Compute the actual visible-content bbox by scanning all path d-attributes
# (accounting for per-path transform="translate(...)"). The full viewBox has
# significant empty padding so we want to scale based on the content bbox.
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")
TRANSLATE_RE = re.compile(
    r"translate\(\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*\)"
)


def content_bbox(svg_text: str) -> tuple[float, float, float, float]:
    # Strip out <defs>...</defs> (its mask geometry is internal, not visible).
    defs = re.search(r"<defs\b.*?</defs>", svg_text, re.DOTALL)
    scan_target = svg_text.replace(defs.group(0), "") if defs else svg_text
    paths = re.findall(r"<path\b[^/]*/>", scan_target)
    min_x, min_y, max_x, max_y = float("inf"), float("inf"), float("-inf"), float("-inf")
    for p in paths:
        d_m = re.search(r'\bd="([^"]+)"', p)
        if not d_m:
            continue
        nums = [float(n) for n in NUM_RE.findall(d_m.group(1))]
        if len(nums) < 4:
            continue
        t_m = re.search(r'\btransform="([^"]+)"', p)
        tx, ty = 0.0, 0.0
        if t_m:
            tt = TRANSLATE_RE.search(t_m.group(1))
            if tt:
                tx, ty = float(tt.group(1)), float(tt.group(2))
        xs = [n + tx for n in nums[0::2]]
        ys = [n + ty for n in nums[1::2]]
        min_x = min(min_x, min(xs))
        min_y = min(min_y, min(ys))
        max_x = max(max_x, max(xs))
        max_y = max(max_y, max(ys))
    return min_x, min_y, max_x, max_y


cb = content_bbox(logo_text)
content_x, content_y = cb[0], cb[1]
content_w = cb[2] - cb[0]
content_h = cb[3] - cb[1]

# Scale so the visible content height matches ICON_TARGET_H
scale = ICON_TARGET_H / content_h
icon_w = content_w * scale
icon_h = content_h * scale
# Position so visible content is centered on the canvas. We translate the
# full SVG content by the negative of its bbox offset (times scale) then
# add the canvas-center offset.
icon_tx = (OG_W - icon_w) / 2 - content_x * scale
icon_ty = (OG_H - icon_h) / 2 - content_y * scale

# Pull just the visible content of logo.svg (everything between <svg> and </svg>)
inner = re.search(r"<svg\b[^>]*>(.*?)</svg>", logo_text, re.DOTALL).group(1).strip()

# Force every <path> without an explicit fill attribute to render in cream.
# SVG fill inheritance through nested groups + masks isn't reliable across
# all renderers, so we add an explicit fill on each path that needs one.
# Paths inside the <defs><mask>...</mask></defs> block keep their original
# fills (those define mask geometry, not visible paint).
def add_cream_fill(text: str, fill: str) -> str:
    # Split out any <defs>...</defs> block so we don't touch mask-internal paths.
    defs_match = re.search(r"<defs\b.*?</defs>", text, re.DOTALL)
    defs_block = defs_match.group(0) if defs_match else ""
    rest = text.replace(defs_block, "__DEFS_PLACEHOLDER__") if defs_block else text

    def patch_path(m: re.Match[str]) -> str:
        tag = m.group(0)
        if re.search(r"\bfill\s*=", tag):
            return tag
        # Insert fill="<cream>" right after "<path"
        return tag.replace("<path", f'<path fill="{fill}"', 1)

    rest = re.sub(r"<path\b[^/]*/>", patch_path, rest)
    return rest.replace("__DEFS_PLACEHOLDER__", defs_block)

inner = add_cream_fill(inner, FG_COLOR)

master = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {OG_W} {OG_H}" width="{OG_W}" height="{OG_H}">
  <rect width="{OG_W}" height="{OG_H}" fill="{BG_COLOR}"/>
  <g transform="translate({icon_tx:.2f} {icon_ty:.2f}) scale({scale:.4f})" color="{FG_COLOR}">
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
