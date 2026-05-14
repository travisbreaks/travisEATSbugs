"""
Compose final electric logos in two variants:
- brand/logo-electric.svg                 (mouth from lockup-source + electric bug, NO text)
- brand/logo-electric-lockup.svg          (mouth + electric bug + Unbounded wordmark below)

Uses the mouth path from brand/logo-lockup.svg (Mouth B, from the lockup source).
Drops the embedded vtraced bug + vtraced wordmark in favor of Travis's
hand-drawn electric bug and the clean Unbounded Bold wordmark.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCKUP_SRC = ROOT / "brand" / "logo-lockup.svg"  # source of Mouth B
BUG_SRC = ROOT / "brand" / "bug-electric.svg"    # Travis's transparent-circuit bug
WORDMARK_SRC = ROOT / "brand" / "wordmark.svg"   # custom Unbounded Bold wordmark

OUT_ICON = ROOT / "brand" / "logo-electric.svg"
OUT_LOCKUP = ROOT / "brand" / "logo-electric-lockup.svg"

NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")
TRANSLATE_RE = re.compile(r"translate\(\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*\)")


def path_translate(p):
    t = re.search(r'\btransform="([^"]+)"', p)
    if not t:
        return 0.0, 0.0
    m = TRANSLATE_RE.search(t.group(1))
    return (float(m.group(1)), float(m.group(2))) if m else (0.0, 0.0)


def path_bbox(p):
    d = re.search(r'\bd="([^"]+)"', p)
    if not d:
        return None
    nums = [float(n) for n in NUM_RE.findall(d.group(1))]
    if len(nums) < 4:
        return None
    tx, ty = path_translate(p)
    xs = [n + tx for n in nums[0::2]]
    ys = [n + ty for n in nums[1::2]]
    return min(xs), min(ys), max(xs), max(ys)


# --- Extract the mouth from logo-lockup.svg's <g id="icon"> group ---
lockup_text = LOCKUP_SRC.read_text()
# Find the <g id="icon"> block, grab paths inside it
icon_block_match = re.search(r'<g\s+id="icon">(.*?)</g>', lockup_text, re.DOTALL)
if not icon_block_match:
    raise SystemExit("could not find <g id='icon'> in logo-lockup.svg")
icon_paths = re.findall(r"<path\b[^/]*/>", icon_block_match.group(1))

# Find the path with the largest bbox area; that's the mouth frame (envelops everything).
def bbox_area(p):
    b = path_bbox(p)
    if not b:
        return 0
    return (b[2] - b[0]) * (b[3] - b[1])

mouth_path = max(icon_paths, key=bbox_area)
mb = path_bbox(mouth_path)
print(f"Mouth B bbox: ({mb[0]:.0f}, {mb[1]:.0f}) .. ({mb[2]:.0f}, {mb[3]:.0f})")
print(f"   width={mb[2]-mb[0]:.0f} height={mb[3]-mb[1]:.0f}")

# The bug was previously sitting at x=453..801, y=455..816 in the icon-source canvas.
# logo-lockup.svg canvas is also 1254x1254, but the lockup-source bug occupies
# a different position. Let me find it from the OTHER icon paths.
bug_paths = [p for p in icon_paths if p is not mouth_path]
bug_bboxes = [path_bbox(p) for p in bug_paths if path_bbox(p)]
bx0 = min(b[0] for b in bug_bboxes)
by0 = min(b[1] for b in bug_bboxes)
bx1 = max(b[2] for b in bug_bboxes)
by1 = max(b[3] for b in bug_bboxes)
print(f"Original bug bbox in this canvas: ({bx0:.0f}, {by0:.0f}) .. ({bx1:.0f}, {by1:.0f})")
print(f"   width={bx1-bx0:.0f} height={by1-by0:.0f}")

# --- Extract electric bug content (everything inside <svg>...</svg>) ---
bug_text = BUG_SRC.read_text()
bug_inner = re.search(r"<svg\b[^>]*>(.*?)</svg>", bug_text, re.DOTALL).group(1).strip()
# Parse bug viewBox to know its native dimensions
bug_vb = re.search(r'\bviewBox="([^"]+)"', bug_text)
bug_vb_parts = [float(v) for v in bug_vb.group(1).split()]
bug_vb_x, bug_vb_y, bug_vb_w, bug_vb_h = bug_vb_parts
print(f"Electric bug viewBox: {bug_vb_x} {bug_vb_y} {bug_vb_w} {bug_vb_h}")

# Scale + translate the electric bug to fit the original bug bbox.
# BUG_ENLARGE > 1.0 grows the bug above the original bbox size, centered on
# the original bbox center. Travis asked for "a bit bigger" 2026-05-14.
BUG_ENLARGE = 1.20
target_w = (bx1 - bx0) * BUG_ENLARGE
target_h = (by1 - by0) * BUG_ENLARGE
# Re-anchor: keep the target centered on the original bbox center
bx_center = (bx0 + bx1) / 2
by_center = (by0 + by1) / 2
bx0 = bx_center - target_w / 2
by0 = by_center - target_h / 2
bx1 = bx_center + target_w / 2
by1 = by_center + target_h / 2
PAD_FRACTION = 0.0

# Uniform scale: maintain aspect ratio. Pick min so it fits.
scale_x = target_w / bug_vb_w
scale_y = target_h / bug_vb_h
scale = min(scale_x, scale_y)

# Center the scaled bug in the target bbox
scaled_w = bug_vb_w * scale
scaled_h = bug_vb_h * scale
tx = bx0 + (target_w - scaled_w) / 2 - PAD_FRACTION * (bx1 - bx0)
ty = by0 + (target_h - scaled_h) / 2 - PAD_FRACTION * (by1 - by0)
bug_transform = f"translate({tx:.2f} {ty:.2f}) scale({scale:.4f})"
print(f"Electric bug transform: {bug_transform}")
print(f"   scale={scale:.4f}")

# --- Read uniqueness-preserving mask defs from bug-electric.svg ---
# The bug has a <defs><mask> block that needs to come through.
bug_defs_match = re.search(r"<defs>(.*?)</defs>", bug_text, re.DOTALL)
bug_defs = bug_defs_match.group(1).strip() if bug_defs_match else ""
# The mask-referencing group inside the bug
bug_body_match = re.search(r"<g\s+mask=[^>]*>.*?</g>", bug_text, re.DOTALL)
bug_body = bug_body_match.group(0) if bug_body_match else bug_inner

# --- Build icon-only output ---
icon_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254">
 <defs>
  {bug_defs}
 </defs>
 <g id="mouth">
  {mouth_path}
 </g>
 <g id="bug" transform="{bug_transform}">
  {bug_body}
 </g>
</svg>
'''
OUT_ICON.write_text(icon_svg)
print(f"\n  wrote {OUT_ICON.relative_to(ROOT)} ({OUT_ICON.stat().st_size // 1024} KB)")

# --- Build lockup variant: icon + wordmark below ---
# Read wordmark + extract its inner content
wm_text = WORDMARK_SRC.read_text()
wm_inner = re.search(r"<svg\b[^>]*>(.*?)</svg>", wm_text, re.DOTALL).group(1).strip()
wm_vb = re.search(r'\bviewBox="([^"]+)"', wm_text)
wm_vb_parts = [float(v) for v in wm_vb.group(1).split()]
wm_vb_x, wm_vb_y, wm_vb_w, wm_vb_h = wm_vb_parts

# Lockup canvas: 1254 wide, expand height to fit wordmark below the icon.
# Mouth B's frame extends to about y=961, so place the wordmark immediately
# below with a tight gap (Travis 2026-05-14: previous distance was too much).
ICON_BOTTOM = 965   # right at where the mouth frame visually ends
WORDMARK_GAP = 15   # tight space between icon and wordmark
WORDMARK_TARGET_W = 980  # width of wordmark on the lockup canvas

wm_scale = WORDMARK_TARGET_W / wm_vb_w
wm_scaled_h = wm_vb_h * wm_scale
wm_tx = (1254 - WORDMARK_TARGET_W) / 2 - wm_vb_x * wm_scale
wm_ty = ICON_BOTTOM + WORDMARK_GAP - wm_vb_y * wm_scale

lockup_h = ICON_BOTTOM + WORDMARK_GAP + wm_scaled_h + 50  # bottom padding
wm_transform = f"translate({wm_tx:.2f} {wm_ty:.2f}) scale({wm_scale:.4f})"

lockup_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 {lockup_h:.0f}">
 <defs>
  {bug_defs}
 </defs>
 <g id="mouth">
  {mouth_path}
 </g>
 <g id="bug" transform="{bug_transform}">
  {bug_body}
 </g>
 <g id="wordmark" transform="{wm_transform}">
  {wm_inner}
 </g>
</svg>
'''
OUT_LOCKUP.write_text(lockup_svg)
print(f"  wrote {OUT_LOCKUP.relative_to(ROOT)} ({OUT_LOCKUP.stat().st_size // 1024} KB)")
