"""
Vectorize the GPT-generated black-and-white travisEATSbugs logos
(icon-only + lockup) with vtracer.

Run with:
    .venv/bin/python scripts/vtrace-gpt-logos.py

Output: brand/concepts/vtracer-gpt/<source>-<variant>.svg
"""

import sys
from pathlib import Path

import vtracer

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
OUT = BRAND / "concepts" / "vtracer-gpt"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = [
    BRAND / "travisEATSbugs-icon-gpt-2026-05-14.png",
    BRAND / "travisEATSbugs-lockup-gpt-2026-05-14.png",
]

# Black-and-white source: binary mode is the natural choice. Spline gives
# smooth curves; polygon gives sharper edges. Try both at moderate filter
# settings to compare.
VARIANTS = [
    {
        "name": "binary-spline",
        "kwargs": {
            "colormode": "binary",
            "mode": "spline",
            "hierarchical": "stacked",
            "filter_speckle": 4,
            "corner_threshold": 60,
        },
    },
    {
        "name": "binary-polygon",
        "kwargs": {
            "colormode": "binary",
            "mode": "polygon",
            "hierarchical": "stacked",
            "filter_speckle": 4,
        },
    },
    {
        "name": "binary-spline-tight",
        "kwargs": {
            "colormode": "binary",
            "mode": "spline",
            "hierarchical": "stacked",
            "filter_speckle": 2,
            "corner_threshold": 70,
            "length_threshold": 3.0,
            "splice_threshold": 30,
            "path_precision": 3,
        },
    },
]


def main() -> None:
    for src in SOURCES:
        if not src.exists():
            print(f"missing: {src.name}", file=sys.stderr)
            continue
        stem = src.stem.replace("travisEATSbugs-", "").replace("-2026-05-14", "")
        print(f"\n{src.name} ({src.stat().st_size // 1024} KB)")
        for v in VARIANTS:
            out = OUT / f"{stem}--{v['name']}.svg"
            print(f"  {v['name']}...", end=" ", flush=True)
            try:
                vtracer.convert_image_to_svg_py(str(src), str(out), **v["kwargs"])
                print(f"ok ({out.stat().st_size // 1024} KB)")
            except Exception as e:
                print(f"failed: {e}")
    print(f"\nDone. Files in {OUT}")


if __name__ == "__main__":
    main()
