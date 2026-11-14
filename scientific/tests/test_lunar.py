import math
from pathlib import Path

import pytest
from affine import Affine
from pyproj import CRS

from analog_blindspot_science.lunar import (
    assert_lunar_crs,
    label_lonlat_to_pixel,
    lonlat_to_xy,
    parse_pds3_label,
    to_lon180,
    to_lon360,
)
from analog_blindspot_science.moon import conf_class

FIX = Path(__file__).parent / "fixtures"
LBL = parse_pds3_label(FIX / "NAC_DTM_MARIUSPIT01.LBL")
CRS_WKT = (FIX / "mariuspit01_crs.wkt").read_text().strip()
# GeoTIFF transform of NAC_DTM_MARIUSPIT01.TIF as read by rasterio.
TIF_TRANSFORM = Affine(3.9999999999986, 0, 3619147.9999987, 0, -3.9999999999986, 456355.99999984)


def test_longitude_conventions():
    assert to_lon180(303.2299) == pytest.approx(-56.7701)
    assert to_lon360(-56.7701) == pytest.approx(303.2299)


def test_label_fields():
    assert LBL.product_id == "NAC_DTM_MARIUSPIT01"
    assert LBL.radius_m == 1_737_400
    assert LBL.map_scale_m == pytest.approx(4.0)
    assert (LBL.samples, LBL.lines) == (3331, 12529)
    assert LBL.nodata == pytest.approx(-3.40282266e38, rel=1e-6)


def test_crs_is_lunar_and_earth_crs_is_rejected():
    assert_lunar_crs(CRS.from_wkt(CRS_WKT))
    with pytest.raises(ValueError):
        assert_lunar_crs(CRS.from_epsg(4326))


def test_label_max_latitude_maps_to_top_edge():
    row, _ = label_lonlat_to_pixel(LBL, LBL.max_lat, 303.2)
    assert row == pytest.approx(0.0, abs=0.05)
    row, _ = label_lonlat_to_pixel(LBL, LBL.min_lat, 303.2)
    assert row == pytest.approx(LBL.lines, abs=0.05)


def test_label_lon_extent_maps_to_side_edges_at_center_lat():
    # Equirectangular x depends only on longitude.
    _, col_w = label_lonlat_to_pixel(LBL, 14.0, LBL.west_lon)
    _, col_e = label_lonlat_to_pixel(LBL, 14.0, LBL.east_lon)
    assert col_w == pytest.approx(0.0, abs=0.05)
    assert col_e == pytest.approx(LBL.samples, abs=0.05)


@pytest.mark.parametrize("lon", [303.2299, -56.7701])
def test_pit_pixel_agrees_between_pyproj_and_label(lon):
    x, y = lonlat_to_xy(CRS_WKT, 14.0917, lon)
    col, row = ~TIF_TRANSFORM @ (x, y)
    lrow, lcol = label_lonlat_to_pixel(LBL, 14.0917, lon % 360)
    assert math.hypot(row - lrow, col - lcol) < 0.01
    assert 0 <= row < LBL.lines and 0 <= col < LBL.samples


def test_confidence_classes_follow_readme():
    assert conf_class(0) == "nodata"
    assert conf_class(3) == "suspicious"
    assert conf_class(12) == "correlated"
    assert conf_class(15) == "manually_edited"
    assert conf_class(7).startswith("undocumented")
