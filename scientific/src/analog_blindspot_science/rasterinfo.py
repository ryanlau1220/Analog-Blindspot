"""Pixel-level raster descriptions (not catalog metadata)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window


def valid_mask(arr: np.ndarray, nodata: float | None) -> np.ndarray:
    """Valid = finite and not equal (within float32 tolerance) to the nodata value."""
    m = np.isfinite(arr)
    if nodata is not None and np.isfinite(nodata):
        if abs(nodata) > 1e30:
            # LROC uses -3.40282266e+38; anything that large is a fill value.
            m &= np.abs(arr) < 1e30
        else:
            m &= arr != np.float32(nodata)
    return m


def describe(path: Path, *, band_stats: bool = True, block: int = 4096) -> dict:
    """Describe a raster from its actual pixels, streaming in blocks."""
    with rasterio.open(path) as ds:
        info = {
            "file": path.name,
            "driver": ds.driver,
            "width": ds.width,
            "height": ds.height,
            "band_count": ds.count,
            "dtype": ds.dtypes[0],
            "nodata": None if ds.nodata is None else float(ds.nodata),
            "crs_wkt": ds.crs.to_wkt() if ds.crs else None,
            "crs_name": ds.crs.to_dict().get("proj") if ds.crs else None,
            "epsg": ds.crs.to_epsg() if ds.crs else None,
            "pixel_size": [float(ds.res[0]), float(ds.res[1])],
            "bounds": dict(zip(("left", "bottom", "right", "top"), map(float, ds.bounds), strict=True)),
            "transform": list(ds.transform)[:6],
            "area_or_point": ds.tags().get("AREA_OR_POINT"),
            "scale": float(ds.scales[0]),
            "offset": float(ds.offsets[0]),
        }
        if not band_stats:
            return info
        n_valid = 0
        vmin, vmax, vsum = np.inf, -np.inf, 0.0
        rows_with_data = np.zeros(ds.height, dtype=bool)
        cols_with_data = np.zeros(ds.width, dtype=bool)
        for r0 in range(0, ds.height, block):
            for c0 in range(0, ds.width, block):
                w = Window(c0, r0, min(block, ds.width - c0), min(block, ds.height - r0))
                a = ds.read(1, window=w)
                m = valid_mask(a, ds.nodata)
                k = int(m.sum())
                if not k:
                    continue
                v = a[m].astype(np.float64)
                n_valid += k
                vmin, vmax, vsum = min(vmin, v.min()), max(vmax, v.max()), vsum + v.sum()
                rows_with_data[r0 : r0 + w.height] |= m.any(axis=1)
                cols_with_data[c0 : c0 + w.width] |= m.any(axis=0)
        total = ds.width * ds.height
        info["valid_pixel_count"] = n_valid
        info["valid_fraction"] = n_valid / total
        info["nodata_fraction"] = 1.0 - n_valid / total
        info["valid_area_km2"] = n_valid * abs(ds.res[0] * ds.res[1]) / 1e6
        if n_valid:
            info["value_min"] = float(vmin)
            info["value_max"] = float(vmax)
            info["value_mean"] = float(vsum / n_valid)
            rr, cc = np.flatnonzero(rows_with_data), np.flatnonzero(cols_with_data)
            t = ds.transform
            info["valid_data_bounds"] = {
                "left": float((t @ (cc[0], 0))[0]),
                "right": float((t @ (cc[-1] + 1, 0))[0]),
                "top": float((t @ (0, rr[0]))[1]),
                "bottom": float((t @ (0, rr[-1] + 1))[1]),
            }
        return info
