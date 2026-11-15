"""Phase E: NASA Earth data and a systematic relief search for the Earth sites.

Usage: ``uv run phase-e`` (after ``phase-a`` and ``phase-d``), then ``uv run export-web``.

1. **NASADEM** (NASA SRTM reprocessing, 1 arc-second). The 1 x 1 degree tiles over
   Lava Beds and La Corona are fetched from the OpenTopography public bucket,
   size and SHA-256 recorded, and reprojected (bilinear) onto each ROI's own 30 m
   metric grid. That gives a real 30 m observation by a different instrument, which
   is compared cell by cell with the 30 m grid *simulated* by block-averaging the
   LiDAR. It is never mixed into the simulated series.
2. **NASA POWER** climatology (MERRA-2 based) at each site's first gazetteer point:
   the annual maximum and minimum 2 m air temperature. The JSON
   response is committed under ``config/nasa_power`` so the export is reproducible
   offline; ``--refresh`` fetches it again.
3. **Anomaly search**: the same relief measure as the point experiment (max - min
   elevation within the check radius) on a regular lattice across the whole ROI.
   Lattice points above the lattice's own 95th percentile are flagged. We report
   how many gazetteer points lie within ``MATCH_RADIUS_M`` of a flagged point,
   the same fraction for seeded random positions (chance level), and the flagged
   clusters that are *not* near a gazetteer point as unverified candidates. This
   is gazetteer-point recovery, not a detection benchmark: no mapped outlines
   exist, and relief anomalies include roads, scarps and coastal cliffs.

Writes ``datasets/manifest_phase_e.json``.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime

import numpy as np
import rasterio
import requests
from affine import Affine
from rasterio.enums import Resampling
from rasterio.warp import reproject

from . import earth
from .download import fetch, sha256_file
from .paths import CONFIG_DIR, DATASETS_DIR, MANIFEST_PATH, RAW_DIR, REPO_ROOT

OUT = DATASETS_DIR / "manifest_phase_e.json"
NASADEM_URL = "https://opentopography.s3.sdsc.edu/raster/NASADEM/NASADEM_be/NASADEM_HGT_{tile}.tif"
# Content-Length observed on 2026-11-15; a different file aborts the download.
NASADEM_SIZES = {"n41w122": 11909285, "n29w014": 867773}
POWER_URL = (
    "https://power.larc.nasa.gov/api/temporal/climatology/point"
    "?parameters=T2M_MAX,T2M_MIN&community=RE&longitude={lon}&latitude={lat}&format=JSON"
)
SPACING_M = 30.0
PERCENTILE = 95.0
MATCH_RADIUS_M = 45.0
MAX_CANDIDATES = 10
RANDOM_POINTS = 400
RANDOM_SEED = 20261114
LAND_MIN_ELEV_M = 1.0

SITES = {
    "earth": {
        "tile": "n41w122",
        "levels": [0.5, 4.0, 10.0, 30.0],
        "observed": 0.5,
        "land_filter": False,
    },
    "lanzarote": {
        "tile": "n29w014",
        "levels": [2.0, 4.0, 10.0, 30.0],
        "observed": 2.0,
        "land_filter": True,
    },
}


def site_inputs(man: dict, site: str) -> tuple[dict, list[dict], float, dict[float, str]]:
    """(bounds incl. crs, landmarks, radius, {resolution: derived path})."""
    if site == "earth":
        roi = next(r for r in man["rois"] if r["id"] == "earth_lava_beds_cave_loop")
        b = {**roi["bounds_utm10n"], "crs": "EPSG:32610"}
        assets = {a["resolution_m"]: a["path"] for a in man["derived_assets"] if a["source"] == "ot_ca23_williams"}
        return b, roi["landmarks"], roi["landmark_check_radius_m"], assets
    rec = man["phase_d"]
    roi = rec["roi"]
    assets = {a["resolution_m"]: a["path"] for a in rec["derived_assets"]}
    return roi["bounds"], roi["landmarks"], roi["landmark_check_radius_m"], assets


def read(path: str) -> tuple[np.ndarray, np.ndarray, Affine, object]:
    with rasterio.open(REPO_ROOT / path) as ds:
        m = ds.read(1, masked=True)
        z = m.filled(np.nan).astype(np.float32)
        return z, np.isfinite(z), ds.transform, ds.crs


def nasadem_on_grid(tile_path, shape: tuple[int, int], tr: Affine, crs) -> np.ndarray:
    dst = np.full(shape, np.nan, dtype=np.float32)
    with rasterio.open(tile_path) as src:
        a = src.read(1).astype(np.float32)
        a[a == src.nodata] = np.nan
        reproject(
            a,
            dst,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=tr,
            dst_crs=crs,
            resampling=Resampling.bilinear,
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )
    return dst


def compare(ref: np.ndarray, sim: np.ndarray, mask: np.ndarray) -> dict:
    ok = mask & np.isfinite(ref) & np.isfinite(sim)
    d = (ref - sim)[ok].astype(np.float64)
    a, b = ref[ok].astype(np.float64), sim[ok].astype(np.float64)
    return {
        "cells": int(ok.sum()),
        "bias_m": float(d.mean()),
        "rmse_m": float(np.sqrt((d**2).mean())),
        "rmse_detrended_m": float(np.sqrt(((d - d.mean()) ** 2).mean())),
        "pearson_r": float(np.corrcoef(a, b)[0, 1]),
    }


def lattice(tr: Affine, shape: tuple[int, int], radius: float) -> list[tuple[float, float]]:
    """Lattice point centres every SPACING_M, at least ``radius`` inside the ROI."""
    left, top = tr.c, tr.f
    width, height = shape[1] * tr.a, shape[0] * -tr.e
    xs = np.arange(left + radius + SPACING_M / 2, left + width - radius, SPACING_M)
    ys = np.arange(top - radius - SPACING_M / 2, top - height + radius, -SPACING_M)
    return [(float(x), float(y)) for y in ys for x in xs]


def random_positions(tr: Affine, shape: tuple[int, int], radius: float) -> np.ndarray:
    rng = np.random.default_rng(RANDOM_SEED)
    left, top = tr.c, tr.f
    width, height = shape[1] * tr.a, shape[0] * -tr.e
    x = rng.uniform(left + radius, left + width - radius, RANDOM_POINTS)
    y = rng.uniform(top - height + radius, top - radius, RANDOM_POINTS)
    return np.stack([x, y], axis=1)


def clusters(flag_xy: np.ndarray, relief: np.ndarray) -> list[dict]:
    """8-connected clusters on the lattice; peak position and relief of each."""
    n = len(flag_xy)
    seen = np.zeros(n, bool)
    out = []
    for i in range(n):
        if seen[i]:
            continue
        stack, members = [i], []
        seen[i] = True
        while stack:
            k = stack.pop()
            members.append(k)
            near = np.where(~seen & (np.abs(flag_xy - flag_xy[k]).max(axis=1) <= SPACING_M * 1.01))[0]
            seen[near] = True
            stack.extend(near.tolist())
        top = max(members, key=lambda k: relief[k])
        out.append({"members": members, "x": flag_xy[top, 0], "y": flag_xy[top, 1], "relief": relief[top]})
    return out


def search_level(z, valid, tr, landmarks, radius, land_filter, observed) -> dict:
    if land_filter:
        valid = valid & (np.nan_to_num(z, nan=-1e9) > LAND_MIN_ELEV_M)
    pts = lattice(tr, z.shape, radius)
    rel, xy = [], []
    for x, y in pts:
        lr = earth.local_relief(z, valid, tr, x, y, radius)
        if lr["relief_m"] is None:
            continue
        if land_filter and (lr["valid_fraction"] or 0.0) < 0.9:
            continue
        rel.append(lr["relief_m"])
        xy.append((x, y))
    res = float(tr.a)
    lm_xy = np.array([(lm["utm_x"], lm["utm_y"]) for lm in landmarks])
    base = {
        "resolution_m": res,
        "observed": observed,
        "lattice_points": len(rel),
        "landmark_count": len(landmarks),
    }
    if len(rel) < 50:
        return {
            **base,
            "threshold_m": None,
            "flagged_points": 0,
            "landmarks_recovered": 0,
            "random_recovered_fraction": None,
            "candidates": [],
            "not_measurable": f"radius {radius:g} m covers fewer than {earth.MIN_RELIEF_CELLS} cells at {res:g} m",
        }
    rel_a, xy_a = np.array(rel), np.array(xy)
    thr = float(np.percentile(rel_a, PERCENTILE))
    flag = rel_a > thr
    fxy, frel = xy_a[flag], rel_a[flag]

    def near_flag(p: np.ndarray) -> bool:
        return bool((np.hypot(*(fxy - p).T) <= MATCH_RADIUS_M).any())

    recovered = sum(near_flag(p) for p in lm_xy)
    rnd = random_positions(tr, z.shape, radius)
    if land_filter:
        keep = [earth.point_in_valid(valid, tr, x, y) for x, y in rnd]
        rnd = rnd[np.array(keep)]
    rnd_frac = float(np.mean([near_flag(p) for p in rnd])) if len(rnd) else None
    cands = []
    for c in clusters(fxy, frel):
        cxy = fxy[c["members"]]
        d_lm = np.hypot(cxy[:, None, 0] - lm_xy[None, :, 0], cxy[:, None, 1] - lm_xy[None, :, 1])
        if (d_lm <= MATCH_RADIUS_M).any():
            continue
        cands.append(
            {
                "x_m": float(c["x"] - tr.c),
                "y_m": float(tr.f - c["y"]),
                "relief_m": round(float(c["relief"]), 2),
                "cells": len(c["members"]),
            }
        )
    cands.sort(key=lambda c: -c["relief_m"])
    return {
        **base,
        "threshold_m": round(thr, 3),
        "flagged_points": int(flag.sum()),
        "landmarks_recovered": int(recovered),
        "random_recovered_fraction": None if rnd_frac is None else round(rnd_frac, 4),
        "random_points": len(rnd),
        "candidate_clusters": len(cands),
        "candidates": cands[:MAX_CANDIDATES],
    }


def fetch_power(site: str, lat: float, lon: float, refresh: bool) -> dict:
    path = CONFIG_DIR / "nasa_power" / f"{site}.json"
    url = POWER_URL.format(lat=round(lat, 4), lon=round(lon, 4))
    if refresh or not path.exists():
        r = requests.get(url, timeout=50)
        r.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(r.json(), indent=1) + "\n")
    data = json.loads(path.read_text())
    p = data["properties"]["parameter"]
    rng = data.get("header", {}).get("range", "")
    period = rng[rng.find("(") + 1 : rng.find(")")] if "(" in rng else rng
    return {
        "source": "NASA POWER climatology API (MERRA-2 based), T2M_MAX and T2M_MIN, annual values",
        "url": url,
        "file": str(path.relative_to(REPO_ROOT)),
        "sha256": sha256_file(path),
        "lat": data["geometry"]["coordinates"][1],
        "lon": data["geometry"]["coordinates"][0],
        "t2m_max_c": p["T2M_MAX"]["ANN"],
        "t2m_min_c": p["T2M_MIN"]["ANN"],
        "period": period,
        "note": "Highest and lowest 2 m air temperature in the POWER climatology for the grid cell (about 0.5 degree, "
        "MERRA-2 reanalysis), not the ground surface at the feature.",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-fetch NASA POWER climatology")
    args = ap.parse_args(argv)
    man = json.loads(MANIFEST_PATH.read_text())
    if man["phase_a_gate"]["status"] != "pass":
        print("Phase A gate has not passed.", file=sys.stderr)
        return 1
    phase_d = json.loads((DATASETS_DIR / "manifest_phase_d.json").read_text())
    man = {**man, "phase_d": phase_d}
    result: dict = {
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "pipeline_version": "phase-e-1",
        "nasadem": {
            "title": "NASADEM Merged DEM Global 1 arc second V001",
            "product_id": "NASADEM_HGT.001",
            "landing_page": "https://lpdaac.usgs.gov/products/nasadem_hgtv001/",
            "mirror": "OpenTopography public bucket (opentopography.s3.sdsc.edu/raster/NASADEM/NASADEM_be)",
            "license": "NASA data, no restrictions on reuse (LP DAAC data use policy)",
            "citation": "NASA JPL (2020). NASADEM Merged DEM Global 1 arc second V001. NASA EOSDIS Land Processes "
            "DAAC. doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001",
            "vertical": "EGM96 geoid (NASADEM_HGT)",
            "tiles": [],
        },
        "sites": {},
    }
    checks = []
    for site, cfg in SITES.items():
        _bounds, landmarks, radius, assets = site_inputs(man, site)
        tile = cfg["tile"]
        dest = RAW_DIR / "nasadem" / f"NASADEM_HGT_{tile}.tif"
        rec = fetch(NASADEM_URL.format(tile=tile), dest, expected_size=NASADEM_SIZES[tile])
        result["nasadem"]["tiles"].append(
            {
                "tile": tile,
                "url": rec.url,
                "bytes": rec.size_bytes,
                "sha256": rec.sha256,
                "path": str(dest.relative_to(REPO_ROOT)),
            }
        )
        sim30, v30, tr30, crs = read(assets[30.0])
        ref = nasadem_on_grid(dest, sim30.shape, tr30, crs)
        mask = v30 & (np.nan_to_num(sim30, nan=-1e9) > LAND_MIN_ELEV_M if cfg["land_filter"] else True)
        cmp = compare(ref, sim30, mask)
        out_tif = DATASETS_DIR / "derived" / site / f"{'lavabeds' if site == 'earth' else site}_roi_nasadem_30m.tif"
        with rasterio.open(
            out_tif,
            "w",
            driver="GTiff",
            height=ref.shape[0],
            width=ref.shape[1],
            count=1,
            dtype="float32",
            crs=crs,
            transform=tr30,
            nodata=np.nan,
            compress="deflate",
        ) as ds:
            ds.write(ref, 1)
        checks.append(
            {
                "id": f"{site}:nasadem_covers_roi",
                "passed": bool(np.isfinite(ref).all()),
                "detail": f"{int(np.isfinite(ref).sum())}/{ref.size} cells",
            }
        )
        levels = []
        for res in cfg["levels"]:
            z, valid, tr, _ = read(assets[res])
            levels.append(search_level(z, valid, tr, landmarks, radius, cfg["land_filter"], res == cfg["observed"]))
        lm0 = landmarks[0]
        result["sites"][site] = {
            "nasadem_30m": {
                "path": str(out_tif.relative_to(REPO_ROOT)),
                "sha256": sha256_file(out_tif),
                "resampling": "bilinear from 1 arc-second geographic onto the ROI's 30 m metric grid",
                "comparison": {
                    "against": f"simulated 30 m block mean ({assets[30.0]})",
                    "mask": "land cells above 1 m" if cfg["land_filter"] else "all cells",
                    **cmp,
                },
            },
            "climate": fetch_power(site, lm0["lat"], lm0["lon"], args.refresh),
            "search": {
                "spacing_m": SPACING_M,
                "radius_m": radius,
                "percentile": PERCENTILE,
                "match_radius_m": MATCH_RADIUS_M,
                "random_seed": RANDOM_SEED,
                "note": (
                    f"Relief within {radius:g} m on a {SPACING_M:g} m lattice across the ROI; points above the "
                    f"lattice's {PERCENTILE:g}th percentile are flagged. Recovery = gazetteer points within "
                    f"{MATCH_RADIUS_M:g} m of a flagged point; chance = the same for {RANDOM_POINTS} seeded random "
                    "positions. Unverified candidates may be roads, scarps, cliffs or spoil heaps."
                ),
                "levels": levels,
            },
        }
    result["gate"] = {"status": "pass" if all(c["passed"] for c in checks) else "fail", "checks": checks}
    OUT.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    for site, s in result["sites"].items():
        c = s["nasadem_30m"]["comparison"]
        print(
            f"{site}: NASADEM vs simulated 30 m: r={c['pearson_r']:.4f} rmse={c['rmse_m']:.2f} bias={c['bias_m']:.2f}"
        )
        for lv in s["search"]["levels"]:
            print(
                f"  {lv['resolution_m']:g} m: thr={lv['threshold_m']} recovered {lv['landmarks_recovered']}/"
                f"{lv['landmark_count']} chance={lv['random_recovered_fraction']} candidates={len(lv['candidates'])}"
            )
        print(f"  climate {s['climate']['t2m_min_c']} .. {s['climate']['t2m_max_c']} C ({s['climate']['period']})")
    print(f"wrote {OUT.relative_to(REPO_ROOT)}; gate {result['gate']['status']}")
    return 0 if result["gate"]["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
