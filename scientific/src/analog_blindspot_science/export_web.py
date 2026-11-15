"""Export validated Phase A rasters as static web assets for the 3D slice.

Usage: ``uv run export-web`` (after ``uv run phase-a`` has passed).

The display mesh is a fixed LOD and is independent of the source DTM:

* Moon: the 257 x 257 native 4 m ROI is used as-is (vertex = DTM post). Nodata
  stays NaN so the renderer leaves a hole instead of inventing a pit floor.
* Earth: every resolution variant is area-averaged onto the same 257 x 257
  display grid (7.0 m cells over 1800 m). Shading detail comes from an
  object-space normal map computed from the variant itself, at the variant's own
  resolution (capped at 1 m for the 0.5 m LiDAR: an 1800 px lossless WebP).

Outputs go to ``apps/web/public/data`` and are described by ``sites.json``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rasterio.windows import Window

from .download import sha256_file
from .paths import MANIFEST_PATH, RAW_DIR, REPO_ROOT
from .terrain import _gradients, block_mean

WEB_DATA = REPO_ROOT / "apps" / "web" / "public" / "data"
DISPLAY_N = 257
EARTH_VARIANTS_M = [0.5, 4.0, 10.0, 30.0]
NORMAL_MAX_RES_M = 1.0  # display cap for the normal map of the 0.5 m variant
ASSET_VERSION = "phase-b-1"


def res_tag(res: float) -> str:
    return f"{res:g}m".replace(".", "p")


def normal_map_rgb(z: np.ndarray, cell: float) -> np.ndarray:
    """Object-space normals in scene axes (X east, Y up, Z south) as uint8 RGB."""
    dzdx, dzdsouth = _gradients(z, cell)
    n = np.stack([-dzdx, np.ones_like(dzdx), -dzdsouth], axis=-1)
    bad = ~np.isfinite(n).all(axis=-1)
    n[bad] = (0.0, 1.0, 0.0)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.round((n * 0.5 + 0.5) * 255).astype(np.uint8)


def write_normal_map(z: np.ndarray, cell: float, path: Path) -> dict:
    # Lossless WebP: lossy encoding was tested and shifted normals by up to 88/255.
    Image.fromarray(normal_map_rgb(z, cell), "RGB").save(path, "WEBP", lossless=True, method=6)
    return {"file": path.name, "px": z.shape[1], "m_per_px": cell, "bytes": path.stat().st_size}


def write_heights(z: np.ndarray, path: Path) -> dict:
    a = np.ascontiguousarray(z, dtype="<f4")
    path.write_bytes(a.tobytes())
    return {
        "file": path.name,
        "dtype": "float32-le",
        "rows": a.shape[0],
        "cols": a.shape[1],
        "nodata": "NaN",
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def finite_stats(z: np.ndarray) -> dict:
    v = z[np.isfinite(z)]
    return {"min_m": float(v.min()), "max_m": float(v.max()), "nan_count": int((~np.isfinite(z)).sum())}


def read_masked(path: Path) -> tuple[np.ndarray, Affine, object]:
    with rasterio.open(path) as ds:
        m = ds.read(1, masked=True)
        return m.filled(np.nan).astype(np.float32), ds.transform, ds.crs


def to_display_grid(src: np.ndarray, src_tr: Affine, crs, left: float, top: float, extent: float) -> np.ndarray:
    """Area-average (GDAL 'average', coverage-weighted) onto the fixed display grid."""
    cell = extent / DISPLAY_N
    dst = np.full((DISPLAY_N, DISPLAY_N), np.nan, dtype=np.float32)
    reproject(
        src,
        dst,
        src_transform=src_tr,
        src_crs=crs,
        dst_transform=Affine(cell, 0, left, 0, -cell, top),
        dst_crs=crs,
        resampling=Resampling.average,
        src_nodata=np.nan,
        dst_nodata=np.nan,
    )
    return dst


def provenance(ds: dict) -> dict:
    return {
        "dataset_id": ds["id"],
        "title": ds["title"],
        "product_id": ds["product_id"],
        "doi": ds.get("doi"),
        "landing_page": ds["landing_page"],
        "license": ds["license"]["terms"],
        "credit": ds["license"].get("credit"),
        "citation": ds["citations"][0],
        "citations": ds["citations"],
    }


def export_moon(man: dict, out: Path) -> dict:
    ds = next(d for d in man["datasets"] if d["id"] == "lroc_mariuspit01")
    roi = next(r for r in man["rois"] if r["id"] == "moon_marius_hills_pit")
    asset = next(a for a in man["derived_assets"] if a["source"] == "lroc_mariuspit01" and a["kind"] == "dtm_roi")
    z, tr, _ = read_masked(REPO_ROOT / asset["path"])
    if z.shape != (DISPLAY_N, DISPLAY_N):
        raise ValueError(f"moon ROI {z.shape} != display grid")
    cell = abs(tr.a)
    out.mkdir(parents=True, exist_ok=True)
    heights = write_heights(z, out / "heights.f32")
    normal = write_normal_map(z, cell, out / "normal.webp")

    # Real 4 m orthophoto on the same grid (image, not elevation, data).
    w = roi["window_px"]
    with rasterio.open(RAW_DIR / "lroc_mariuspit01" / "NAC_DTM_MARIUSPIT01_M1274609891_4M.IMG") as o:
        dn = o.read(1, window=Window(w["col_off"], w["row_off"], w["size"], w["size"]))
        refl = np.where(dn != o.nodata, dn * o.scales[0] + o.offsets[0], np.nan)
    v = refl[np.isfinite(refl)]
    lo, hi = np.percentile(v, [1, 99])
    # Pixels with no image data are a flat neutral grey (alpha 0), not black, so they
    # do not read as a shadowed void around the DTM's own no-data gap.
    g = np.clip((refl - lo) / (hi - lo), 0, 1)
    g = np.where(np.isfinite(g), g, 0.42)
    rgba = np.dstack([g, g, g, np.isfinite(refl).astype(float)])
    Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(out / "ortho.png", optimize=True)

    pit = roi["landmark"]
    loc = pit["located"]
    pa = roi["pit_analysis"]
    extent = DISPLAY_N * cell
    return {
        "id": "moon",
        "body": "Moon",
        "name": "Marius Hills Pit",
        "extent_m": extent,
        "crs": "Equirectangular Moon (1737.4 km sphere), map metres",
        "vertical": ds["vertical_reference"]["reference"],
        "provenance": provenance(ds),
        "variants": [
            {
                "id": "4m",
                "resolution_m": 4.0,
                "observed": True,
                "label": "Observed: LROC NAC DTM, native 4 m posts",
                "display": {"grid": DISPLAY_N, "cell_m": cell, "geometry": "native DTM posts (no resampling)"},
                "heights": heights,
                "elevation": finite_stats(z),
                "normal_map": {**normal, "filter": "linear", "basis": "Horn gradients of the 4 m DTM"},
                "derived_from": {"path": asset["path"], "sha256": asset["sha256"]},
            }
        ],
        "drape": {
            "file": "ortho.png",
            "px": DISPLAY_N,
            "m_per_px": cell,
            "label": "LROC NAC orthophoto M1274609891, 4 m version (image data, not elevation)",
        },
        "landmarks": [
            {
                "id": "marius_hills_pit",
                "name": pit["name"],
                "kind": "pit",
                "lat": pit["lat"],
                "lon": pit["lon_east"],
                # local metres from the ROI north-west corner
                "x_m": (loc["col_f"] - w["col_off"]) * cell,
                "y_m": (loc["row_f"] - w["row_off"]) * cell,
                "surface_elev_m": pa["rim_median_elev_m"],
                "source": pit["citation"],
                "notes": [
                    f"Pit interior is nodata in this DTM: {pa['nodata_gap']['extent_ew_m']:.0f} x "
                    f"{pa['nodata_gap']['extent_ns_m']:.0f} m gap. Floor not measured.",
                    f"Valid funnel pixels reach >= {pa['measured_depression_m']:.1f} m below the rim (lower bound).",
                    f"Atlas depth {pit['atlas_depth_m']:g} m is from separate stereo modelling.",
                ],
            }
        ],
        "subsurface": "not measured",
        "facts": {
            "pit_lat": pit["lat"],
            "pit_lon_east": pit["lon_east"],
            "atlas_funnel_diameter_m": pit["funnel_diameter_m"],
            "atlas_inner_diameter_m": pit["inner_diameter_m"],
            "atlas_depth_m": pit["atlas_depth_m"],
            "gap_extent_ew_m": pa["nodata_gap"]["extent_ew_m"],
            "gap_extent_ns_m": pa["nodata_gap"]["extent_ns_m"],
            "gap_equivalent_diameter_m": pa["nodata_gap"]["equivalent_diameter_m"],
            "gap_posts": pa["nodata_gap"]["pixel_count"],
            "depression_lower_bound_m": pa["measured_depression_m"],
            "rim_annulus_m": [55.0, 90.0],
            "lola_tie_rms_m": ds["accuracy"]["lola_tie_rms_m"],
            "socet_precision_m": ds["accuracy"]["socet_precision_m"],
            "product_valid_fraction": ds["measured"]["dtm"]["valid_fraction"],
            "effective_resolution_note": (
                "LROC RDR SIS: NAC DTMs are generated at a minimum of 3 times the native pixel scale of the "
                "input stereo images, so detail finer than a few posts is not resolved."
            ),
        },
    }


def write_thumb(z: np.ndarray, cell: float, path: Path) -> dict:
    """Hillshade (az 315, alt 45) of the observed display grid: a preview, not analysis data."""
    from .terrain import hillshade

    hs = hillshade(z, cell)
    v = hs[np.isfinite(hs)]
    lo, hi = np.percentile(v, [2, 98]) if v.size else (0.0, 1.0)
    g = (np.nan_to_num(np.clip((hs - lo) / max(hi - lo, 1e-6), 0, 1), nan=0.0) * 255).astype(np.uint8)
    Image.fromarray(g, "L").save(path, "WEBP", quality=82, method=6)
    return {"file": path.name, "px": z.shape[1], "basis": "hillshade of the observed display grid (preview only)"}


def export_variants(
    assets: dict,
    b: dict,
    extent: float,
    out: Path,
    resolutions: list[float],
    native_res: float,
    observed_label: str,
    source_phrase: str,
) -> tuple[list[dict], np.ndarray]:
    """Write heights + normal map per resolution onto the shared 257x257 display grid."""
    variants = []
    native = None
    for res in resolutions:
        a = assets[res]
        z, tr, crs = read_masked(REPO_ROOT / a["path"])
        if (tr.c, tr.f) != (b["left"], b["top"]):
            raise ValueError(f"{a['path']} not aligned with ROI")
        vd = out / res_tag(res)
        vd.mkdir(parents=True, exist_ok=True)
        disp = to_display_grid(z, tr, crs, b["left"], b["top"], extent)
        heights = write_heights(disp, vd / "heights.f32")
        if res < NORMAL_MAX_RES_M:
            f = round(NORMAL_MAX_RES_M / res)
            zn, _ = block_mean(np.nan_to_num(z), np.isfinite(z), f, 0.5)
            ncell = NORMAL_MAX_RES_M
        else:
            zn, ncell = z, res
        normal = write_normal_map(zn, ncell, vd / "normal.webp")
        observed = res == native_res
        if observed:
            native = disp
        variants.append(
            {
                "id": res_tag(res),
                "resolution_m": res,
                "observed": observed,
                "label": observed_label
                if observed
                else f"SIMULATED COARSENING to {res:g} m (block mean of {source_phrase}). Not an observation.",
                "display": {
                    "grid": DISPLAY_N,
                    "cell_m": extent / DISPLAY_N,
                    "geometry": f"coverage-weighted average of the {res:g} m grid onto the display grid",
                },
                "heights": heights,
                "elevation": finite_stats(disp),
                "normal_map": {
                    **normal,
                    "filter": "linear" if res < 4 else "nearest",
                    "basis": (
                        f"Horn gradients of the {res:g} m grid"
                        if res >= NORMAL_MAX_RES_M
                        else f"Horn gradients of a 1 m block mean of the {res:g} m DTM (display cap)"
                    ),
                },
                "derived_from": {"path": a["path"], "sha256": a["sha256"]},
            }
        )
    if native is None:
        raise ValueError("no observed variant exported")
    return variants, native


def experiment_block(roi: dict, observed_res: float, bg_points: int, caveat: str, bg_note: str | None = None) -> dict:
    return {
        "measure": f"max - min elevation within {roi['landmark_check_radius_m']:g} m",
        "radius_m": roi["landmark_check_radius_m"],
        "landmark_count": len(roi["landmarks"]),
        "background_points": bg_points,
        "background_note": bg_note or f"{bg_points} reproducible random points (seed 20261114) inside the same ROI",
        "method": "block_mean",
        "levels": [
            {
                "resolution_m": lv["resolution_m"],
                "observed": lv["resolution_m"] == observed_res,
                "landmark_relief_median_m": lv["landmark_relief_median_m"],
                "background_relief_median_m": lv["background_relief_p50_m"],
                "landmark_relief_m": lv.get("landmark_relief_m", {}),
                "background_relief_samples_m": lv.get("background_relief_samples_m", []),
                "background_seed_medians_m": lv.get("background_seed_medians_m", []),
                "slope_deg_p95": lv["slope_deg_p95"],
            }
            for lv in roi["resolution_levels"]
        ],
        "caveat": caveat,
    }


def export_earth(man: dict, out: Path) -> dict:
    ds = next(d for d in man["datasets"] if d["id"] == "ot_ca23_williams")
    roi = next(r for r in man["rois"] if r["id"] == "earth_lava_beds_cave_loop")
    b = roi["bounds_utm10n"]
    extent = b["right"] - b["left"]
    assets = {a["resolution_m"]: a for a in man["derived_assets"] if a["source"] == "ot_ca23_williams"}
    variants, native = export_variants(
        assets,
        b,
        extent,
        out,
        EARTH_VARIANTS_M,
        0.5,
        "Observed: NCALM LiDAR bare-earth DTM, 0.5 m",
        "the 0.5 m LiDAR",
    )
    assert native is not None
    landmarks = []
    for lm in roi["landmarks"]:
        x, y = lm["utm_x"] - b["left"], b["top"] - lm["utm_y"]
        i, j = int(y / (extent / DISPLAY_N)), int(x / (extent / DISPLAY_N))
        landmarks.append(
            {
                "id": f"gnis_{lm['gnis_id']}",
                "name": lm["name"],
                "kind": "natural_bridge",
                "lat": lm["lat"],
                "lon": lm["lon"],
                "x_m": x,
                "y_m": y,
                "surface_elev_m": float(native[i, j]),
                "source": f"USGS GNIS feature {lm['gnis_id']} ({lm['gnis_url']})",
                "notes": ["GNIS point position is approximate (tens of metres)."],
            }
        )
    return {
        "id": "earth",
        "body": "Earth",
        "name": "Lava Beds National Monument, Cave Loop",
        "extent_m": extent,
        "crs": "WGS84 / UTM zone 10N (EPSG:32610)",
        "vertical": "NAVD88 (GEOID18), EPSG:5703",
        "provenance": provenance(ds),
        "variants": variants,
        "drape": None,
        "thumb": write_thumb(native, extent / DISPLAY_N, out / "thumb.webp"),
        "landmarks": landmarks,
        "subsurface": "not measured",
        "experiment": experiment_block(
            roi, 0.5, 400, "Eight approximate point labels; a relief comparison, not a detection-rate benchmark."
        ),
    }


CANDIDATES = [
    {
        "id": "lava_beds",
        "site": "Lava Beds National Monument, California, USA",
        "status": "validated",
        "elevation_product": "NCALM airborne LiDAR bare-earth DTM, 0.5 m (OpenTopography, doi:10.5069/G9ST7N19)",
        "note": "Downloaded and checked pixel by pixel in Phase A. Surface only.",
        "url": "https://portal.opentopography.org/datasetMetadata?otCollectionID=OT.102024.32610.1",
    },
    {
        "id": "lanzarote",
        "site": "Lanzarote / La Corona, Canary Islands, Spain",
        "status": "not_verified",
        "elevation_product": "CNIG PNOA-LiDAR MDT02 (catalog-stated 2 m bare-earth DTM)",
        "note": "Catalog lists coverage, but the tile over the lava-tube surface has not been located or downloaded.",
        "url": "https://centrodedescargas.cnig.es/CentroDescargas/catalogo.do?Serie=MDT02",
    },
    {
        "id": "harrat_khaybar",
        "site": "Harrat Khaybar, Saudi Arabia",
        "status": "not_verified",
        "elevation_product": "ALOS-PALSAR-derived DEM (12.5 m, as used in a published study)",
        "note": "Too coarse for the 0.5 m coarsening experiment; no high-resolution DTM of a tube feature confirmed.",
        "url": "https://www.mdpi.com/2073-445X/12/3/705",
        "lat": 25.5888,
        "lon": 39.7570,
        "point_label": "Umm Jirsan lava tube",
        "point_source": "Published site coordinates (pure.mpg.de item 3332917)",
    },
    {
        "id": "mars_arsia_skylight",
        "site": "Arsia Mons candidate cave entrance, Mars",
        "body": "Mars",
        "status": "not_verified",
        "elevation_product": "HiRISE image PSP_003647_1745 (25 cm/px image, not elevation)",
        "note": "A deep pit seen in a HiRISE image; no public HiRISE terrain model of it was found, so nothing is "
        "measured here. Shown so the Mars question stays visible, not as an analysis.",
        "url": "https://hirise.lpl.arizona.edu/PSP_003647_1745",
        "lat": -5.532,
        "lon": 241.396,
        "point_label": "Image centre, PSP_003647_1745",
        "point_source": "HiRISE observation page (image-centre latitude and east longitude)",
    },
]


LANZAROTE_VARIANTS_M = [2.0, 4.0, 10.0, 30.0]


def export_lanzarote(rec: dict, out: Path) -> dict:
    ds, roi = rec["dataset"], rec["roi"]
    b = roi["bounds"]
    extent = b["right"] - b["left"]
    assets = {a["resolution_m"]: a for a in rec["derived_assets"]}
    variants, native = export_variants(
        assets,
        b,
        extent,
        out,
        LANZAROTE_VARIANTS_M,
        2.0,
        "Observed: CNIG PNOA-LiDAR MDT02 bare-earth DTM, 2 m",
        "the 2 m MDT02",
    )
    cell = extent / DISPLAY_N
    landmarks = []
    for lm in roi["landmarks"]:
        x, y = lm["utm_x"] - b["left"], b["top"] - lm["utm_y"]
        h = native[min(int(y / cell), DISPLAY_N - 1), min(int(x / cell), DISPLAY_N - 1)]
        landmarks.append(
            {
                "id": f"ngbe_{lm['ngbe_id']}",
                "name": lm["name"],
                "kind": "jameo",
                "lat": lm["lat"],
                "lon": lm["lon"],
                "x_m": x,
                "y_m": y,
                "surface_elev_m": float(h) if np.isfinite(h) else float(np.nanmedian(native)),
                "source": f"IGN NGBE feature {lm['ngbe_id']} (https://www.ign.es/web/ign/portal/ide-area-nomenclatura)",
                "notes": ["NGBE point from the 1:25 000 base map; position is approximate."],
            }
        )
    lic = ds["license"]
    return {
        "id": "lanzarote",
        "body": "Earth",
        "name": "Malpaís de La Corona, Lanzarote",
        "extent_m": extent,
        "crs": b["crs"] + " (REGCAN95 / UTM zone 28N)",
        "vertical": ds["vertical_reference"]["heights"],
        "provenance": {
            "dataset_id": ds["id"],
            "title": ds["title"],
            "product_id": ", ".join(f["filename"] for f in ds["files"]),
            "doi": None,
            "landing_page": ds["files"][0]["detail_url"],
            "license": lic["terms"],
            "credit": lic["attribution_derived"],
            "citation": lic["attribution_unmodified"],
            "citations": [lic["attribution_unmodified"], f"Licence: {lic['terms']} ({lic['terms_url']})"],
        },
        "variants": variants,
        "drape": None,
        "thumb": write_thumb(native, extent / DISPLAY_N, out / "thumb.webp"),
        "landmarks": landmarks,
        "subsurface": "not measured",
        "experiment": experiment_block(
            roi,
            2.0,
            roi["resolution_levels"][0]["background_points_used"],
            "Six approximate point labels; a relief comparison, not a detection-rate benchmark.",
            f"{roi['resolution_levels'][0]['background_points_used']} land points (of 400 seeded, seed 20261114) "
            "inside the same ROI; sea surface excluded",
        ),
    }


def lanzarote_candidate(rec: dict | None) -> dict:
    base = {
        "id": "lanzarote",
        "site": "Lanzarote / Malpaís de La Corona, Canary Islands, Spain",
        "url": "https://centrodedescargas.cnig.es/CentroDescargas/catalogo.do?Serie=MDT02",
    }
    if rec and rec["dataset"]["status"] == "validated":
        return {
            **base,
            "status": "validated",
            "elevation_product": "CNIG PNOA-LiDAR MDT02, 2 m ("
            + ", ".join(f["filename"] for f in rec["dataset"]["files"])
            + ")",
            "note": "Downloaded manually and checked pixel by pixel in Phase D. Surface only.",
            "url": rec["dataset"]["files"][0]["detail_url"],
        }
    if rec and rec["dataset"]["status"] == "awaiting_manual_download":
        t = rec["dataset"]["tiles_identified"][0]
        return {
            **base,
            "status": "not_verified",
            "elevation_product": f"CNIG MDT02 tile {t['filename']} (catalog: 2 m, {t['catalog_mb']} MB)",
            "note": "Tile over the jameos located via the CNIG catalogue; awaiting manual download, so no "
            "pixels have been checked.",
            "url": t["detail_url"],
        }
    return {
        **base,
        "status": "not_verified",
        "elevation_product": "CNIG PNOA-LiDAR MDT02 (catalog-stated 2 m bare-earth DTM)",
        "note": "Phase D validation failed or has not been run; see datasets/manifest_phase_d.json.",
    }


PHASE_E_PATH = MANIFEST_PATH.parent / "manifest_phase_e.json"
NASADEM_ID = "nasadem30m"


def search_block(search: dict) -> dict:
    keep = ("spacing_m", "radius_m", "percentile", "match_radius_m", "note")
    return {
        **{k: search[k] for k in keep},
        "levels": [
            {
                k: lv[k]
                for k in (
                    "resolution_m",
                    "observed",
                    "threshold_m",
                    "lattice_points",
                    "flagged_points",
                    "landmarks_recovered",
                    "landmark_count",
                    "random_recovered_fraction",
                    "candidates",
                )
            }
            for lv in search["levels"]
        ],
    }


def add_phase_e(site: dict, pe: dict, out: Path) -> None:
    """Attach the NASADEM reference grid, NASA POWER climate and the lattice search to an Earth site."""
    rec = pe["sites"].get(site["id"])
    if rec is None:
        return
    nd = rec["nasadem_30m"]
    z, tr, crs = read_masked(REPO_ROOT / nd["path"])
    extent = site["extent_m"]
    vd = out / NASADEM_ID
    vd.mkdir(parents=True, exist_ok=True)
    disp = to_display_grid(z, tr, crs, tr.c, tr.f, extent)
    heights = write_heights(disp, vd / "heights.f32")
    normal = write_normal_map(z, abs(tr.a), vd / "normal.webp")
    meta = pe["nasadem"]
    variant = {
        "id": NASADEM_ID,
        "resolution_m": 30.0,
        "observed": False,
        "reference": True,
        "label": "NASA NASADEM, 1 arc-second (about 30 m): an independent radar observation, not a simulation",
        "display": {
            "grid": DISPLAY_N,
            "cell_m": extent / DISPLAY_N,
            "geometry": "NASADEM resampled (bilinear) onto the ROI 30 m grid, then area-averaged to the display grid",
        },
        "heights": heights,
        "elevation": finite_stats(disp),
        "normal_map": {**normal, "filter": "nearest", "basis": "Horn gradients of the 30 m NASADEM grid"},
        "derived_from": {"path": nd["path"], "sha256": nd["sha256"]},
    }
    c = nd["comparison"]
    site["nasa_reference"] = {
        "variant_id": NASADEM_ID,
        "variant": variant,
        "title": meta["title"],
        "product_id": meta["product_id"],
        "tiles": [t["tile"] for t in meta["tiles"]],
        "landing_page": meta["landing_page"],
        "license": meta["license"],
        "citation": meta["citation"],
        "resolution_m": 30.0,
        "vertical": meta["vertical"],
        "comparison": {
            "against_variant_id": res_tag(30.0),
            "rmse_m": c["rmse_m"],
            "bias_m": c["bias_m"],
            "rmse_detrended_m": c["rmse_detrended_m"],
            "pearson_r": c["pearson_r"],
            "cells": c["cells"],
            "note": f"Cell-by-cell over {c['mask']} of the ROI's 30 m grid. The bias includes the datum difference "
            f"(EGM96 geoid vs {site['vertical']}).",
        },
    }
    clim = rec["climate"]
    site["climate"] = {k: clim[k] for k in ("source", "url", "lat", "lon", "t2m_max_c", "t2m_min_c", "period", "note")}
    site["experiment"]["search"] = search_block(rec["search"])


def main() -> int:
    man = json.loads(MANIFEST_PATH.read_text())
    if man["phase_a_gate"]["status"] != "pass":
        print("Phase A gate has not passed; refusing to export web assets.", file=sys.stderr)
        return 1
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    sites = [export_moon(man, WEB_DATA / "moon"), export_earth(man, WEB_DATA / "earth")]
    phase_d = man.get("phase_d")
    if phase_d and phase_d["dataset"]["status"] == "validated":
        sites.append(export_lanzarote(phase_d, WEB_DATA / "lanzarote"))
    if PHASE_E_PATH.exists():
        pe = json.loads(PHASE_E_PATH.read_text())
        if pe["gate"]["status"] == "pass":
            for site in sites:
                if site["body"] == "Earth":
                    add_phase_e(site, pe, WEB_DATA / site["id"])
    candidates = [c if c["id"] != "lanzarote" else lanzarote_candidate(phase_d) for c in CANDIDATES]
    index = {
        "asset_version": ASSET_VERSION,
        "manifest_generated_utc": man["generated_utc"],
        "manifest_sha256": sha256_file(MANIFEST_PATH),
        "axes": "X east, Y up, Z south; local metres from the ROI north-west corner; heights in metres",
        "sites": sites,
        "candidates": candidates,
        "landmark_sources": [
            {
                "site": "moon",
                "source": "LROC Pits Atlas, Marius Hills Pit",
                "url": "https://lroc.im-ldi.com/atlases/pits/1",
            },
            {
                "site": "earth",
                "source": "USGS Geographic Names Information System (GNIS), public domain",
                "url": "https://edits.nationalmap.gov/apps/gaz-domestic/public/search/names",
            },
            {
                "site": "lanzarote",
                "source": "IGN Nomenclátor Geográfico Básico de España (NGBE), CC BY 4.0",
                "url": "https://www.ign.es/wfs-inspire/ngbe",
            },
        ],
    }
    (WEB_DATA / "sites.json").write_text(json.dumps(index, indent=2, allow_nan=False) + "\n")
    total = sum(p.stat().st_size for p in WEB_DATA.rglob("*") if p.is_file())
    print(f"wrote {WEB_DATA.relative_to(REPO_ROOT)} ({total / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
