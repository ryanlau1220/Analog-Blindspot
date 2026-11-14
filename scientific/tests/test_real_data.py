"""Checks against the downloaded source rasters and generated manifest.

Skipped when ``datasets/raw`` has not been populated (run ``uv run fetch-sources``
and ``uv run phase-a`` first).
"""

import json

import numpy as np
import pytest
import rasterio

from analog_blindspot_science.paths import MANIFEST_PATH, RAW_DIR, REPO_ROOT

MOON_DTM = RAW_DIR / "lroc_mariuspit01" / "NAC_DTM_MARIUSPIT01.TIF"
EARTH_DTM = RAW_DIR / "ot_ca23_williams" / "LAVA_GEG_50C_COG.tif"

pytestmark = [
    pytest.mark.data,
    pytest.mark.skipif(not (MOON_DTM.exists() and EARTH_DTM.exists() and MANIFEST_PATH.exists()),
                       reason="source rasters / manifest not present"),
]


@pytest.fixture(scope="module")
def manifest():
    return json.loads(MANIFEST_PATH.read_text())


def test_moon_source_raster_properties():
    with rasterio.open(MOON_DTM) as ds:
        assert ds.crs.to_epsg() is None
        assert "Moon" in ds.crs.to_wkt()
        assert ds.res == pytest.approx((4.0, 4.0))
        assert ds.dtypes[0] == "float32"
        assert ds.nodata == pytest.approx(-3.40282266e38, rel=1e-6)


def test_earth_source_raster_properties():
    with rasterio.open(EARTH_DTM) as ds:
        assert ds.crs.to_epsg() == 32610
        assert ds.res == (0.5, 0.5)
        assert ds.nodata == -9999


def test_gate_passed_and_all_sources_retrieved(manifest):
    assert manifest["phase_a_gate"]["status"] == "pass"
    assert manifest["fetch_report"]["failed"] == []
    for ds in manifest["datasets"]:
        assert ds["status"] == "validated"
        assert all(f["retrieved"] and len(f["sha256"]) == 64 for f in ds["files"])


def test_manifest_has_required_provenance_fields(manifest):
    for ds in manifest["datasets"]:
        for key in ("landing_page", "product_id", "acquisition", "license", "horizontal_reference",
                    "vertical_reference", "measured", "known_limitations", "citations"):
            assert ds.get(key), f"{ds['id']} missing {key}"
        assert ds["measured"]["dtm"]["valid_fraction"] > 0


def test_pit_floor_is_reported_unmeasured_not_filled(manifest):
    moon = next(r for r in manifest["rois"] if r["id"] == "moon_marius_hills_pit")
    pa = moon["pit_analysis"]
    assert pa["nodata_gap"]["present"] and not pa["pit_floor_measured"]
    assert pa["measured_depression_is_lower_bound"]
    dtm = next(a for a in manifest["derived_assets"] if a["kind"] == "dtm_roi" and a["source"] == "lroc_mariuspit01")
    with rasterio.open(REPO_ROOT / dtm["path"]) as ds:
        z = ds.read(1, masked=True)
        # The derived ROI keeps nodata as nodata: every masked pixel is the pit gap.
        assert int(z.mask.sum()) == pa["nodata_gap"]["pixel_count"]


def test_coarsened_assets_share_extent_and_are_labelled_simulated(manifest):
    earth = [a for a in manifest["derived_assets"] if a["source"] == "ot_ca23_williams"]
    assert sorted(a["resolution_m"] for a in earth) == [0.5, 2.0, 4.0, 10.0, 30.0, 60.0]
    bounds = {tuple(a["bounds"].values()) for a in earth}
    assert len(bounds) == 1
    for a in earth:
        with rasterio.open(REPO_ROOT / a["path"]) as ds:
            assert ds.crs.to_epsg() == 32610
            assert ds.res == pytest.approx((a["resolution_m"],) * 2)
            label = ds.tags()["LABEL"]
        if a["resolution_m"] == 0.5:
            assert a["kind"] == "dtm_roi" and "observed" in label
        else:
            assert a["kind"] == "dtm_roi_simulated_coarsening" and "SIMULATED" in label


def test_coarsened_mean_elevation_is_preserved(manifest):
    earth = {a["resolution_m"]: a for a in manifest["derived_assets"] if a["source"] == "ot_ca23_williams"}
    with rasterio.open(REPO_ROOT / earth[0.5]["path"]) as ds:
        ref = ds.read(1, masked=True).mean()
    for res, a in earth.items():
        with rasterio.open(REPO_ROOT / a["path"]) as ds:
            assert float(ds.read(1, masked=True).mean()) == pytest.approx(float(ref), abs=0.01), res
            assert np.isfinite(ds.read(1)).all()
