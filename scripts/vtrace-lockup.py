"""
Vectorize the Gemini-generated TRAVIS EATS BUGS lockup with several
vtracer parameter sweeps so we can pick the cleanest output.

Run with:
    .venv/bin/python scripts/vtrace-lockup.py

Output: brand/concepts/vtracer/<variant>.svg
"""

import os
import sys
from pathlib import Path

import vtracer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "travisEATSbugs-lockup-gemini-2026-05-14.png"
OUT = ROOT / "brand" / "concepts" / "vtracer"
OUT.mkdir(parents=True, exist_ok=True)

if not SRC.exists():
    print(f"Source not found: {SRC}", file=sys.stderr)
    sys.exit(1)

# Variant sweeps. Each tunes a different lever to find the cleanest trace.
VARIANTS = [
    {
        "name": "01-default-color-spline",
        "kwargs": {
            "colormode": "color",
            "mode": "spline",
            "hierarchical": "stacked",
        },
    },
    {
        "name": "02-high-precision-clean",
        "kwargs": {
            "colormode": "color",
            "mode": "spline",
            "hierarchical": "stacked",
            "filter_speckle": 8,
            "color_precision": 7,
            "layer_difference": 12,
            "corner_threshold": 50,
        },
    },
    {
        "name": "03-polygon-sharp",
        "kwargs": {
            "colormode": "color",
            "mode": "polygon",
            "hierarchical": "stacked",
            "filter_speckle": 6,
            "color_precision": 6,
        },
    },
    {
        "name": "04-binary-bw-icon",
        "kwargs": {
            "colormode": "binary",
            "mode": "spline",
            "hierarchical": "stacked",
            "filter_speckle": 4,
        },
    },
    {
        "name": "05-fine-detail",
        "kwargs": {
            "colormode": "color",
            "mode": "spline",
            "hierarchical": "stacked",
            "filter_speckle": 2,
            "color_precision": 8,
            "layer_difference": 8,
            "corner_threshold": 60,
            "length_threshold": 3.0,
            "splice_threshold": 40,
            "path_precision": 3,
        },
    },
]


def main() -> None:
    print(f"Source: {SRC.name} ({SRC.stat().st_size // 1024} KB)")
    print(f"Output: {OUT}\n")
    for v in VARIANTS:
        out_path = OUT / f"{v['name']}.svg"
        print(f"  {v['name']}...", end=" ", flush=True)
        try:
            vtracer.convert_image_to_svg_py(
                str(SRC),
                str(out_path),
                **v["kwargs"],
            )
            size_kb = out_path.stat().st_size // 1024
            print(f"ok ({size_kb} KB)")
        except Exception as e:
            print(f"failed: {e}")
    print(f"\nDone. {len(VARIANTS)} variants in {OUT}")


if __name__ == "__main__":
    main()
