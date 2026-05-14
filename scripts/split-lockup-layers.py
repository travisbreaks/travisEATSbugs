"""
Split the vtraced lockup SVG into icon-layer and wordmark-layer groups
so the wordmark can be swapped later without touching the icon.

Strategy:
1. Parse all <path> elements from the lockup SVG.
2. For each path, scan its d-string with a regex to find min/max Y coordinates
   (more robust than relying on svgelements' bbox parser for vtracer output).
3. Sort paths by min-y.
4. Find the largest gap between consecutive paths' max-y → next path's min-y.
   That gap is the icon-to-wordmark boundary.
5. Emit:
   - brand/logo-lockup.svg               : icon + wordmark grouped
   - brand/logo-wordmark-provisional.svg : wordmark group only, tightened viewBox
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
SRC = BRAND / "concepts" / "vtracer-gpt" / "lockup-gpt--binary-spline-tight.svg"

OUT_LOCKUP = BRAND / "logo-lockup.svg"
OUT_WORDMARK = BRAND / "logo-wordmark-provisional.svg"

# Match any number (int or float, signed) in a d-string.
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


TRANSLATE_RE = re.compile(r"translate\(\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*\)")


def path_translate(path_str: str) -> tuple[float, float]:
    """Return (tx, ty) from path's transform attribute, or (0, 0)."""
    t = re.search(r'\btransform="([^"]+)"', path_str)
    if not t:
        return 0.0, 0.0
    m = TRANSLATE_RE.search(t.group(1))
    if not m:
        return 0.0, 0.0
    return float(m.group(1)), float(m.group(2))


def path_y_range(path_str: str) -> tuple[float, float] | None:
    """Scan the d-string + transform and return (min_y, max_y) in canvas space."""
    d_match = re.search(r'\bd="([^"]+)"', path_str)
    if not d_match:
        return None
    nums = [float(n) for n in NUM_RE.findall(d_match.group(1))]
    if len(nums) < 2:
        return None
    ys = nums[1::2]
    if not ys:
        return None
    _, ty = path_translate(path_str)
    return min(ys) + ty, max(ys) + ty


def main() -> None:
    svg_text = SRC.read_text()
    m = re.search(r"<svg[^>]*>", svg_text)
    if not m:
        raise SystemExit("no <svg> tag found")
    header = svg_text[: m.end()]
    paths = re.findall(r"<path\b[^/]*/>", svg_text)
    print(f"Found {len(paths)} paths in {SRC.name}")

    # Parse width / height from header
    w_match = re.search(r'\bwidth="(\d+)"', header)
    h_match = re.search(r'\bheight="(\d+)"', header)
    if not w_match or not h_match:
        raise SystemExit("could not parse width/height from header")
    width = int(w_match.group(1))
    height = int(h_match.group(1))

    # Compute y-range for each path
    info = []
    for idx, p in enumerate(paths):
        rng = path_y_range(p)
        if rng is None:
            continue
        info.append((idx, rng[0], rng[1]))

    if not info:
        raise SystemExit("no parseable path coordinates")

    # Sort by min-y
    info.sort(key=lambda r: r[1])

    print("\nPath y-ranges (sorted by min-y):")
    for idx, ymin, ymax in info:
        print(f"  path {idx:>2}  y={ymin:>7.1f} .. {ymax:>7.1f}")

    # Find the largest gap between (max-y of one path) and (min-y of the next)
    # where we treat the "frontier" as the running max-y over all paths seen so far
    running_max = info[0][2]
    biggest_gap = 0.0
    split_at = 1
    for i in range(1, len(info)):
        gap = info[i][1] - running_max
        if gap > biggest_gap:
            biggest_gap = gap
            split_at = i
        running_max = max(running_max, info[i][2])

    print(f"\nLargest gap: {biggest_gap:.1f} px at sorted position {split_at}")

    if biggest_gap < 20.0:
        raise SystemExit(f"gap too small ({biggest_gap:.1f}px); manual inspection needed")

    icon_indices = {info[i][0] for i in range(split_at)}
    wordmark_indices = {info[i][0] for i in range(split_at, len(info))}
    print(f"  icon group:     {len(icon_indices)} paths")
    print(f"  wordmark group: {len(wordmark_indices)} paths")

    # Wordmark tightened bbox (for the wordmark-only SVG)
    wm_y_ranges = [(path_y_range(paths[i]) or (0, 0)) for i in wordmark_indices]
    wm_min_y = min(r[0] for r in wm_y_ranges)
    wm_max_y = max(r[1] for r in wm_y_ranges)
    # For x-range, scan x-coords (even-indexed numbers) and apply transform tx
    wm_min_x = float("inf")
    wm_max_x = float("-inf")
    for i in wordmark_indices:
        d_match = re.search(r'\bd="([^"]+)"', paths[i])
        if not d_match:
            continue
        nums = [float(n) for n in NUM_RE.findall(d_match.group(1))]
        xs = nums[0::2]
        if xs:
            tx, _ = path_translate(paths[i])
            wm_min_x = min(wm_min_x, min(xs) + tx)
            wm_max_x = max(wm_max_x, max(xs) + tx)
    pad = 8.0

    # Build lockup output with two groups
    icon_paths = "\n  ".join(paths[i] for i in sorted(icon_indices))
    wordmark_paths = "\n  ".join(paths[i] for i in sorted(wordmark_indices))
    lockup_svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
 <g id="icon">
  {icon_paths}
 </g>
 <g id="wordmark">
  {wordmark_paths}
 </g>
</svg>
"""
    OUT_LOCKUP.write_text(lockup_svg)
    print(f"\n  wrote {OUT_LOCKUP.relative_to(ROOT)} ({len(lockup_svg) // 1024} KB)")

    # Build wordmark-only output with tightened viewBox
    wm_w = wm_max_x - wm_min_x + 2 * pad
    wm_h = wm_max_y - wm_min_y + 2 * pad
    wm_translate = f"translate({pad - wm_min_x:.2f} {pad - wm_min_y:.2f})"
    wordmark_svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {wm_w:.1f} {wm_h:.1f}" width="{wm_w:.1f}" height="{wm_h:.1f}">
 <g id="wordmark" transform="{wm_translate}">
  {wordmark_paths}
 </g>
</svg>
"""
    OUT_WORDMARK.write_text(wordmark_svg)
    print(f"  wrote {OUT_WORDMARK.relative_to(ROOT)} ({len(wordmark_svg) // 1024} KB)")


if __name__ == "__main__":
    main()
