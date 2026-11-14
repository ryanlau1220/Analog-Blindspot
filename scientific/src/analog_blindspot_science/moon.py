"""Moon gate: confirm the Marius Hills Pit lies in valid MARIUSPIT01 pixels and
is resolved as a depression in the DTM itself."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.windows import transform as window_transform

from .lunar import label_lonlat_to_pixel, lonlat_to_xy, parse_pds3_label, to_lon180
from .rasterinfo import valid_mask
from .terrain import annulus_offsets, disk_offsets

__all__ = [
    "conf_class",
    "confidence_summary",
    "invalid_component",
    "locate_pit",
    "pit_analysis",
    "read_roi",
    "roi_confidence",
    "to_valid",
]

# README confidence table.
CONF_CLASSES = {
    0: "nodata",
    1: "shadowed",
    2: "saturated",
    3: "suspicious",
    4: "interpolated",
    15: "manually_edited",
}


def conf_class(v: int) -> str:
    if 10 <= v <= 14:
        return "correlated"
    return CONF_CLASSES.get(int(v), f"undocumented_{int(v)}")


def locate_pit(dtm_path: Path, label_path: Path, lat: float, lon_east: float) -> dict:
    lbl = parse_pds3_label(label_path)
    with rasterio.open(dtm_path) as ds:
        x, y = lonlat_to_xy(ds.crs, lat, lon_east)
        col_f, row_f = ~ds.transform @ (x, y)
        inside_raster = 0 <= row_f < ds.height and 0 <= col_f < ds.width
    lrow, lcol = label_lonlat_to_pixel(lbl, lat, lon_east)
    return {
        "lat": lat,
        "lon_east_0_360": lon_east,
        "lon_east_pm180": to_lon180(lon_east),
        "map_x_m": x,
        "map_y_m": y,
        "row_f": row_f,
        "col_f": col_f,
        "row": int(np.floor(row_f)),
        "col": int(np.floor(col_f)),
        "label_row_f": lrow,
        "label_col_f": lcol,
        "pyproj_vs_label_px": float(np.hypot(row_f - lrow, col_f - lcol)),
        "inside_raster_extent": bool(inside_raster),
        "inside_label_latlon_extent": bool(
            lbl.min_lat <= lat <= lbl.max_lat and lbl.west_lon <= lon_east <= lbl.east_lon
        ),
    }


def read_roi(path: Path, row: int, col: int, size: int) -> tuple[np.ndarray, Window, object, float | None, object]:
    half = size // 2
    win = Window(col - half, row - half, size, size)
    with rasterio.open(path) as ds:
        if win.col_off < 0 or win.row_off < 0 or win.col_off + size > ds.width or win.row_off + size > ds.height:
            raise ValueError(f"ROI window {win} exceeds raster {ds.width}x{ds.height}")
        arr = ds.read(1, window=win)
        return arr, win, window_transform(win, ds.transform), ds.nodata, ds.profile


def invalid_component(valid: np.ndarray, seed_rc: tuple[float, float], max_seed_dist_px: float) -> np.ndarray:
    """4-connected nodata region nearest to ``seed_rc`` (empty mask if none nearby)."""
    inv = ~valid
    if not inv.any():
        return np.zeros_like(valid)
    ys, xs = np.nonzero(inv)
    d = np.hypot(ys + 0.5 - seed_rc[0], xs + 0.5 - seed_rc[1])
    k = int(np.argmin(d))
    if d[k] > max_seed_dist_px:
        return np.zeros_like(valid)
    comp = np.zeros_like(valid)
    stack = [(int(ys[k]), int(xs[k]))]
    h, w = valid.shape
    while stack:
        r, c = stack.pop()
        if comp[r, c] or not inv[r, c]:
            continue
        comp[r, c] = True
        for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
            if 0 <= rr < h and 0 <= cc < w and inv[rr, cc] and not comp[rr, cc]:
                stack.append((rr, cc))
    return comp


def pit_analysis(
    z: np.ndarray,
    valid: np.ndarray,
    center_rc: tuple[float, float],
    cell: float,
    search_radius_m: float,
    rim_inner_m: float,
    rim_outer_m: float,
) -> dict:
    """Measure what the DTM actually records at the pit.

    Reports (a) the nodata gap at the pit, if any, and (b) the deepest *valid*
    elevation inside the search radius relative to the rim annulus median. When
    the pit interior is nodata, (b) is only a lower bound on pit depth and the
    floor is reported as unmeasured. Nothing is interpolated.
    """
    cr, cc = center_rc
    r0, c0 = int(np.floor(cr)), int(np.floor(cc))
    dy, dx = disk_offsets(search_radius_m / cell)
    ry, rx = annulus_offsets(rim_inner_m / cell, rim_outer_m / cell)
    inner_v = valid[r0 + dy, c0 + dx]
    rim_v = valid[r0 + ry, c0 + rx]
    inner = z[r0 + dy, c0 + dx]
    rim = z[r0 + ry, c0 + rx]
    if not rim_v.any() or not inner_v.any():
        raise ValueError("no valid DTM pixels around the pit")

    gap = invalid_component(valid, center_rc, max_seed_dist_px=search_radius_m / cell)
    gap_info: dict = {"present": bool(gap.any())}
    if gap.any():
        gy, gx = np.nonzero(gap)
        n = int(gap.sum())
        gap_info.update(
            {
                "pixel_count": n,
                "area_m2": n * cell * cell,
                "equivalent_diameter_m": float(2 * np.sqrt(n * cell * cell / np.pi)),
                "extent_ns_m": float((gy.max() - gy.min() + 1) * cell),
                "extent_ew_m": float((gx.max() - gx.min() + 1) * cell),
                "centroid_offset_from_atlas_m": float(np.hypot(gy.mean() + 0.5 - cr, gx.mean() + 0.5 - cc) * cell),
                "contains_atlas_point": bool(gap[r0, c0]),
                "touches_roi_edge": bool(
                    gy.min() == 0 or gx.min() == 0 or gy.max() == gap.shape[0] - 1 or gx.max() == gap.shape[1] - 1
                ),
            }
        )

    k = int(np.argmin(np.where(inner_v, inner, np.inf)))
    low_r, low_c = r0 + dy[k], c0 + dx[k]
    rim_med = float(np.median(rim[rim_v]))
    return {
        "search_valid_fraction": float(inner_v.mean()),
        "rim_valid_fraction": float(rim_v.mean()),
        "nodata_gap": gap_info,
        "pit_floor_measured": not gap_info["present"],
        "lowest_valid_elev_m": float(inner[k]),
        "lowest_valid_row": int(low_r),
        "lowest_valid_col": int(low_c),
        "lowest_valid_offset_from_atlas_m": float(np.hypot(low_r + 0.5 - cr, low_c + 0.5 - cc) * cell),
        "rim_median_elev_m": rim_med,
        "rim_p90_elev_m": float(np.percentile(rim[rim_v], 90)),
        "measured_depression_m": rim_med - float(inner[k]),
        "measured_depression_is_lower_bound": bool(gap_info["present"]),
    }


def confidence_summary(conf: np.ndarray, center_rc: tuple[float, float], radius_px: float) -> dict:
    r0, c0 = int(np.floor(center_rc[0])), int(np.floor(center_rc[1]))
    dy, dx = disk_offsets(radius_px)
    vals = conf[r0 + dy, c0 + dx]
    counts: dict[str, int] = {}
    for v in vals:
        counts[conf_class(v)] = counts.get(conf_class(v), 0) + 1
    n = len(vals)
    return {"pixels": n, "class_fractions": {k: round(c / n, 4) for k, c in sorted(counts.items())}}


def roi_confidence(conf: np.ndarray) -> dict:
    vals, counts = np.unique(conf, return_counts=True)
    agg: dict[str, int] = {}
    for v, c in zip(vals, counts, strict=True):
        agg[conf_class(v)] = agg.get(conf_class(v), 0) + int(c)
    n = conf.size
    return {k: round(c / n, 4) for k, c in sorted(agg.items())}


def to_valid(z: np.ndarray, nodata: float | None) -> np.ndarray:
    return valid_mask(z, nodata)
