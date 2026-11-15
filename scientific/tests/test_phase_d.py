"""Phase D gate logic. The fake tile below exists only inside this test (tmp_path)
to exercise the validation branch; it is never written to datasets/."""

import json

import numpy as np
import pytest
import rasterio
from affine import Affine
from pyproj import CRS

from analog_blindspot_science import earth, phase_a, phase_d


def test_size_matches_catalog_accepts_decimal_or_binary_mb():
    assert phase_d.size_matches_catalog(72_010_000, 72.01)
    assert phase_d.size_matches_catalog(round(72.01 * 2**20), 72.01)
    assert not phase_d.size_matches_catalog(60_000_000, 72.01)


def test_crs_check_accepts_regcan95_utm28_only():
    ok, _ = phase_d.crs_is_regcan95_utm28(rasterio.crs.CRS.from_epsg(4083))
    assert ok
    ok, desc = phase_d.crs_is_regcan95_utm28(rasterio.crs.CRS.from_epsg(32610))
    assert not ok and "32610" in desc


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    for mod in (phase_d,):
        monkeypatch.setattr(mod, "RAW_DIR", tmp_path / "raw")
        monkeypatch.setattr(mod, "DERIVED_DIR", tmp_path / "derived")
        monkeypatch.setattr(mod, "PREVIEW_DIR", tmp_path / "previews")
        monkeypatch.setattr(mod, "DATASETS_DIR", tmp_path)
        monkeypatch.setattr(mod, "MANIFEST_PATH", tmp_path / "manifest.json")
        monkeypatch.setattr(mod, "PHASE_D_MANIFEST", tmp_path / "manifest_phase_d.json")
        monkeypatch.setattr(mod, "rel", str)
    monkeypatch.setattr(phase_a, "rel", str)
    return tmp_path


def test_missing_tile_is_reported_not_faked(sandbox):
    assert phase_d.main() == 2
    rec = json.loads((sandbox / "manifest_phase_d.json").read_text())
    assert rec["dataset"]["status"] == "awaiting_manual_download"
    assert rec["dataset"]["missing_files"] == ["MDT02-REGCAN95-HU28-1080-4-COB2.TIF"]
    assert not (sandbox / "derived").exists()


def write_fake_tile(path, cfg, depressions=True):
    """2 m EPSG:4083 grid around the ROI with 8 m deep bowls at each landmark."""
    crs = CRS.from_epsg(4083).to_wkt()
    rc = cfg["roi"]
    roi = earth.Roi(rc["left"], rc["top"] - rc["size_m"], rc["left"] + rc["size_m"], rc["top"])
    pad = 600.0
    left, top = roi.left - pad, roi.top + pad
    n = int((roi.size_m + 2 * pad) / 2)
    rng = np.random.default_rng(0)
    z = (100 + rng.normal(0, 0.3, (n, n))).astype(np.float32)
    if depressions:
        yy, xx = np.mgrid[0:n, 0:n]
        for lm in earth.load_landmarks(phase_d.CONFIG_DIR / rc["landmark_file"], crs=crs):
            c, r = (lm["utm_x"] - left) / 2, (top - lm["utm_y"]) / 2
            d = np.hypot(yy - r, xx - c) * 2
            z -= np.where(d < 20, 8 * (1 - d / 20), 0).astype(np.float32)
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=n,
        height=n,
        count=1,
        dtype="float32",
        crs=crs,
        transform=Affine(2, 0, left, 0, -2, top),
        nodata=-32767,
    ) as ds:
        ds.write(z, 1)


@pytest.mark.parametrize(("depressions", "expected"), [(True, 0), (False, 1)])
def test_validation_branch(sandbox, monkeypatch, depressions, expected):
    cfg = phase_d.load_cfg()
    write_fake_tile(sandbox / "raw" / cfg["raw_subdir"] / cfg["tile"][0]["filename"], cfg, depressions)
    monkeypatch.setattr(phase_d, "size_matches_catalog", lambda *_: True)
    assert phase_d.main() == expected
    rec = json.loads((sandbox / "manifest_phase_d.json").read_text())
    checks = {c["name"]: c["passed"] for c in rec["gate"]["checks"]}
    assert checks["lanzarote:landmarks_on_valid_pixels"]
    assert checks["lanzarote:landmarks_rougher_than_background_at_native"] is depressions
    levels = [row["resolution_m"] for row in rec["roi"]["resolution_levels"]]
    assert levels == [2.0, 4.0, 10.0, 30.0, 60.0]
    for a in rec["derived_assets"]:
        assert a["kind"] == ("dtm_roi" if a["resolution_m"] == 2.0 else "dtm_roi_simulated_coarsening")
        with rasterio.open(a["path"]) as ds:
            assert ds.crs.to_epsg() == 4083
            assert ("SIMULATED" in ds.tags()["LABEL"]) is (a["resolution_m"] != 2.0)


def test_web_candidate_status_follows_phase_d_record():
    from analog_blindspot_science.export_web import lanzarote_candidate

    assert lanzarote_candidate(None)["status"] == "not_verified"
    waiting = {
        "dataset": {
            "status": "awaiting_manual_download",
            "tiles_identified": [
                {"filename": "MDT02-REGCAN95-HU28-1080-4-COB2.TIF", "catalog_mb": 72.01, "detail_url": "u"}
            ],
        }
    }
    c = lanzarote_candidate(waiting)
    assert c["status"] == "not_verified" and "awaiting manual download" in c["note"]
    ok = {"dataset": {"status": "validated", "files": [{"filename": "f.TIF", "detail_url": "u"}]}}
    assert lanzarote_candidate(ok)["status"] == "validated"
    failed = {"dataset": {"status": "failed"}}
    assert lanzarote_candidate(failed)["status"] == "not_verified"
