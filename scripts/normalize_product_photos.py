#!/usr/bin/env python3
"""Normalise product photos to the Technofluid display standard.

Run this on every new/updated product photo before committing it — it is what
keeps pack sizes readable at a glance across cards, series galleries and
industry thumbnails.

THE STANDARD
------------
* Canvas        1600 x 1200 (4:3) — the aspect the cards and gallery render in.
* Baseline      every product's bottom sits at 92% of frame height, so items
                placed side by side look like they stand on one shelf.
* Background    pure white (backgrounds are flood-filled from the border).
* Size ladder   product height as a fraction of frame height, by pack:

                  500 ml            0.50
                  1 L               0.58
                  2.5 L             0.60
                  3 L / 3.5 L       0.62
                  5 L               0.65
                  5 kg grease pail  0.60   (squat pack, height/width < 1.05)
                  18/20 kg pail     0.84   (tall pack)
                  drums / tins      0.88

                Grease is classified by measured pack proportions, not by
                filename: the squat 5 kg pail and the tall 18/20 kg bucket are
                different products and must not render at the same size.

* Tilt          grey jerry cans (2.5/3/3.5/5 L) are rotated 2 deg clockwise,
                matching the client-approved cutting-oil can. The rotation is
                applied to a measured target, not blindly, so re-running the
                script never compounds the tilt.

Sizes were set with the client (Aug 2026); change TARGETS/TILT_DEG here rather
than editing individual photos, then re-run over the whole library so
everything stays on one ladder.

Usage:
    python3 scripts/normalize_product_photos.py [path ...]

With no arguments it processes every photo under
frontend/public/product-photos. Requires: pillow, numpy, scipy.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent / "frontend/public/product-photos"

CANVAS_W, CANVAS_H = 1600, 1200
BASELINE = round(0.92 * CANVAS_H)
JERRY_CAN = re.compile(r"(-2-5-l|-3-l|-3-5-l|-5-l)\.jpg$")
SQUAT_MAX_RATIO = 1.05  # grease: height/width below this is the 5 kg pail

# A jerry can straight off the shoot measures ~-1.17 deg on this metric; the
# client-approved 2 deg clockwise tilt puts it at ~-3.2. We rotate towards that
# figure, so an already-tilted photo is left alone instead of tilted twice.
TARGET_CAN_LEAN = -3.2
LEAN_TOLERANCE = 0.2

TARGETS: list[tuple[str, float]] = [
    (r"500-?ml", 0.50),
    (r"(-1-l\b|-1-l\.|bottle)", 0.58),
    (r"-2-5-l", 0.60),
    (r"(-3-l|-3-5-l)", 0.62),
    (r"-5-l", 0.65),
    (r"(pail|bucket|18-l)", 0.84),
    (r"(barrel|tin)", 0.88),
]
GREASE_SQUAT, GREASE_TALL, FALLBACK = 0.60, 0.84, 0.84


def whiten(img: Image.Image) -> Image.Image:
    """Flood the border-connected light background to pure white, feathered."""
    a = np.asarray(img).astype(np.int16)
    mn, mx = a.min(axis=2), a.max(axis=2)
    candidate = (mn >= 185) & ((mx - mn) <= 42)
    border = np.zeros_like(candidate)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    bg = ndimage.binary_propagation(candidate & border, mask=candidate)
    soft = ndimage.gaussian_filter(bg.astype(np.float32), 1.2)[..., None]
    blended = a.astype(np.float32) * (1 - soft) + 255.0 * soft
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))


def can_lean(img: Image.Image) -> float:
    """Mean angle of the can's left/right silhouette edges, in degrees."""
    mask = np.asarray(img).min(axis=2) < 235
    rows = np.where(mask.any(axis=1))[0]
    top, height = rows[0], rows[-1] - rows[0]
    angles = []
    for side in ("left", "right"):
        ys, xs = [], []
        for y in range(int(top + 0.60 * height), int(top + 0.88 * height)):
            idx = np.where(mask[y])[0]
            if len(idx) == 0:
                continue
            ys.append(y)
            xs.append(idx[0] if side == "left" else idx[-1])
        if len(ys) < 5:
            return TARGET_CAN_LEAN  # unmeasurable: leave the photo as-is
        angles.append(np.degrees(np.arctan(np.polyfit(ys, xs, 1)[0])))
    return float(np.mean(angles))


def bbox(img: Image.Image) -> tuple[int, int, int, int]:
    mask = np.asarray(img).min(axis=2) < 240
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    return cols[0], rows[0], cols[-1] + 1, rows[-1] + 1


def target_height(path: Path, box: tuple[int, int, int, int]) -> float:
    if "grease" in str(path).lower():
        x0, y0, x1, y1 = box
        ratio = (y1 - y0) / (x1 - x0)
        return GREASE_SQUAT if ratio < SQUAT_MAX_RATIO else GREASE_TALL
    for pattern, value in TARGETS:
        if re.search(pattern, path.name):
            return value
    return FALLBACK


def normalize(path: Path) -> str:
    img = Image.open(path).convert("RGB")
    tilted = False
    if JERRY_CAN.search(path.name):
        delta = TARGET_CAN_LEAN - can_lean(img)
        if abs(delta) > LEAN_TOLERANCE:
            img = whiten(
                img.rotate(delta, resample=Image.BICUBIC, expand=True,
                           fillcolor=(255, 255, 255))
            )
            tilted = True

    box = bbox(img)
    fraction = target_height(path, box)
    x0, y0, x1, y1 = box
    crop = img.crop((max(x0 - 2, 0), max(y0 - 2, 0),
                     min(x1 + 2, img.width), min(y1 + 2, img.height)))

    height = round(fraction * CANVAS_H)
    width = round(crop.width * height / crop.height)
    if width > CANVAS_W - 100:  # very wide products: fit by width instead
        width = CANVAS_W - 100
        height = round(crop.height * width / crop.width)

    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), (255, 255, 255))
    canvas.paste(crop.resize((width, height), Image.LANCZOS),
                 ((CANVAS_W - width) // 2, BASELINE - height))
    canvas.save(path, quality=92)
    return f"{path.name}: height {fraction:.2f}{' + tilt' if tilted else ''}"


def main() -> None:
    args = [Path(a) for a in sys.argv[1:]]
    files = args or sorted(ROOT.rglob("*.jpg"))
    for path in files:
        print(" ", normalize(path))
    print(f"{len(files)} photo(s) normalised to the display standard")


if __name__ == "__main__":
    main()
