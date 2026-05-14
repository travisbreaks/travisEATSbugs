"""
Convert bug-electric.svg's white-filled circuit paths into actual transparent
cutouts using an SVG <mask>. So the bug works on any background color, not
just the mouth's white interior.

Strategy:
- Find all paths with fill="#fff" (or "white"). Treat them as cutout shapes.
- Find all paths WITHOUT a fill attr (default black). Treat them as body shapes.
- Wrap body shapes in <g mask="url(#cutouts)">.
- The mask has a white rect (keep everything) + cutout paths in black (drop them).

Output:
  brand/bug-electric.svg              <- overwritten with transparent-circuit version
  brand/bug-electric-opaque.svg       <- backup of the white-filled original
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "bug-electric.svg"
BACKUP = ROOT / "brand" / "bug-electric-opaque.svg"

text = SRC.read_text()

# Backup the original before overwriting
BACKUP.write_text(text)

# Parse viewBox dimensions
vb_match = re.search(r'\bviewBox="([^"]+)"', text)
if not vb_match:
    raise SystemExit("no viewBox")
vb = vb_match.group(1).split()
vb_x, vb_y, vb_w, vb_h = (float(v) for v in vb)

# Extract all <path ... /> or <path ...></path> elements
paths = re.findall(r"<path\b[^>]*(?:/>|>[^<]*</path>)", text)

body_paths = []
cutout_paths = []
for p in paths:
    fill_match = re.search(r'\bfill="([^"]+)"', p)
    fill = fill_match.group(1).lower() if fill_match else None
    if fill in ("#fff", "#ffffff", "white"):
        # Strip the fill attribute since the mask is what controls visibility now,
        # and replace with fill="black" for the mask group (black = cut).
        p_for_mask = re.sub(r'\s*fill="[^"]+"', "", p)
        # In the mask, the cutout shape needs fill=black so the mask blacks-out that region
        # (mask: white=keep, black=cut). Re-add fill="black" explicitly.
        p_for_mask = p_for_mask.replace("<path", '<path fill="black"', 1)
        cutout_paths.append(p_for_mask)
    else:
        body_paths.append(p)

if not cutout_paths:
    print("No cutout paths found (fill=#fff). Nothing to do.")
    raise SystemExit(0)

mask_id = "circuit-cutouts"
out = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_match.group(1)}">
 <defs>
  <mask id="{mask_id}" maskUnits="userSpaceOnUse">
   <rect x="{vb_x}" y="{vb_y}" width="{vb_w}" height="{vb_h}" fill="white"/>
   {chr(10).join("   " + p for p in cutout_paths)}
  </mask>
 </defs>
 <g mask="url(#{mask_id})">
  {chr(10).join("  " + p for p in body_paths)}
 </g>
</svg>
'''
SRC.write_text(out)
print(f"  {len(body_paths)} body paths, {len(cutout_paths)} circuit cutouts via mask")
print(f"  wrote {SRC.relative_to(ROOT)} ({SRC.stat().st_size // 1024} KB)")
print(f"  backup at {BACKUP.relative_to(ROOT)}")
