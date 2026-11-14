"""Small reference PNGs for visual review. They are previews, not analysis inputs."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def gray_png(
    arr01: np.ndarray,
    path: Path,
    *,
    nodata_rgb=(200, 30, 160),
    display_px: int | None = 900,
    markers: list[tuple[float, float, str]] | None = None,
    scale_bar: tuple[float, float] | None = None,
    title: str | None = None,
) -> dict:
    """Write a grayscale preview. NaN pixels are painted ``nodata_rgb`` (magenta)
    so missing data is visible rather than blended in.

    ``markers`` are (row_f, col_f, label) in array coordinates; ``scale_bar`` is
    (cell_size_m, bar_length_m).
    """
    a = np.asarray(arr01, dtype=np.float32)
    nan = ~np.isfinite(a)
    g = (np.clip(np.nan_to_num(a, nan=0.0), 0, 1) * 255).astype(np.uint8)
    rgb = np.stack([g, g, g], axis=-1)
    rgb[nan] = nodata_rgb
    img = Image.fromarray(rgb, "RGB")
    sx = sy = 1.0
    if display_px and max(img.size) != display_px:
        f = display_px / max(img.size)
        new = (max(1, round(img.width * f)), max(1, round(img.height * f)))
        sx, sy = new[0] / img.width, new[1] / img.height
        # Upsampling uses nearest neighbour so coarse cells stay visibly blocky
        # (no invented smooth detail); downsampling uses Lanczos for legibility.
        method = Image.Resampling.NEAREST if f > 1 else Image.Resampling.LANCZOS
        img = img.resize(new, method)
    d = ImageDraw.Draw(img)
    for row_f, col_f, label in markers or []:
        x, y = col_f * sx, row_f * sy
        d.ellipse([x - 6, y - 6, x + 6, y + 6], outline=(255, 200, 0), width=2)
        if label:
            d.text((x + 8, y - 6), label, fill=(255, 220, 0))
    if scale_bar:
        cell, length = scale_bar
        px = length / cell * sx
        y0 = img.height - 14
        d.rectangle([10, y0, 10 + px, y0 + 5], fill=(255, 255, 255), outline=(0, 0, 0))
        d.text((10, y0 - 12), f"{length:g} m", fill=(255, 255, 255))
    if title:
        d.rectangle([0, 0, img.width, 14], fill=(0, 0, 0))
        d.text((4, 1), title, fill=(255, 255, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    return {"file": path.name, "width": img.width, "height": img.height}


def stretch(a: np.ndarray, lo_pct: float = 1, hi_pct: float = 99) -> np.ndarray:
    v = a[np.isfinite(a)]
    if v.size == 0:
        return a
    lo, hi = np.percentile(v, [lo_pct, hi_pct])
    return (a - lo) / max(hi - lo, 1e-9)
