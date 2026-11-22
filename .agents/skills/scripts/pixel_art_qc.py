#!/usr/bin/env python3
"""Pixel-art PNG diagnostics. Requires Pillow: python -m pip install Pillow

Usage:
  python pixel_art_qc.py path/to/assets --colors 16
  python pixel_art_qc.py sprite.png --colors 12 --json
"""
from PIL import Image
from pathlib import Path
import argparse, json, sys

def inspect(path, color_limit, alpha_threshold):
    im = Image.open(path).convert("RGBA")
    pixels = list(im.getdata())
    visible = [p for p in pixels if p[3] >= alpha_threshold]
    colors = set(visible)
    partial = sum(0 < p[3] < 255 for p in pixels)
    return {
        "file": str(path), "size": list(im.size),
        "visible_bbox": list(im.getbbox()) if im.getbbox() else None,
        "visible_pixels": len(visible),
        "transparent_pixels": sum(p[3] == 0 for p in pixels),
        "partial_alpha_pixels": partial,
        "visible_color_count": len(colors),
        "checks": {
            "palette_limit": len(colors) <= color_limit,
            "has_visible_pixels": bool(visible),
            "no_partial_alpha": partial == 0
        }
    }

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("path", type=Path)
    p.add_argument("--colors", type=int, default=16)
    p.add_argument("--alpha-threshold", type=int, default=1)
    p.add_argument("--json", action="store_true")
    a = p.parse_args()
    files = [a.path] if a.path.is_file() else sorted(a.path.rglob("*.png"))
    if not files:
        print("No PNG files found.", file=sys.stderr); return 2
    reports = []
    for f in files:
        try: reports.append(inspect(f, a.colors, a.alpha_threshold))
        except Exception as e: reports.append({"file": str(f), "error": str(e)})
    if a.json:
        print(json.dumps(reports, indent=2))
    else:
        for r in reports:
            print(f"\n{r['file']}")
            if "error" in r: print("  ERROR:", r["error"]); continue
            print(f"  size={r['size']} bbox={r['visible_bbox']} colors={r['visible_color_count']}")
            print(f"  transparent={r['transparent_pixels']} partial-alpha={r['partial_alpha_pixels']}")
            for k,v in r["checks"].items(): print(f"  {'PASS' if v else 'CHECK'} {k}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
