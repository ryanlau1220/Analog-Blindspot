"""Lunar coordinate handling for LROC NAC DTM products.

Never route lunar coordinates through Earth CRSs (EPSG:4326 etc.). Pixel
locations are computed two independent ways and must agree:

1. pyproj, using the raster's own lunar CRS and its geodetic (sphere) CRS.
2. The PDS3 label equations from the LROC RDR SIS (Appendix, Equirectangular):
   Sample = x/Scale + S0 + 1, Line = L0 - y/Scale + 1 (see note below) with
   x = R*(lon - LonP)*cos(LatP), y = R*lat (1-based, pixel (1,1) upper-left corner).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

from pyproj import CRS, Transformer


def to_lon360(lon: float) -> float:
    return lon % 360.0


def to_lon180(lon: float) -> float:
    return ((lon + 180.0) % 360.0) - 180.0


@dataclass(frozen=True)
class Pds3EquirectLabel:
    radius_m: float
    center_lat: float
    center_lon: float
    line_offset: float
    sample_offset: float
    map_scale_m: float
    lines: int
    samples: int
    min_lat: float
    max_lat: float
    west_lon: float
    east_lon: float
    nodata: float | None
    product_id: str
    product_version: str
    start_time: str
    stop_time: str
    creation_time: str


def _kw(text: str, key: str) -> str:
    m = re.search(rf"^\s*{key}\s*=\s*(.+?)\s*$", text, re.MULTILINE)
    if not m:
        raise KeyError(key)
    return m.group(1).strip().strip('"')


def _num(text: str, key: str) -> float:
    return float(re.match(r"[-+0-9.eE]+", _kw(text, key)).group(0))


def parse_pds3_label(path: Path) -> Pds3EquirectLabel:
    t = path.read_text(errors="replace")
    if _kw(t, "MAP_PROJECTION_TYPE") != "EQUIRECTANGULAR":
        raise ValueError("only EQUIRECTANGULAR labels are supported")
    nod = re.search(r"NoDATA value is ([-+0-9.eE]+?)\.?\s", t)
    return Pds3EquirectLabel(
        radius_m=_num(t, "A_AXIS_RADIUS") * 1000.0,
        center_lat=_num(t, "CENTER_LATITUDE"),
        center_lon=_num(t, "CENTER_LONGITUDE"),
        line_offset=_num(t, "LINE_PROJECTION_OFFSET"),
        sample_offset=_num(t, "SAMPLE_PROJECTION_OFFSET"),
        map_scale_m=_num(t, "MAP_SCALE"),
        lines=int(_num(t, "LINES")),
        samples=int(_num(t, "LINE_SAMPLES")),
        min_lat=_num(t, "MINIMUM_LATITUDE"),
        max_lat=_num(t, "MAXIMUM_LATITUDE"),
        west_lon=_num(t, "WESTERNMOST_LONGITUDE"),
        east_lon=_num(t, "EASTERNMOST_LONGITUDE"),
        nodata=float(nod.group(1)) if nod else None,
        product_id=_kw(t, "PRODUCT_ID"),
        product_version=_kw(t, "PRODUCT_VERSION_ID"),
        start_time=_kw(t, "START_TIME"),
        stop_time=_kw(t, "STOP_TIME"),
        creation_time=_kw(t, "PRODUCT_CREATION_TIME"),
    )


def label_lonlat_to_pixel(lbl: Pds3EquirectLabel, lat: float, lon_east: float) -> tuple[float, float]:
    """Return 0-based (row, col) continuous pixel coordinates from PDS3 label equations."""
    dlon = to_lon180(lon_east - lbl.center_lon)
    x = lbl.radius_m * math.radians(dlon) * math.cos(math.radians(lbl.center_lat))
    y = lbl.radius_m * math.radians(lat)
    # 1-based coordinates in which pixel k's centre is at k. The SIS prints
    # "Line = -y/Scale - L0 + 1", but LROC NAC DTM labels store L0 as a positive
    # offset (here 114088.5), i.e. Line = L0 - y/Scale + 1. That form is the one
    # consistent with MAXIMUM_LATITUDE mapping onto the top image edge (tested).
    sample = x / lbl.map_scale_m + lbl.sample_offset + 1.0
    line = lbl.line_offset - y / lbl.map_scale_m + 1.0
    # Convert to 0-based edge coordinates (pixel k spans [k, k+1)), matching rasterio.
    return line - 0.5, sample - 0.5


def as_pyproj(crs) -> CRS:
    """Accept a pyproj CRS, a rasterio CRS, or WKT."""
    if isinstance(crs, CRS):
        return crs
    return CRS.from_wkt(crs.to_wkt() if hasattr(crs, "to_wkt") else str(crs))


def assert_lunar_crs(crs) -> None:
    """Refuse anything that is not a lunar body CRS."""
    crs = as_pyproj(crs)
    ell = crs.ellipsoid
    if ell is None or abs(ell.semi_major_metre - 1_737_400.0) > 1.0:
        raise ValueError(f"not a 1737.4 km lunar CRS: {crs.name}")
    if crs.to_epsg() is not None:
        raise ValueError(f"unexpected Earth EPSG code on lunar raster: EPSG:{crs.to_epsg()}")


def lunar_transformer(crs) -> Transformer:
    crs = as_pyproj(crs)
    assert_lunar_crs(crs)
    return Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)


def lonlat_to_xy(crs, lat: float, lon_east: float) -> tuple[float, float]:
    # Supply longitude in -180..180 so PROJ does not depend on its own wrapping.
    return lunar_transformer(crs).transform(to_lon180(lon_east), lat)
