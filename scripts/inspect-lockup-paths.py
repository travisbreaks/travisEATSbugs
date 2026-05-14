"""Quick inspection: print each path's bbox so we can find the icon/wordmark split."""

import re
from pathlib import Path
from svgelements import Path as SvgPath

SRC = Path(__file__).resolve().parent.parent / "brand" / "concepts" / "vtracer-gpt" / "lockup-gpt--binary-spline-tight.svg"
txt = SRC.read_text()
paths = re.findall(r"<path\b[^/]*/>", txt)

rows = []
for i, p in enumerate(paths):
    d = re.search(r'\bd="([^"]+)"', p)
    if not d:
        continue
    try:
        bbox = SvgPath(d.group(1)).bbox()
    except Exception as e:
        rows.append((i, None, None, None, None, len(p), str(e)[:40]))
        continue
    if bbox is None:
        rows.append((i, None, None, None, None, len(p), "no bbox"))
        continue
    x0, y0, x1, y1 = bbox
    rows.append((i, x0, y0, x1, y1, len(p), ""))

print(f"{'#':<3} {'top-y':>8} {'bot-y':>8} {'height':>8} {'len':>7}  note")
for r in rows:
    i, x0, y0, x1, y1, plen, note = r
    if y0 is None:
        print(f"{i:<3} {'?':>8} {'?':>8} {'?':>8} {plen:>7}  {note}")
    else:
        print(f"{i:<3} {y0:>8.1f} {y1:>8.1f} {(y1-y0):>8.1f} {plen:>7}  {note}")

# Sort by top-y to see clustering
print("\nSorted by top-y:")
sorted_rows = sorted([r for r in rows if r[2] is not None], key=lambda r: r[2])
prev_bot = None
for r in sorted_rows:
    i, x0, y0, x1, y1, plen, _ = r
    gap = "" if prev_bot is None else f"gap-from-prev-bot={y0 - prev_bot:+.1f}"
    print(f"  path {i:>2}  top={y0:>7.1f}  bot={y1:>7.1f}  {gap}")
    prev_bot = y1 if prev_bot is None else max(prev_bot, y1)
