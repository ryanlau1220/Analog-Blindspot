"""Terrain derivatives and resolution degradation on metric grids."""

from __future__ import annotations

import numpy as np


def block_mean(
    arr: np.ndarray, valid: np.ndarray, factor: int, min_valid_fraction: float
) -> tuple[np.ndarray, np.ndarray]:
    """Aggregate ``factor x factor`` blocks to their mean over valid pixels.

    Block averaging is the area-weighted (box-filter) anti-aliasing for integer
    factors: each coarse cell is the mean elevation of exactly the fine pixels it
    covers, so no data from outside the cell leaks in and extents stay identical.
    Returns (coarse, coarse_valid).
    """
    if factor < 1:
        raise ValueError("factor must be >= 1")
    h, w = arr.shape
    if h % factor or w % factor:
        raise ValueError(f"shape {arr.shape} not divisible by factor {factor}")
    if factor == 1:
        return arr.astype(np.float32).copy(), valid.copy()
    a = np.where(valid, arr, 0.0).astype(np.float64)
    shp = (h // factor, factor, w // factor, factor)
    s = a.reshape(shp).sum(axis=(1, 3))
    n = valid.reshape(shp).sum(axis=(1, 3))
    ok = n >= min_valid_fraction * factor * factor
    out = np.full(s.shape, np.nan, dtype=np.float32)
    out[ok] = (s[ok] / n[ok]).astype(np.float32)
    return out, ok


def _gradients(z: np.ndarray, cell: float) -> tuple[np.ndarray, np.ndarray]:
    """Horn (1981) 3x3 gradients.

    Array borders are edge-replicated (one-sided estimate) so the ROI frame is
    not reported as missing; NaN (nodata) still propagates to its neighbours.
    """
    p = np.pad(z.astype(np.float64), 1, mode="edge")
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell)  # positive = downhill to north
    # Horn's kernel skips the centre cell, so mask nodata centres explicitly.
    centre_nan = ~np.isfinite(z)
    dzdx[centre_nan] = np.nan
    dzdy[centre_nan] = np.nan
    return dzdx, dzdy


def slope_deg(z: np.ndarray, cell: float) -> np.ndarray:
    dzdx, dzdy = _gradients(z, cell)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype(np.float32)


def hillshade(z: np.ndarray, cell: float, azimuth_deg: float = 315.0, altitude_deg: float = 45.0) -> np.ndarray:
    """Hillshade in 0..1 (NaN where undefined). Rows run north->south."""
    dzdx, dzdy = _gradients(z, cell)
    # Convert to east/north gradients: rows increase southward, so north gradient = -dz/drow.
    gx, gy = dzdx, -dzdy
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, -gy)  # direction of steepest descent, clockwise from north
    zen = np.radians(90.0 - altitude_deg)
    az = np.radians(azimuth_deg)
    hs = np.cos(zen) * np.cos(slope) + np.sin(zen) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(hs, 0.0, 1.0).astype(np.float32)


def disk_offsets(radius_px: float) -> tuple[np.ndarray, np.ndarray]:
    r = int(np.ceil(radius_px))
    yy, xx = np.mgrid[-r : r + 1, -r : r + 1]
    m = xx**2 + yy**2 <= radius_px**2
    return yy[m], xx[m]


def annulus_offsets(r_in_px: float, r_out_px: float) -> tuple[np.ndarray, np.ndarray]:
    r = int(np.ceil(r_out_px))
    yy, xx = np.mgrid[-r : r + 1, -r : r + 1]
    d2 = xx**2 + yy**2
    m = (d2 >= r_in_px**2) & (d2 <= r_out_px**2)
    return yy[m], xx[m]
