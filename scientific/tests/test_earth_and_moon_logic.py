import numpy as np
import pytest
from affine import Affine

from analog_blindspot_science.earth import coarsen_levels, local_relief, snapped_roi
from analog_blindspot_science.moon import invalid_component, pit_analysis


def test_snapped_roi_is_on_grid_and_contains_center():
    roi = snapped_roi(-121.5145, 41.7060, 1800, 60)
    assert roi.size_m == 1800
    for v in (roi.left, roi.bottom, roi.right, roi.top):
        assert v % 60 == 0
    with pytest.raises(ValueError):
        snapped_roi(-121.5, 41.7, 1810, 60)


def test_coarsen_levels_share_extent_and_reject_non_integer_factors():
    z = np.zeros((120, 120), np.float32)
    v = np.ones_like(z, bool)
    levels = coarsen_levels(z, v, 0.5, [2.0, 4.0, 10.0, 30.0, 60.0], 0.5)
    for res, (zl, _) in levels.items():
        assert zl.shape[0] * res == pytest.approx(60.0)
    with pytest.raises(ValueError):
        coarsen_levels(z, v, 0.5, [0.75], 0.5)


def test_local_relief_measures_and_refuses_single_cell():
    z = np.zeros((40, 40), np.float32)
    z[20, 20] = -5.0
    v = np.ones_like(z, bool)
    tr = Affine(1.0, 0, 0, 0, -1.0, 40)
    r = local_relief(z, v, tr, 20.5, 19.5, 3.0)
    assert r["relief_m"] == pytest.approx(5.0)
    coarse = local_relief(z, v, Affine(60.0, 0, 0, 0, -60.0, 2400), 30, 2370, 30.0)
    assert coarse["relief_m"] is None and "not_measurable" in coarse


def _bowl(nodata_core: bool):
    yy, xx = np.mgrid[0:101, 0:101]
    d = np.hypot(yy - 50, xx - 50) * 4.0  # metres from centre on a 4 m grid
    z = np.where(d < 46, -15.0 * (1 - d / 46), 0.0).astype(np.float32)
    valid = np.ones_like(z, bool)
    if nodata_core:
        valid[d < 25] = False
    return z, valid


def test_pit_analysis_full_floor_is_measured():
    z, v = _bowl(False)
    pa = pit_analysis(z, v, (50.5, 50.5), 4.0, 60, 55, 90)
    assert pa["pit_floor_measured"] and not pa["measured_depression_is_lower_bound"]
    assert pa["measured_depression_m"] == pytest.approx(15.0, abs=0.5)


def test_pit_analysis_nodata_core_is_lower_bound_not_filled():
    z, v = _bowl(True)
    pa = pit_analysis(z, v, (50.5, 50.5), 4.0, 60, 55, 90)
    assert not pa["pit_floor_measured"] and pa["measured_depression_is_lower_bound"]
    assert pa["nodata_gap"]["contains_atlas_point"]
    assert pa["measured_depression_m"] < 15.0 * (1 - 24 / 46) + 0.5  # only the valid wall is used


def test_invalid_component_ignores_distant_gaps():
    v = np.ones((50, 50), bool)
    v[0:3, 0:3] = False
    assert not invalid_component(v, (40, 40), 5).any()
    assert invalid_component(v, (2, 2), 5).sum() == 9
