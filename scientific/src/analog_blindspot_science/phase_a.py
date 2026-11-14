"""Phase A scientific gate.

Run after ``uv run fetch-sources`` and ``uv run fetch-landmarks``:

    uv run phase-a

Reads only downloaded source bytes, writes derived GeoTIFFs to
``datasets/derived``, review PNGs to ``datasets/previews`` and the provenance
manifest to ``datasets/manifest.json``. Exits non-zero if any gate check fails.
"""

from __future__ import annotations

import json
import platform
import sys
import tomllib
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pyproj
import rasterio
from affine import Affine
from rasterio.enums import Resampling

from . import earth, moon
from .download import load_record, sha256_file
from .fetch_sources import load_sources
from .lunar import assert_lunar_crs, parse_pds3_label
from .paths import (
    CONFIG_DIR,
    DATASETS_DIR,
    DERIVED_DIR,
    MANIFEST_PATH,
    PREVIEW_DIR,
    RAW_DIR,
    REPO_ROOT,
)
from .previews import gray_png, stretch
from .rasterinfo import describe
from .terrain import hillshade, slope_deg

SIM_LABEL = "SIMULATED COARSENING of 0.5 m Lava Beds LiDAR DTM - not an observation"


def rel(p: Path) -> str:
    return str(p.resolve().relative_to(REPO_ROOT))


class Gate:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def check(self, name: str, passed: bool, detail: str) -> bool:
        self.checks.append({"name": name, "passed": bool(passed), "detail": detail})
        print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}", file=sys.stderr)
        return passed

    @property
    def passed(self) -> bool:
        return all(c["passed"] for c in self.checks)


def write_geotiff(path: Path, arr: np.ndarray, *, crs, transform: Affine, nodata: float, tags: dict) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = arr.astype(np.float32 if arr.dtype.kind == "f" else arr.dtype)
    if data.dtype.kind == "f":
        data = np.where(np.isfinite(data), data, np.float32(nodata)).astype(np.float32)
    h, w = data.shape
    profile = {
        "driver": "GTiff",
        "width": w,
        "height": h,
        "count": 1,
        "dtype": data.dtype.name,
        "crs": crs,
        "transform": transform,
        "nodata": nodata,
        "compress": "deflate",
        "predictor": 3 if data.dtype.kind == "f" else 2,
    }
    if h >= 256 and w >= 256:
        profile.update(tiled=True, blockxsize=256, blockysize=256)
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)
        dst.update_tags(**{k: str(v) for k, v in tags.items()})
    return {
        "path": rel(path),
        "sha256": sha256_file(path),
        "size_bytes": path.stat().st_size,
        "width": w,
        "height": h,
        "pixel_size_m": abs(transform.a),
        "bounds": dict(zip(("left", "bottom", "right", "top"), _bounds(transform, w, h), strict=True)),
    }


def res_tag(res: float) -> str:
    """0.5 -> '0p5m', 4.0 -> '4m' (filesystem-friendly)."""
    return f"{res:g}m".replace(".", "p")


def _bounds(t: Affine, w: int, h: int) -> tuple[float, float, float, float]:
    left, top = t @ (0, 0)
    right, bottom = t @ (w, h)
    return float(left), float(bottom), float(right), float(top)


def source_files(product_id: str) -> list[dict]:
    out = []
    for s in load_sources():
        if s["id"] != product_id:
            continue
        rec = load_record(RAW_DIR / s["id"] / s["filename"])
        out.append(
            {
                "asset": s["asset"],
                "filename": s["filename"],
                "url": s["url"],
                "retrieved": rec is not None,
                **(
                    {}
                    if rec is None
                    else {
                        "final_url": rec.final_url,
                        "size_bytes": rec.size_bytes,
                        "sha256": rec.sha256,
                        "http_etag": rec.http_etag,
                        "http_last_modified": rec.http_last_modified,
                        "retrieved_utc": rec.retrieved_utc,
                    }
                ),
            }
        )
    return out


def verify_integrity(gate: Gate) -> None:
    for s in load_sources():
        p = RAW_DIR / s["id"] / s["filename"]
        rec = load_record(p)
        if rec is None:
            gate.check(f"retrieved:{s['id']}/{s['asset']}", False, f"missing or incomplete: {s['url']}")
            continue
        ok = rec.size_bytes == s["expected_size"] and sha256_file(p) == rec.sha256
        gate.check(
            f"retrieved:{s['id']}/{s['asset']}",
            ok,
            f"{rec.size_bytes} bytes, sha256 {rec.sha256[:16]}... re-verified on disk",
        )


# --------------------------------------------------------------------------- Moon


def run_moon(cfg: dict, gate: Gate) -> dict:
    mc = cfg["moon"]
    raw = RAW_DIR / mc["product_id"]
    dtm_p, conf_p, ortho_p = raw / mc["dtm"], raw / mc["confidence"], raw / mc["ortho"]
    lbl = parse_pds3_label(raw / "NAC_DTM_MARIUSPIT01.LBL")

    info_dtm = describe(dtm_p)
    info_conf = describe(conf_p, band_stats=False)
    info_ortho = describe(ortho_p, band_stats=False)

    with rasterio.open(dtm_p) as ds:
        crs = ds.crs
        try:
            assert_lunar_crs(crs)
            gate.check("moon:crs_is_lunar", True, "Equirectangular Moon, sphere R=1737.4 km, no Earth EPSG")
        except ValueError as exc:
            gate.check("moon:crs_is_lunar", False, str(exc))
    gate.check(
        "moon:pixel_spacing_4m",
        abs(info_dtm["pixel_size"][0] - 4.0) < 1e-6,
        f"measured {info_dtm['pixel_size'][0]:.10f} m/px (label MAP_SCALE {lbl.map_scale_m})",
    )
    gate.check(
        "moon:label_matches_raster",
        lbl.lines == info_dtm["height"] and lbl.samples == info_dtm["width"],
        f"label {lbl.samples}x{lbl.lines}, raster {info_dtm['width']}x{info_dtm['height']}",
    )
    grids_match = all(
        i["width"] == info_dtm["width"]
        and i["height"] == info_dtm["height"]
        and np.allclose(i["transform"], info_dtm["transform"], atol=1e-3)
        for i in (info_conf, info_ortho)
    )
    gate.check("moon:companions_coregistered", grids_match, "confidence map and 4 m orthophoto share the DTM grid")

    pit = mc["pit"]
    loc = moon.locate_pit(dtm_p, raw / "NAC_DTM_MARIUSPIT01.LBL", pit["lat"], pit["lon_east"])
    gate.check(
        "moon:pit_inside_extent",
        loc["inside_raster_extent"] and loc["inside_label_latlon_extent"],
        f"pit at row {loc['row_f']:.2f}, col {loc['col_f']:.2f}",
    )
    gate.check(
        "moon:pixel_location_two_methods",
        loc["pyproj_vs_label_px"] < 0.01,
        f"pyproj vs PDS3 label equations differ by {loc['pyproj_vs_label_px']:.2e} px",
    )

    size = mc["roi_size_px"]
    z, win, tr, nod, _ = moon.read_roi(dtm_p, loc["row"], loc["col"], size)
    conf, *_ = moon.read_roi(conf_p, loc["row"], loc["col"], size)
    ortho_dn, *_ = moon.read_roi(ortho_p, loc["row"], loc["col"], size)
    with rasterio.open(ortho_p) as ds:
        o_scale, o_off, o_nod = ds.scales[0], ds.offsets[0], ds.nodata
    ortho_nod = ortho_dn == o_nod
    oy, ox = np.nonzero(ortho_nod)
    ortho_gap = {"nodata_pixel_count": int(ortho_nod.sum())}
    if ortho_nod.any():
        ortho_gap.update(
            extent_ew_m=float((ox.max() - ox.min() + 1) * 4.0), extent_ns_m=float((oy.max() - oy.min() + 1) * 4.0)
        )
    valid = moon.to_valid(z, nod)
    center = (loc["row_f"] - win.row_off, loc["col_f"] - win.col_off)
    pc = mc["pit_check"]
    pa = moon.pit_analysis(z, valid, center, 4.0, pc["search_radius_m"], pc["rim_inner_m"], pc["rim_outer_m"])
    conf_pit = moon.confidence_summary(conf, center, pc["search_radius_m"] / 4.0)
    conf_roi = moon.roi_confidence(conf)

    gate.check(
        "moon:roi_valid_pixels",
        valid.mean() > 0.99,
        f"{valid.mean() * 100:.2f}% valid in {size}x{size} px ROI ({size * 4} m)",
    )
    gate.check(
        "moon:pit_depression_resolved",
        pa["measured_depression_m"] >= pc["min_depth_m"],
        f"valid funnel pixels reach {pa['measured_depression_m']:.1f} m below rim median "
        f"(threshold {pc['min_depth_m']} m = 3x SOCET precision)",
    )
    gap = pa["nodata_gap"]
    if gap["present"]:
        consistent = (
            gap["contains_atlas_point"]
            and pit["inner_diameter_m"][0] * 0.7 <= gap["equivalent_diameter_m"] <= pit["funnel_diameter_m"][1]
        )
        gate.check(
            "moon:pit_interior_nodata_explained",
            consistent,
            f"interior nodata gap {gap['extent_ew_m']:.0f} x {gap['extent_ns_m']:.0f} m (eq. diam "
            f"{gap['equivalent_diameter_m']:.1f} m) contains atlas point; atlas inner diameter "
            f"{pit['inner_diameter_m'][0]}-{pit['inner_diameter_m'][1]} m. Floor NOT measured by this DTM.",
        )

    # Derived assets: native-resolution windows, no resampling.
    tags = {
        "SOURCE_PRODUCT": "NAC_DTM_MARIUSPIT01 v" + lbl.product_version,
        "SOURCE_SHA256": info_sha(dtm_p),
        "PIPELINE_VERSION": cfg["pipeline_version"],
        "PROCESSING": "native 4 m window crop, no resampling",
        "WINDOW": f"row_off={win.row_off},col_off={win.col_off},size={size}",
        "ELEVATION": "metres; LROC NAC DTM heights relative to the 1737.4 km lunar reference sphere",
    }
    d_dtm = write_geotiff(
        DERIVED_DIR / "moon" / "mariuspit01_roi_dtm_4m.tif",
        np.where(valid, z, np.nan),
        crs=crs,
        transform=tr,
        nodata=-3.4028226550889045e38,
        tags=tags,
    )
    d_conf = write_geotiff(
        DERIVED_DIR / "moon" / "mariuspit01_roi_confidence.tif",
        conf.astype(np.uint8),
        crs=crs,
        transform=tr,
        nodata=0,
        tags={**tags, "SOURCE_SHA256": info_sha(conf_p), "SOURCE_PRODUCT": "NAC_DTM_MARIUSPIT01_CONF"},
    )
    hs = hillshade(np.where(valid, z, np.nan), 4.0)
    ortho = np.where(ortho_dn != o_nod, ortho_dn * o_scale + o_off, np.nan)
    marker = [(center[0], center[1], "")]
    prev = [
        gray_png(
            hs,
            PREVIEW_DIR / "moon_pit_roi_hillshade.png",
            markers=marker,
            scale_bar=(4.0, 200),
            title="MARIUSPIT01 4 m DTM hillshade (az 315, alt 45); magenta = nodata or adjacent",
        ),
        gray_png(
            stretch(ortho),
            PREVIEW_DIR / "moon_pit_roi_ortho4m.png",
            markers=marker,
            scale_bar=(4.0, 200),
            title="MARIUSPIT01 orthophoto M1274609891 resampled to 4 m",
        ),
        gray_png(
            np.where(conf == 0, np.nan, np.clip((conf.astype(float)) / 15.0, 0, 1)),
            PREVIEW_DIR / "moon_pit_roi_confidence.png",
            markers=marker,
            scale_bar=(4.0, 200),
            title="Confidence map (bright = correlated, dark = suspicious); magenta = 0/nodata",
        ),
    ]
    # Full-product context at 1/8 resolution (preview only).
    with rasterio.open(dtm_p) as ds:
        f = 8
        full = ds.read(1, out_shape=(ds.height // f, ds.width // f), resampling=Resampling.average)
        full = np.where(np.abs(full) < 1e30, full, np.nan)
    prev.append(
        gray_png(
            hillshade(full, 4.0 * f),
            PREVIEW_DIR / "moon_full_dtm_context.png",
            display_px=1200,
            markers=[(loc["row_f"] / f, loc["col_f"] / f, "pit")],
            title="MARIUSPIT01 full extent, 32 m preview",
        )
    )

    return {
        "dataset": {
            "id": "lroc_mariuspit01",
            "role": "moon_primary",
            "status": "validated"
            if all(c["passed"] for c in gate.checks if c["name"].startswith("moon:"))
            else "failed",
            "title": "LROC NAC DTM Marius Pit (NAC_DTM_MARIUSPIT01)",
            "body": "Moon",
            "product_id": lbl.product_id,
            "product_version": lbl.product_version,
            "pds_data_set_id": "LRO-L-LROC-5-RDR-V1.0",
            "pds_volume": "LROLRC_2001",
            "doi": None,
            "doi_note": "No product-level DOI found; cite PDS data set LRO-L-LROC-5-RDR-V1.0 and the product ID.",
            "landing_page": "https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_MARIUSPIT01",
            "overview_page": "https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_MARIUSPIT01",
            "producer": "LROC Science Operations Center, Arizona State University",
            "source_images": ["M1274609891L/R", "M1274616922L/R"],
            "acquisition": {"start_utc": lbl.start_time, "stop_utc": lbl.stop_time},
            "product_creation_utc": lbl.creation_time,
            "license": {
                "terms": "Public domain (LROC PDS-delivered data products)",
                "terms_url": "https://lroc.im-ldi.com/about/terms",
                "credit": "NASA/GSFC/Arizona State University",
            },
            "citations": [
                "Henriksen, M.R., et al. (2017). Extracting accurate and precise topography from LROC narrow angle "
                "camera stereo observations. Icarus 283: 122-137. https://doi.org/10.1016/j.icarus.2016.05.012",
                "Robinson, M.S., et al. (2010). Lunar Reconnaissance Orbiter Camera (LROC) Instrument Overview. "
                "Space Science Reviews 150: 81-124.",
            ],
            "files": source_files("lroc_mariuspit01"),
            "horizontal_reference": {
                "body": "Moon",
                "projection": "Equirectangular, standard parallel 14 N, central meridian 180 E",
                "sphere_radius_m": lbl.radius_m,
                "latitude_type": "planetocentric",
                "longitude": "0-360 positive east",
                "crs_wkt": info_dtm["crs_wkt"],
            },
            "vertical_reference": {
                "units": "metres",
                "reference": "Heights relative to the 1737.4 km lunar reference sphere",
                "basis": "LROC NAC DTM convention; label defines the 1737.4 km sphere but does not state the "
                "height datum explicitly. Measured values (-1587..-1529 m in ROI) are consistent.",
            },
            "accuracy": {
                "lola_tie_rms_m": 1.42,
                "lola_tracks": 15,
                "socet_precision_m": 3.43,
                "source": "NAC_DTM_MARIUSPIT01_README.TXT",
            },
            "catalog_metadata": {
                "post_spacing_m": lbl.map_scale_m,
                "lat_range": [lbl.min_lat, lbl.max_lat],
                "lon_east_range": [lbl.west_lon, lbl.east_lon],
                "nodata": lbl.nodata,
            },
            "measured": {"dtm": info_dtm, "confidence_map": info_conf, "orthophoto_4m": info_ortho},
            "known_limitations": [
                "Pit interior (floor and overhangs) is nodata in this DTM; pit floor depth is NOT measured here.",
                "Atlas depth (40 m) comes from separate stereo modelling, not from these DTM pixels.",
                "4 m post spacing: features narrower than ~3 posts (12 m) are not resolved.",
                "1.10 m orthophotos exist but are image resolution, not elevation resolution.",
                "README lists possible SOCET SET artifacts (boxes, seams, facets); see confidence map.",
                "Subsurface void geometry is unmeasured by any product in this manifest.",
            ],
            "not_to_be_confused_with": {
                "product": "NAC_DTM_MARIUS (2 m/px)",
                "reason": "Covers lon 303.86-304.36 E and does not contain the pit at 303.2299 E; not used.",
            },
        },
        "roi": {
            "id": "moon_marius_hills_pit",
            "dataset": "lroc_mariuspit01",
            "landmark": {**pit, "located": loc},
            "window_px": {"row_off": int(win.row_off), "col_off": int(win.col_off), "size": size},
            "extent_m": size * 4.0,
            "bounds_map_m": dict(zip(("left", "bottom", "right", "top"), _bounds(tr, size, size), strict=True)),
            "valid_fraction": float(valid.mean()),
            "pit_analysis": pa,
            "confidence_within_search_radius": conf_pit,
            "confidence_roi": conf_roi,
            "orthophoto_4m_nodata_in_roi": ortho_gap,
        },
        "derived": [
            {**d_dtm, "kind": "dtm_roi", "label": "observed (LROC NAC DTM, native 4 m)", "source": "lroc_mariuspit01"},
            {
                **d_conf,
                "kind": "confidence_roi",
                "label": "observed (LROC confidence map)",
                "source": "lroc_mariuspit01",
            },
        ],
        "previews": prev,
    }


def info_sha(p: Path) -> str:
    rec = load_record(p)
    return rec.sha256 if rec else sha256_file(p)


# -------------------------------------------------------------------------- Earth


def run_earth(cfg: dict, gate: Gate) -> dict:
    ec = cfg["earth"]
    raw = RAW_DIR / ec["product_id"]
    dtm_p = raw / ec["dtm"]
    info = describe(dtm_p)
    boundary = earth.boundary_utm(raw / ec["boundary"])

    gate.check("earth:crs_utm10n", info["epsg"] == 32610, f"EPSG:{info['epsg']}")
    gate.check(
        "earth:pixel_spacing_0.5m",
        np.allclose(info["pixel_size"], ec["native_res_m"]),
        f"measured {info['pixel_size']} m",
    )
    gate.check(
        "earth:valid_area_matches_catalog",
        abs(info["valid_area_km2"] - 57.44) / 57.44 < 0.03,
        f"valid-pixel area {info['valid_area_km2']:.2f} km2 vs catalog 57.44 km2; "
        f"published raster boundary polygon {boundary.area / 1e6:.2f} km2",
    )

    rc = ec["roi"]
    roi = earth.snapped_roi(rc["center_lon"], rc["center_lat"], rc["size_m"], rc["snap_m"])
    z, valid, tr, prof = earth.read_roi(dtm_p, roi)
    corners_in = all(
        earth.footprint_contains(boundary, x, y)
        for x, y in ((roi.left, roi.bottom), (roi.left, roi.top), (roi.right, roi.bottom), (roi.right, roi.top))
    )
    gate.check("earth:roi_inside_footprint", corners_in, f"ROI {roi} inside published raster boundary")
    gate.check("earth:roi_valid_pixels", valid.mean() > 0.99, f"{valid.mean() * 100:.3f}% valid of {z.size:,} px")

    lm_all = earth.load_landmarks(CONFIG_DIR / rc["landmark_file"])
    by_name = {lm["name"]: lm for lm in lm_all}
    missing = [n for n in rc["required_landmarks"] if n not in by_name]
    gate.check(
        "earth:landmarks_present_in_gnis",
        not missing,
        f"missing: {missing}" if missing else f"{len(rc['required_landmarks'])} named GNIS lava-tube bridges found",
    )
    lms = [by_name[n] for n in rc["required_landmarks"] if n in by_name]
    in_valid = [lm["name"] for lm in lms if earth.point_in_valid(valid, tr, lm["utm_x"], lm["utm_y"])]
    gate.check(
        "earth:landmarks_on_valid_pixels",
        len(in_valid) == len(lms),
        f"{len(in_valid)}/{len(lms)} landmarks fall on valid 0.5 m pixels inside the ROI",
    )

    cc = ec["coarsen"]
    levels = earth.coarsen_levels(z, valid, ec["native_res_m"], cc["targets_m"], cc["min_valid_fraction"])
    radius = ec["landmark_check"]["radius_m"]
    level_rows = []
    derived = []
    previews = []
    crs = prof["crs"]
    src_sha = info_sha(dtm_p)
    for res, (zl, vl) in sorted(levels.items()):
        trl = Affine(res, 0, roi.left, 0, -res, roi.top)
        assert _bounds(trl, zl.shape[1], zl.shape[0]) == (roi.left, roi.bottom, roi.right, roi.top)
        native = res == ec["native_res_m"]
        label = "observed (NCALM LiDAR bare-earth DTM, native 0.5 m)" if native else SIM_LABEL
        tags = {
            "SOURCE_PRODUCT": "OTSDEM.102024.32610.1 (CA23_Williams bare earth)",
            "SOURCE_SHA256": src_sha,
            "PIPELINE_VERSION": cfg["pipeline_version"],
            "LABEL": label,
            "PROCESSING": "native window crop"
            if native
            else f"block mean {int(round(res / ec['native_res_m']))}x{int(round(res / ec['native_res_m']))}, "
            f"min valid fraction {cc['min_valid_fraction']}",
            "VERTICAL_DATUM": "NAVD88 (GEOID18) EPSG:5703, per OpenTopography metadata (not embedded in source)",
        }
        d = write_geotiff(
            DERIVED_DIR / "earth" / f"lavabeds_roi_dtm_{res_tag(res)}.tif",
            zl,
            crs=crs,
            transform=trl,
            nodata=-9999.0,
            tags=tags,
        )
        sl = slope_deg(zl, res)
        hs = hillshade(zl, res)
        lm_rel = {}
        for lm in lms:
            r = earth.local_relief(zl, vl, trl, lm["utm_x"], lm["utm_y"], radius)
            lm_rel[lm["name"]] = None if r["relief_m"] is None else round(r["relief_m"], 3)
        base = earth.relief_baseline(zl, vl, trl, radius, 400, seed=20261114)
        vals = [v for v in lm_rel.values() if v is not None]
        level_rows.append(
            {
                "resolution_m": res,
                "label": label,
                "shape": list(zl.shape),
                "valid_fraction": float(vl.mean()),
                "elev_min_m": float(np.nanmin(zl)),
                "elev_max_m": float(np.nanmax(zl)),
                "slope_deg_p50": float(np.nanpercentile(sl, 50)),
                "slope_deg_p95": float(np.nanpercentile(sl, 95)),
                "slope_deg_max": float(np.nanmax(sl)),
                "landmark_relief_m": lm_rel,
                "landmark_relief_median_m": float(np.median(vals)) if vals else None,
                "background_relief_p50_m": float(np.median(base)) if base.size else None,
                "background_relief_p90_m": float(np.percentile(base, 90)) if base.size else None,
            }
        )
        derived.append(
            {
                **d,
                "kind": "dtm_roi" if native else "dtm_roi_simulated_coarsening",
                "resolution_m": res,
                "label": label,
                "source": "ot_ca23_williams",
            }
        )
        markers = []
        for lm in lms:
            cf, rf = ~trl @ (lm["utm_x"], lm["utm_y"])
            markers.append((rf, cf, ""))
        title = (
            "Lava Beds 0.5 m LiDAR DTM hillshade (observed)"
            if native
            else f"SIMULATED COARSENING to {res:g} m (block mean of 0.5 m LiDAR)"
        )
        previews.append(
            gray_png(
                hs,
                PREVIEW_DIR / f"earth_roi_hillshade_{res_tag(res)}.png",
                markers=markers,
                scale_bar=(res, 200),
                title=title,
            )
        )

    # Native-resolution zoom on the bridge cluster for visual review.
    xs = [lm["utm_x"] for lm in lms]
    ys = [lm["utm_y"] for lm in lms]
    pad = 80.0
    zl, _ = levels[ec["native_res_m"]]
    c0, r0 = ~tr @ (min(xs) - pad, max(ys) + pad)
    c1, r1 = ~tr @ (max(xs) + pad, min(ys) - pad)
    r0, r1, c0, c1 = (max(0, int(r0)), min(zl.shape[0], int(r1)), max(0, int(c0)), min(zl.shape[1], int(c1)))
    zoom = hillshade(zl[r0:r1, c0:c1], ec["native_res_m"])
    zm = []
    for lm in lms:
        cf, rf = ~tr @ (lm["utm_x"], lm["utm_y"])
        zm.append((rf - r0, cf - c0, lm["name"]))
    previews.append(
        gray_png(
            zoom,
            PREVIEW_DIR / "earth_bridges_zoom_0p5m.png",
            display_px=1200,
            markers=zm,
            scale_bar=(ec["native_res_m"], 100),
            title="0.5 m LiDAR hillshade, GNIS natural-bridge points (approximate positions)",
        )
    )

    native_row = level_rows[0]
    gate.check(
        "earth:landmarks_rougher_than_background_at_native",
        native_row["landmark_relief_median_m"] > native_row["background_relief_p50_m"],
        f"median relief within {radius:g} m of GNIS bridges {native_row['landmark_relief_median_m']:.2f} m vs "
        f"{native_row['background_relief_p50_m']:.2f} m at 400 seeded random ROI points; "
        f"per landmark: {native_row['landmark_relief_m']}",
    )

    return {
        "dataset": {
            "id": "ot_ca23_williams",
            "role": "earth_reference_1",
            "status": "validated"
            if all(c["passed"] for c in gate.checks if c["name"].startswith("earth:"))
            else "failed",
            "title": "Lidar Survey of Lava Tubes, CA 2023 (bare-earth DTM)",
            "body": "Earth",
            "site": "Lava Beds National Monument, California, USA",
            "product_id": "OTSDEM.102024.32610.1",
            "collection_id": "OT.102024.32610.1",
            "short_name": "CA23_Williams",
            "doi": "10.5069/G9ST7N19",
            "landing_page": "https://portal.opentopography.org/datasetMetadata?otCollectionID=OT.102024.32610.1",
            "producer": "NCALM (National Center for Airborne Laser Mapping); PI Edward Williams, Univ. of Maryland",
            "distributor": "OpenTopography",
            "funding": "NSF EAR-2324629",
            "acquisition": {"date": "2023-09-28"},
            "publication_date": "2024-10-23",
            "license": {"terms": "CC BY 4.0", "terms_url": "https://creativecommons.org/licenses/by/4.0/"},
            "citations": [
                "Williams, E. (2024). Lidar Survey of Lava Tubes, CA 2023. National Center for Airborne Laser Mapping "
                "(NCALM). Distributed by OpenTopography. https://doi.org/10.5069/G9ST7N19. Accessed 2026-11-14",
            ],
            "acknowledgement": "Lidar data acquisition and processing completed by the National Center for Airborne "
            "Laser Mapping (NCALM). NCALM funding provided by NSF's Division of Earth Sciences, "
            "Instrumentation and Facilities Program. EAR-2324629",
            "files": source_files("ot_ca23_williams"),
            "horizontal_reference": {
                "crs": "WGS84 (ITRF2014, epoch 2023.74) / UTM zone 10N",
                "epsg": 32610,
                "crs_wkt": info["crs_wkt"],
            },
            "vertical_reference": {
                "units": "metres",
                "datum": "NAVD88 (GEOID18)",
                "epsg": 5703,
                "basis": "OpenTopography metadata; the GeoTIFF itself carries no vertical CRS.",
            },
            "catalog_metadata": {
                "raster_resolution_m": 0.5,
                "area_km2": 57.44,
                "point_density_per_m2": 21.84,
                "bbox_lonlat": [-121.57188041421496, 41.68693814691719, -121.46215226553198, 41.77291549498684],
            },
            "measured": {"dtm": info, "raster_boundary_area_km2": boundary.area / 1e6},
            "known_limitations": [
                "Surface (bare-earth) LiDAR only: no subsurface tube geometry is measured.",
                "GNIS landmark coordinates are approximate points, not mapped outlines.",
                "Coarsened rasters are simulations derived from this DTM, not observations at those resolutions.",
            ],
        },
        "roi": {
            "id": "earth_lava_beds_cave_loop",
            "dataset": "ot_ca23_williams",
            "name": rc["name"],
            "bounds_utm10n": {"left": roi.left, "bottom": roi.bottom, "right": roi.right, "top": roi.top},
            "size_m": roi.size_m,
            "valid_fraction": float(valid.mean()),
            "landmarks": [
                {
                    k: lm[k]
                    for k in ("name", "gnis_id", "gnis_feature_class", "gnis_url", "lon", "lat", "utm_x", "utm_y")
                }
                for lm in lms
            ],
            "landmark_source": "USGS GNIS via The National Map Gazetteer, scientific/config/" + rc["landmark_file"],
            "landmark_check_radius_m": radius,
            "resolution_levels": level_rows,
            "coarsening": {
                "method": cc["method"],
                "min_valid_fraction": cc["min_valid_fraction"],
                "note": "Integer-factor block mean on the native UTM grid; every level has identical "
                "bounds. Derivatives recomputed per level (Horn 3x3).",
            },
        },
        "derived": derived,
        "previews": previews,
    }


def main() -> int:
    with (CONFIG_DIR / "phase_a.toml").open("rb") as fh:
        cfg = tomllib.load(fh)
    gate = Gate()
    verify_integrity(gate)
    fetch_report = (
        json.loads((RAW_DIR / "fetch_report.json").read_text()) if (RAW_DIR / "fetch_report.json").exists() else None
    )
    if not gate.passed:
        print("source retrieval incomplete; stopping before analysis", file=sys.stderr)
        results = []
    else:
        results = [run_moon(cfg, gate), run_earth(cfg, gate)]

    manifest = {
        "manifest_version": 1,
        "pipeline_version": cfg["pipeline_version"],
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "generator": "scientific/: uv run fetch-sources && uv run fetch-landmarks && uv run phase-a",
        "software": {
            "python": platform.python_version(),
            "rasterio": rasterio.__version__,
            "gdal": rasterio.__gdal_version__,
            "numpy": np.__version__,
            "pyproj": pyproj.__version__,
            "proj": pyproj.proj_version_str,
        },
        "phase_a_gate": {"status": "pass" if gate.passed else "fail", "checks": gate.checks},
        "visual_review": cfg.get("visual_review", []),
        "datasets": [r["dataset"] for r in results],
        "rois": [r["roi"] for r in results],
        "derived_assets": [a for r in results for a in r["derived"]],
        "previews": [{**p, "path": rel(PREVIEW_DIR / p["file"])} for r in results for p in r["previews"]],
        "fetch_report": fetch_report,
        "candidates_not_validated": [
            {
                "site": "Lanzarote / La Corona, Canary Islands, Spain",
                "status": "not_verified",
                "reason": "Out of Phase A scope; exact CNIG MDT02 COG tile not yet located or downloaded.",
            },
            {
                "site": "Harrat Khaybar, Saudi Arabia",
                "status": "not_verified",
                "reason": "Out of Phase A scope; only 12.5 m ALOS-PALSAR-derived DEMs identified; "
                "resolution_insufficient for the 0.5 m coarsening experiment.",
            },
        ],
    }
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    phase_d = DATASETS_DIR / "manifest_phase_d.json"
    if phase_d.exists():  # keep the Phase D record when Phase A is regenerated
        manifest["phase_d"] = json.loads(phase_d.read_text())
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n")
    print(f"gate={'PASS' if gate.passed else 'FAIL'}; wrote {rel(MANIFEST_PATH)}", file=sys.stderr)
    return 0 if gate.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
