"""
Build the travisEATSbugs wordmark as an SVG using Unbounded Bold glyph paths.

Brand casing pattern: lowercase actor + UPPERCASE verb + lowercase object.
- 'travis' — lowercase
- 'EATS'   — uppercase (visually emphasized via cap-height alone, Unbounded
            has distinctive taller uppercase forms)
- 'bugs'   — lowercase

All text is converted to <path> elements so the final SVG has no font dependency.
"""

from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "brand" / "fonts" / "Unbounded-Bold.ttf"
OUT = ROOT / "brand" / "wordmark.svg"

TEXT = "travisEATSbugs"
FONT_SIZE_PX = 200  # in design units, scaled at compose time

font = TTFont(str(FONT_PATH))
upem = font["head"].unitsPerEm
cmap = font.getBestCmap()
glyph_set = font.getGlyphSet()
hmtx = font["hmtx"]
ascent = font["OS/2"].sTypoAscender
descent = font["OS/2"].sTypoDescender
line_height = ascent - descent

# Per-character kerning is via the kern table (or GPOS, which is more complete).
# For a brand wordmark, manual tracking adjustment usually beats raw font kerning.
# We'll apply a global negative-tracking value to tighten things up.
TRACKING_EM = -0.01  # negative = tighter, in em units
WORD_GAP_EM = 0.06   # extra space inserted at case-change boundaries (travis|EATS|bugs)


def char_to_path_and_advance(c):
    """Return (path_d_string, advance_width_in_design_units) for a single character."""
    glyph_name = cmap[ord(c)]  # getBestCmap returns codepoint -> glyph_name directly
    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    advance = hmtx[glyph_name][0]
    return pen.getCommands(), advance


# Build SVG path-elements positioned with translations
elements = []
cursor_x = 0
min_x, max_x = float("inf"), 0
prev_is_upper = None
for ch in TEXT:
    # Add word-boundary gap when case changes (lowercase<->uppercase transition)
    if prev_is_upper is not None and prev_is_upper != ch.isupper():
        cursor_x += WORD_GAP_EM * upem
    d, advance = char_to_path_and_advance(ch)
    if d:
        # Glyph is drawn in font's coord system: y goes up (positive),
        # baseline at y=0. We need y down (SVG convention), so flip via scale(1, -1).
        elements.append(
            f'  <path transform="translate({cursor_x:.2f} 0)" d="{d}"/>'
        )
    cursor_x += advance + TRACKING_EM * upem
    max_x = max(max_x, cursor_x)
    prev_is_upper = ch.isupper()

total_width = cursor_x
total_height = line_height

# Place baseline at y=ascent so all glyphs render in positive y space.
# Outer group flips y-axis to convert font space to SVG space.
group_transform = f"translate(0 {ascent:.2f}) scale(1 -1)"

pad_x = upem * 0.04
pad_y = upem * 0.04
vb_x = -pad_x
vb_y = -pad_y
vb_w = total_width + 2 * pad_x
vb_h = total_height + 2 * pad_y

# Emit viewBox only (no width/height) so consumers control display size via
# CSS or container width. The aspect ratio is preserved by viewBox.
svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x:.2f} {vb_y:.2f} {vb_w:.2f} {vb_h:.2f}">
 <g id="wordmark" transform="{group_transform}">
{chr(10).join(elements)}
 </g>
</svg>
'''
OUT.write_text(svg)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
print(f"  viewBox: {vb_x:.0f} {vb_y:.0f} {vb_w:.0f} {vb_h:.0f}  (em={upem})")
print(f"  text width: {total_width:.0f} units = {total_width / upem:.2f}em")
