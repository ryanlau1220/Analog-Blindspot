"""Phase D gate: Lanzarote CNIG MDT02 tiles at Malpaís de La Corona.

    uv run fetch-landmarks-es   # IGN NGBE points (committed)
    uv run phase-d              # verify tiles in datasets/raw/cnig_mdt02_lanzarote/

The CNIG download centre requires a browser (reCAPTCHA + licence step), so this
script never downloads tiles. If a required tile is missing it records the
dataset as ``awaiting_manual_download`` with exact instructions and exits 2.
When tiles are present it checks them at pixel level and runs the same
landmark-relief and simulated-coarsening analysis as Lava Beds.

Output: ``datasets/manifest_phase_d.json``; the same record is embedded in
``datasets/manifest.json`` under ``phase_d``.
"""

from __future__ import annotations

import json
import sys
import tomllib
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from pyproj import CRS
from rasterio.enums import Resampling
from rasterio.merge import merge

from . import earth
from .download import sha256_file
from .paths import CONFIG_DIR, DATASETS_DIR, DERIVED_DIR, MANIFEST_PATH, PREVIEW_DIR, RAW_DIR
from .phase_a import Gate, rel, res_tag, write_geotiff
from .previews import gray_png
from .rasterinfo import describe, valid_mask
from .terrain import hillshade, slope_deg

PHASE_D_MANIFEST = DATASETS_DIR / "manifest_phase_d.json"
SIM = "SIMULATED COARSENING of the 2 m CNIG MDT02 - not an observation"
BG_SEED = 20261114
BG_POINTS = 400


def load_cfg() -> dict:
    with (CONFIG_DIR / "phase_d.toml").open("rb") as fh:
        return tomllib.load(fh)


def size_matches_catalog(size_bytes: int, catalog_mb: float) -> bool:
    """CNIG lists sizes as 'MB' to 2 decimals; accept decimal or binary megabytes."""
    return any(abs(size_bytes / unit - catalog_mb) <= 0.006 + 1e-3 * catalog_mb for unit in (1e6, 2**20))


def ingest(path: Path, tile: dict) -> dict:
    """Hash a manually downloaded tile and keep a sidecar so reruns are cheap."""
    side = path.with_name(path.name + ".ingest.json")
    st = path.stat()
    if side.exists():
        rec = json.loads(side.read_text())
        if rec["size_bytes"] == st.st_size and rec["mtime_ns"] == st.st_mtime_ns:
            return rec
    rec = {
        "filename": path.name,
        "size_bytes": st.st_size,
        "mtime_ns": st.st_mtime_ns,
        "sha256": sha256_file(path),
        "ingested_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "acquisition": "manual browser download from the CNIG download centre",
        "detail_url": tile["detail_url"],
    }
    side.write_text(json.dumps(rec, indent=2) + "\n")
    return rec


def crs_is_regcan95_utm28(crs) -> tuple[bool, str]:
    c = CRS.from_wkt(crs.to_wkt())
    epsg = c.to_epsg(min_confidence=70)
    if epsg == 4083:
        return True, "EPSG:4083 REGCAN95 / UTM zone 28N"
    name = c.name.upper()
    utm28 = c.is_projected and "28N" in name.replace(" ", "")
    regcan = "REGCAN" in (c.datum.name if c.datum else "").upper() or "REGCAN" in name
    if utm28 and regcan:
        return True, f"{c.name} (equivalent to EPSG:4083)"
    return False, f"{c.name} (EPSG {epsg})"


def merged_roi(paths: list[Path], roi: earth.Roi, res: float) -> tuple[np.ndarray, Affine, object, float]:
    """Read the ROI from one or more aligned tiles without resampling."""
    srcs = [rasterio.open(p) for p in paths]
    try:
        crs, nod = srcs[0].crs, srcs[0].nodata
        for s in srcs:
            if s.crs != crs or not np.allclose(s.res, (res, res)):
                raise ValueError(f"{s.name}: CRS/resolution differs between tiles")
            # Pixel edges must sit on the same lattice, otherwise merging would resample.
            for edge in (s.transform.c - roi.left, s.transform.f - roi.top):
                if abs(edge / res - round(edge / res)) > 1e-6:
                    raise ValueError(f"{s.name}: grid not aligned with ROI lattice")
        arr, tr = merge(
            srcs, bounds=(roi.left, roi.bottom, roi.right, roi.top), res=res, nodata=nod, resampling=Resampling.nearest
        )
        return arr[0], tr, crs, nod
    finally:
        for s in srcs:
            s.close()


def awaiting(cfg: dict, missing: list[dict]) -> dict:
    raw = RAW_DIR / cfg["raw_subdir"]
    return {
        "id": cfg["product_id"],
        "role": "earth_candidate_2",
        "status": "awaiting_manual_download",
        "site": "Lanzarote / Malpaís de La Corona, Canary Islands, Spain",
        "title": cfg["product"]["title"],
        "catalog_url": cfg["product"]["catalog_url"],
        "tiles_identified": [
            {k: t[k] for k in ("filename", "cnig_sec", "detail_url", "catalog_mb", "catalog_year")} for t in cfg["tile"]
        ],
        "missing_files": [t["filename"] for t in missing],
        "why_manual": "CNIG direct download requires reCAPTCHA and an interactive licence step; it is not scripted.",
        "instructions": [
            f"Open each detail_url, accept the licence and download the file into {rel(raw)}/",
            "Keep the original file name, then run: uv run phase-d && uv run export-web",
        ],
        "license": cfg["product"]["license"],
    }


def main() -> int:
    cfg = load_cfg()
    gate = Gate()
    raw = RAW_DIR / cfg["raw_subdir"]
    raw.mkdir(parents=True, exist_ok=True)
    tiles = cfg["tile"]
    present = [t for t in tiles if (raw / t["filename"]).exists()]
    missing_required = [t for t in tiles if not t.get("optional") and t not in present]
    absent_optional = [t["filename"] for t in tiles if t.get("optional") and t not in present]

    if missing_required:
        for t in missing_required:
            gate.check(f"lanzarote:retrieved:{t['filename']}", False, f"not found in {rel(raw)}/ (manual download)")
        record = {
            "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
            "pipeline_version": cfg["pipeline_version"],
            "gate": {"status": "blocked", "checks": gate.checks},
            "dataset": awaiting(cfg, missing_required),
        }
        return finish(record, 2)

    files = []
    infos = {}
    for t in present:
        p = raw / t["filename"]
        rec = ingest(p, t)
        ok = size_matches_catalog(rec["size_bytes"], t["catalog_mb"])
        gate.check(
            f"lanzarote:retrieved:{t['filename']}",
            ok,
            f"{rec['size_bytes']} bytes vs catalog {t['catalog_mb']} MB; sha256 {rec['sha256'][:16]}...",
        )
        info = describe(p)
        infos[t["filename"]] = info
        files.append(
            {**rec, "catalog_mb": t["catalog_mb"], "catalog_year": t["catalog_year"], "cnig_sec": t["cnig_sec"]}
        )
        with rasterio.open(p) as ds:
            ok_crs, crs_desc = crs_is_regcan95_utm28(ds.crs)
        gate.check(f"lanzarote:crs:{t['filename']}", ok_crs, crs_desc)
        gate.check(
            f"lanzarote:pixel_spacing:{t['filename']}",
            np.allclose(info["pixel_size"], cfg["product"]["native_res_m"]),
            f"measured {info['pixel_size']} m",
        )
        gate.check(
            f"lanzarote:has_valid_pixels:{t['filename']}",
            info["valid_fraction"] > 0.05,
            f"{info['valid_fraction'] * 100:.1f}% valid, {info['valid_area_km2']:.2f} km2, "
            f"elevation {info.get('value_min', float('nan')):.1f}..{info.get('value_max', float('nan')):.1f} m",
        )

    first = raw / present[0]["filename"]
    with rasterio.open(first) as ds:
        crs_wkt = ds.crs.to_wkt()
        epsg = ds.crs.to_epsg() or cfg["product"]["expected_epsg"]
    crs_str = f"EPSG:{epsg}"
    rc = cfg["roi"]
    res = cfg["product"]["native_res_m"]
    roi = earth.snapped_roi(rc["center_lon"], rc["center_lat"], rc["size_m"], rc["snap_m"], crs=crs_wkt)
    z, tr, crs, nod = merged_roi([raw / t["filename"] for t in present], roi, res)
    valid = valid_mask(z, nod)
    gate.check(
        "lanzarote:roi_valid_pixels",
        valid.mean() >= rc["min_valid_fraction"],
        f"{valid.mean() * 100:.2f}% valid in {rc['size_m']:g} m ROI {roi}"
        + (f"; ROI may need optional tiles not present: {absent_optional}" if absent_optional else ""),
    )

    lms_all = earth.load_landmarks(CONFIG_DIR / rc["landmark_file"], crs=crs_wkt)
    by = {lm["name"]: lm for lm in lms_all}
    lms = [by[n] for n in rc["required_landmarks"] if n in by]
    gate.check(
        "lanzarote:landmarks_present_in_ngbe",
        len(lms) == len(rc["required_landmarks"]),
        f"{len(lms)}/{len(rc['required_landmarks'])} required NGBE features",
    )
    on_valid = [lm["name"] for lm in lms if earth.point_in_valid(valid, tr, lm["utm_x"], lm["utm_y"])]
    off = sorted({lm["name"] for lm in lms} - set(on_valid))
    gate.check(
        "lanzarote:landmarks_on_valid_pixels",
        len(on_valid) == len(lms),
        f"{len(on_valid)}/{len(lms)} on valid 2 m pixels; not on valid data: {off}",
    )

    radius = cfg["landmark_check"]["radius_m"]
    cc = cfg["coarsen"]
    levels = earth.coarsen_levels(z, valid, res, cc["targets_m"], cc["min_valid_fraction"])
    rows, derived, previews = [], [], []
    for r, (zl, vl) in sorted(levels.items()):
        trl = Affine(r, 0, roi.left, 0, -r, roi.top)
        native = r == res
        label = "observed (CNIG PNOA-LiDAR MDT02, native 2 m)" if native else SIM
        tags = {
            "SOURCE_PRODUCT": "CNIG MDT02 2nd coverage: " + ", ".join(t["filename"] for t in present),
            "SOURCE_SHA256": ",".join(f["sha256"] for f in files),
            "PIPELINE_VERSION": cfg["pipeline_version"],
            "LABEL": label,
            "ATTRIBUTION": cfg["product"]["attribution_derived"],
            "PROCESSING": "native window" if native else f"block mean {round(r / res)}x{round(r / res)}",
            "HEIGHTS": cfg["product"]["heights"],
        }
        d = write_geotiff(
            DERIVED_DIR / "lanzarote" / f"lanzarote_roi_dtm_{res_tag(r)}.tif",
            zl,
            crs=crs,
            transform=trl,
            nodata=-9999.0,
            tags=tags,
        )
        lm_rel = {}
        for lm in lms:
            lr = earth.local_relief(zl, vl, trl, lm["utm_x"], lm["utm_y"], radius)
            lm_rel[lm["name"]] = None if lr["relief_m"] is None else round(lr["relief_m"], 3)
        base = earth.relief_baseline(zl, vl, trl, radius, BG_POINTS, seed=BG_SEED, min_valid=0.9)
        vals = [v for v in lm_rel.values() if v is not None]
        sl = slope_deg(zl, r)
        rows.append(
            {
                "resolution_m": r,
                "label": label,
                "shape": list(zl.shape),
                "valid_fraction": float(vl.mean()),
                "slope_deg_p95": float(np.nanpercentile(sl, 95)),
                "landmark_relief_m": lm_rel,
                "landmark_relief_median_m": float(np.median(vals)) if vals else None,
                "background_relief_p50_m": float(np.median(base)) if base.size else None,
                "background_points_used": int(base.size),
            }
        )
        derived.append(
            {
                **d,
                "kind": "dtm_roi" if native else "dtm_roi_simulated_coarsening",
                "resolution_m": r,
                "label": label,
                "source": cfg["product_id"],
            }
        )
        marks = [((~trl @ (lm["utm_x"], lm["utm_y"]))[1], (~trl @ (lm["utm_x"], lm["utm_y"]))[0], "") for lm in lms]
        title = (
            "Lanzarote 2 m MDT02 hillshade (observed); magenta = nodata"
            if native
            else f"SIMULATED COARSENING to {r:g} m (block mean of 2 m MDT02)"
        )
        previews.append(
            gray_png(
                hillshade(zl, r),
                PREVIEW_DIR / f"lanzarote_roi_hillshade_{res_tag(r)}.png",
                markers=marks,
                scale_bar=(r, 500),
                title=title,
            )
        )
    zn, _ = levels[res]
    named = [((~tr @ (lm["utm_x"], lm["utm_y"]))[1], (~tr @ (lm["utm_x"], lm["utm_y"]))[0], lm["name"]) for lm in lms]
    previews.append(
        gray_png(
            hillshade(zn, res),
            PREVIEW_DIR / "lanzarote_jameos_2m_labeled.png",
            display_px=1400,
            markers=named,
            scale_bar=(res, 200),
            title="2 m MDT02 hillshade, IGN NGBE jameo points (approximate positions)",
        )
    )
    native_row = rows[0]
    gate.check(
        "lanzarote:landmarks_rougher_than_background_at_native",
        (native_row["landmark_relief_median_m"] or 0) > (native_row["background_relief_p50_m"] or 0),
        f"median relief within {radius:g} m: jameos {native_row['landmark_relief_median_m']} m vs "
        f"background {native_row['background_relief_p50_m']} m; {native_row['landmark_relief_m']}",
    )

    p = cfg["product"]
    status = "validated" if gate.passed else "failed"
    record = {
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "pipeline_version": cfg["pipeline_version"],
        "gate": {"status": "pass" if gate.passed else "fail", "checks": gate.checks},
        "dataset": {
            "id": cfg["product_id"],
            "role": "earth_candidate_2",
            "status": status,
            "site": "Lanzarote / Malpaís de La Corona, Canary Islands, Spain",
            "title": p["title"],
            "product_id": "MDT02-COB2",
            "producer": "IGN / CNIG, PNOA-LiDAR (2nd coverage)",
            "catalog_url": p["catalog_url"],
            "format": p["format"],
            "acquisition": {"catalog_year": sorted({t["catalog_year"] for t in present})},
            "license": {
                "terms": p["license"],
                "terms_url": p["license_url"],
                "attribution_unmodified": p["attribution_unmodified"],
                "attribution_derived": p["attribution_derived"],
            },
            "files": files,
            "horizontal_reference": {"crs": crs_str, "crs_wkt": crs_wkt},
            "vertical_reference": {"units": "metres", "heights": p["heights"]},
            "measured": {"tiles": infos},
            "known_limitations": [
                "Surface DTM only; the Túnel de la Atlántida / Cueva de los Verdes interior is not measured.",
                "NGBE points come from a 1:25 000 base map; positions are approximate.",
                "Native grid is 2 m (not 0.5 m as at Lava Beds); coarsened grids are simulations.",
            ],
        },
        "roi": {
            "id": "earth_lanzarote_la_corona",
            "name": rc["name"],
            "bounds": {"left": roi.left, "bottom": roi.bottom, "right": roi.right, "top": roi.top, "crs": crs_str},
            "size_m": roi.size_m,
            "valid_fraction": float(valid.mean()),
            "landmarks": [
                {k: lm[k] for k in ("name", "ngbe_id", "ngbe_local_type", "lon", "lat", "utm_x", "utm_y")} for lm in lms
            ],
            "landmark_source": "IGN NGBE, scientific/config/" + rc["landmark_file"],
            "landmark_check_radius_m": radius,
            "background": {"points": BG_POINTS, "seed": BG_SEED, "min_valid_fraction": 0.9},
            "resolution_levels": rows,
        },
        "derived_assets": derived,
        "previews": [{**pv, "path": rel(PREVIEW_DIR / pv["file"])} for pv in previews],
    }
    return finish(record, 0 if gate.passed else 1)


def finish(record: dict, code: int) -> int:
    PHASE_D_MANIFEST.write_text(json.dumps(record, indent=2, allow_nan=False) + "\n")
    if MANIFEST_PATH.exists():
        man = json.loads(MANIFEST_PATH.read_text())
        man["phase_d"] = record
        MANIFEST_PATH.write_text(json.dumps(man, indent=2, allow_nan=False) + "\n")
    print(f"phase D: {record['dataset']['status']}; wrote {rel(PHASE_D_MANIFEST)}", file=sys.stderr)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
