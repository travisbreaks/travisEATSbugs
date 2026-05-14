"""
Extract just the bug (paths 1-4: antennae, head, left body, right body) from
brand/logo.svg into brand/bug-only.svg with a tightened viewBox.

Drops path 0 (the mouth/teeth frame) so Illustrator opens with the bug
filling the canvas.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "logo.svg"
OUT = ROOT / "brand" / "bug-only.svg"

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


src_text = SRC.read_text()
paths = re.findall(r"<path\b[^/]*/>", src_text)
print(f"Source has {len(paths)} paths; keeping paths 1-4, dropping path 0 (mouth frame).")

bug_paths = paths[1:5]
bboxes = [path_bbox(p) for p in bug_paths if path_bbox(p)]
x0 = min(b[0] for b in bboxes)
y0 = min(b[1] for b in bboxes)
x1 = max(b[2] for b in bboxes)
y1 = max(b[3] for b in bboxes)

PAD = 40
vb_x = x0 - PAD
vb_y = y0 - PAD
vb_w = (x1 - x0) + 2 * PAD
vb_h = (y1 - y0) + 2 * PAD

print(f"Bug bbox: ({x0:.0f},{y0:.0f}) .. ({x1:.0f},{y1:.0f})")
print(f"viewBox:  {vb_x:.0f} {vb_y:.0f} {vb_w:.0f} {vb_h:.0f}")

body = "\n  ".join(bug_paths)
OUT.write_text(
    f'<?xml version="1.0" encoding="UTF-8"?>\n'
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_x:.0f} {vb_y:.0f} {vb_w:.0f} {vb_h:.0f}" '
    f'width="{vb_w:.0f}" height="{vb_h:.0f}">\n'
    f' <g id="bug">\n  {body}\n </g>\n'
    f"</svg>\n"
)
print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
