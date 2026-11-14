"""Earth gate: Lava Beds 0.5 m bare-earth DTM ROI, labelled landmarks, and
simulated coarsening on the native UTM 10N metric grid."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from pyproj import Transformer
from rasterio.windows import from_bounds
from shapely.geometry import Point, shape
from shapely.ops import transform as shp_transform

from .rasterinfo import valid_mask
from .terrain import block_mean, disk_offsets

UTM10N = "EPSG:32610"
WGS84 = "EPSG:4326"
MIN_RELIEF_CELLS = 9


@dataclass(frozen=True)
class Roi:
    left: float
    bottom: float
    right: float
    top: float

    @property
    def size_m(self) -> float:
        return self.right - self.left


def to_utm(lon: float, lat: float, crs: str = UTM10N, src_crs: str = WGS84) -> tuple[float, float]:
    return Transformer.from_crs(src_crs, crs, always_xy=True).transform(lon, lat)


def snapped_roi(
    center_lon: float, center_lat: float, size_m: float, snap_m: float, crs: str = UTM10N, src_crs: str = WGS84
) -> Roi:
    """Square ROI of ``size_m`` whose corners sit on a ``snap_m`` grid in the metric ``crs``."""
    if size_m % snap_m:
        raise ValueError("size_m must be a multiple of snap_m")
    x, y = to_utm(center_lon, center_lat, crs, src_crs)
    left = math.floor((x - size_m / 2) / snap_m + 0.5) * snap_m
    bottom = math.floor((y - size_m / 2) / snap_m + 0.5) * snap_m
    return Roi(left, bottom, left + size_m, bottom + size_m)


def read_roi(path: Path, roi: Roi, epsg: int = 32610) -> tuple[np.ndarray, np.ndarray, Affine, dict]:
    with rasterio.open(path) as ds:
        if ds.crs.to_epsg() != epsg:
            raise ValueError(f"expected EPSG:{epsg}, got {ds.crs}")
        b = ds.bounds
        if roi.left < b.left or roi.right > b.right or roi.bottom < b.bottom or roi.top > b.top:
            raise ValueError(f"ROI {roi} outside raster bounds {b}")
        win = from_bounds(roi.left, roi.bottom, roi.right, roi.top, ds.transform)
        if any(abs(v - round(v)) > 1e-6 for v in (win.col_off, win.row_off, win.width, win.height)):
            raise ValueError(f"ROI not aligned to the native pixel grid: {win}")
        win = win.round_offsets().round_lengths()
        z = ds.read(1, window=win)
        tr = ds.window_transform(win)
        prof = ds.profile
    return z, valid_mask(z, prof["nodata"]), tr, prof


def load_landmarks(path: Path, crs: str = UTM10N) -> list[dict]:
    """Landmark points projected to ``crs``; the file's ``source.crs`` (default WGS84) is honoured."""
    data = json.loads(path.read_text())
    src = data.get("source", {}).get("crs", WGS84)
    out = []
    for f in data["features"]:
        lon, lat = f["geometry"]["coordinates"]
        x, y = to_utm(lon, lat, crs, src)
        out.append({**f["properties"], "lon": lon, "lat": lat, "utm_x": x, "utm_y": y})
    return out


def boundary_utm(path: Path):
    data = json.loads(path.read_text())
    feat = data["features"][0] if data.get("type") == "FeatureCollection" else data
    geom = shape(feat["geometry"])
    t = Transformer.from_crs(WGS84, UTM10N, always_xy=True)
    return shp_transform(lambda x, y, z=None: t.transform(x, y), geom)


def coarsen_levels(
    z: np.ndarray, valid: np.ndarray, native_res: float, targets: list[float], min_valid_fraction: float
) -> dict[float, tuple[np.ndarray, np.ndarray]]:
    levels: dict[float, tuple[np.ndarray, np.ndarray]] = {
        native_res: (np.where(valid, z, np.nan).astype(np.float32), valid)
    }
    for t in targets:
        f = t / native_res
        if abs(f - round(f)) > 1e-9:
            raise ValueError(f"target {t} m is not an integer multiple of {native_res} m")
        levels[t] = block_mean(z, valid, int(round(f)), min_valid_fraction)
    return levels


def local_relief(z: np.ndarray, valid: np.ndarray, tr: Affine, x: float, y: float, radius_m: float) -> dict:
    """max-min of valid elevations within ``radius_m`` of (x, y) on this grid."""
    cell = tr.a
    col_f, row_f = ~tr @ (x, y)
    r0, c0 = int(np.floor(row_f)), int(np.floor(col_f))
    dy, dx = disk_offsets(max(radius_m / cell, 0.5))
    rr, cc = r0 + dy, c0 + dx
    inside = (rr >= 0) & (rr < z.shape[0]) & (cc >= 0) & (cc < z.shape[1])
    rr, cc = rr[inside], cc[inside]
    if len(rr) < MIN_RELIEF_CELLS:
        # A disk of 1-8 cells cannot express relief (at 60 m a 30 m radius is one cell).
        return {
            "cells": int(len(rr)),
            "valid_fraction": None,
            "relief_m": None,
            "not_measurable": f"radius {radius_m:g} m covers fewer than {MIN_RELIEF_CELLS} cells at {cell:g} m",
        }
    v = valid[rr, cc]
    if not v.any():
        return {"cells": int(inside.sum()), "valid_fraction": 0.0, "relief_m": None}
    vals = z[rr, cc][v]
    return {
        "cells": len(rr),
        "valid_fraction": float(v.mean()),
        "relief_m": float(vals.max() - vals.min()),
        "min_m": float(vals.min()),
        "max_m": float(vals.max()),
    }


def relief_baseline(
    z: np.ndarray, valid: np.ndarray, tr: Affine, radius_m: float, n: int, seed: int, min_valid: float = 0.0
) -> np.ndarray:
    """Relief at ``n`` reproducible random points in the ROI (margin = radius).

    Points whose disk is less than ``min_valid`` valid are skipped (e.g. at a coastline).
    """
    rng = np.random.default_rng(seed)
    h, w = z.shape
    cell = tr.a
    m = int(np.ceil(radius_m / cell))
    out = []
    for r, c in zip(rng.integers(m, h - m, n), rng.integers(m, w - m, n), strict=True):
        x, y = tr @ (c + 0.5, r + 0.5)
        lr = local_relief(z, valid, tr, x, y, radius_m)
        if lr["relief_m"] is not None and (lr["valid_fraction"] or 0.0) >= min_valid:
            out.append(lr["relief_m"])
    return np.array(out)


def point_in_valid(valid: np.ndarray, tr: Affine, x: float, y: float) -> bool:
    col_f, row_f = ~tr @ (x, y)
    r, c = int(np.floor(row_f)), int(np.floor(col_f))
    return 0 <= r < valid.shape[0] and 0 <= c < valid.shape[1] and bool(valid[r, c])


def footprint_contains(boundary, x: float, y: float) -> bool:
    return bool(boundary.contains(Point(x, y)))
