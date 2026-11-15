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

4. **Hold-out validation** of the search against an independent label set: cave
   entrances mapped in OpenStreetMap (``natural=cave_entrance``, ODbL). Entrances
   within ``MATCH_RADIUS_M`` of a gazetteer point are dropped, so the remaining
   ones were never used to define or tune anything. We report how many hold-out
   entrances lie near a flagged point (against chance) and how many unverified
   candidate clusters lie near a hold-out entrance. OSM positions are volunteered
   and approximate; this is still point recovery, not outline-level detection.
5. **Diviner** Global Cumulative Product (LRO-L-DLRE-5-GCP-V1.0): the 0.5 degree
   bin containing Marius Hills Pit, all 96 local-time bins, read with an HTTP
   range request from the fixed-width table. The bin is about 15 km across, so it
   describes the surroundings of the pit, not the pit itself.

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
NASADEM_SHA256 = {
    "n41w122": "30e750b1fe9f964034a628c12caae1d0310e01781f615d97e20f9b2f0d78350e",
    "n29w014": "396329b8a96f3ff7d9b8e627b3582c234ff7270af515698c7f48e87e1909c88c",
}
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_FILE = CONFIG_DIR / "landmarks" / "osm_cave_entrances.geojson"
DIVINER_GCP_URL = (
    "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/"
    "global_cumul_avg_cyl_10n20n_002.tab"
)
DIVINER_FILE = CONFIG_DIR / "diviner" / "gcp_marius_hills_bin.tab"
GCP_ROW_BYTES = 113
GCP_LAT0, GCP_NLAT, GCP_NTIME = 10.25, 20, 96  # this file: 10-20 N, 0.5 degree bins, 0.25 h local time
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


def search_level(z, valid, tr, landmarks, radius, land_filter, observed, holdout=None) -> dict:
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
            "holdout_count": len(holdout or []),
            "holdout_recovered": 0,
            "candidates_near_holdout": 0,
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
    ho = holdout or []
    ho_xy = np.array([(h["x"], h["y"]) for h in ho]).reshape(-1, 2)

    def near_holdout(x: float, y: float) -> bool:
        return bool(len(ho_xy) and (np.hypot(ho_xy[:, 0] - x, ho_xy[:, 1] - y) <= MATCH_RADIUS_M).any())

    for c in cands:
        c["near_holdout_entrance"] = near_holdout(c["x_m"] + tr.c, tr.f - c["y_m"])
    return {
        **base,
        "threshold_m": round(thr, 3),
        "flagged_points": int(flag.sum()),
        "landmarks_recovered": int(recovered),
        "random_recovered_fraction": None if rnd_frac is None else round(rnd_frac, 4),
        "random_points": len(rnd),
        "candidate_clusters": len(cands),
        "candidates": cands[:MAX_CANDIDATES],
        "holdout_count": len(ho),
        "holdout_recovered": int(sum(near_flag(p) for p in ho_xy)),
        "candidates_near_holdout": int(sum(c["near_holdout_entrance"] for c in cands)),
    }


def roi_lonlat(b: dict) -> tuple[float, float, float, float]:
    from pyproj import Transformer

    t = Transformer.from_crs(b["crs"], "EPSG:4326", always_xy=True)
    lo0, la0 = t.transform(b["left"], b["bottom"])
    lo1, la1 = t.transform(b["right"], b["top"])
    return la0, lo0, la1, lo1


def fetch_osm(bboxes: dict[str, tuple[float, float, float, float]], refresh: bool) -> dict:
    """OSM cave entrances inside each ROI (committed so the analysis is reproducible offline)."""
    if refresh or not OSM_FILE.exists():
        parts = "".join(
            f'node["natural"="cave_entrance"]({a:.5f},{b:.5f},{c:.5f},{d:.5f});' for a, b, c, d in bboxes.values()
        )
        q = f"[out:json][timeout:60];({parts});out body;"
        r = requests.post(
            OVERPASS_URL,
            data={"data": q},
            headers={"User-Agent": "analog-blindspot-science/0.1 (research)", "Accept": "application/json"},
            timeout=90,
        )
        r.raise_for_status()
        feats = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [e["lon"], e["lat"]]},
                "properties": {"osm_id": e["id"], "name": e.get("tags", {}).get("name")},
            }
            for e in sorted(r.json()["elements"], key=lambda e: e["id"])
        ]
        OSM_FILE.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "source": {
                        "name": "OpenStreetMap natural=cave_entrance (Overpass API)",
                        "query": q,
                        "license": "ODbL 1.0, (c) OpenStreetMap contributors",
                        "retrieved_utc": datetime.now(UTC).isoformat(timespec="seconds"),
                        "positional_note": "Volunteered, approximate positions; not from the LiDAR or gazetteers.",
                    },
                    "features": feats,
                },
                indent=1,
            )
            + "\n"
        )
    return json.loads(OSM_FILE.read_text())


def holdout_points(osm: dict, crs: str, tr: Affine, shape: tuple[int, int], landmarks: list[dict]) -> list[dict]:
    """OSM entrances inside the ROI and farther than MATCH_RADIUS_M from every gazetteer point."""
    lm = np.array([(m["utm_x"], m["utm_y"]) for m in landmarks])
    left, top = tr.c, tr.f
    right, bottom = left + shape[1] * tr.a, top + shape[0] * tr.e
    out = []
    for f in osm["features"]:
        lon, lat = f["geometry"]["coordinates"]
        x, y = earth.to_utm(lon, lat, crs)
        if not (left <= x <= right and bottom <= y <= top):
            continue
        if (np.hypot(lm[:, 0] - x, lm[:, 1] - y) <= MATCH_RADIUS_M).any():
            continue
        out.append({"osm_id": f["properties"]["osm_id"], "name": f["properties"]["name"], "x": x, "y": y})
    return out


def fetch_diviner(lat: float, lon_east: float, refresh: bool) -> dict:
    """The GCP bin containing (lat, lon) over all local times, via an HTTP range request."""
    lon = ((lon_east + 180) % 360) - 180
    lon_i = int(np.floor((lon + 180) / 0.5))
    lat_i = int(np.floor((lat - (GCP_LAT0 - 0.25)) / 0.5))
    first = (lon_i * GCP_NLAT + lat_i) * GCP_NTIME + 1  # +1 header row
    rng = (first * GCP_ROW_BYTES, (first + GCP_NTIME) * GCP_ROW_BYTES - 1)
    if refresh or not DIVINER_FILE.exists():
        r = requests.get(DIVINER_GCP_URL, headers={"Range": f"bytes={rng[0]}-{rng[1]}"}, timeout=60)
        if r.status_code != 206:
            raise RuntimeError(f"Diviner GCP range request returned HTTP {r.status_code}")
        DIVINER_FILE.parent.mkdir(parents=True, exist_ok=True)
        DIVINER_FILE.write_bytes(r.content)
    rows = [[float(v) for v in ln.split(",")] for ln in DIVINER_FILE.read_text().splitlines() if ln.strip()]
    clon, clat = rows[0][0], rows[0][1]
    if abs(clon - lon) > 0.25 or abs(clat - lat) > 0.25 or len(rows) != GCP_NTIME:
        raise RuntimeError(f"Diviner bin ({clon}, {clat}) does not contain ({lon}, {lat})")
    tb = [(row[2], row[10]) for row in rows if row[10] > 0]
    temps = [t for _, t in tb]
    return {
        "product": "LRO-L-DLRE-5-GCP-V1.0, GLOBAL_CUMUL_AVG_CYL_10N20N_002",
        "url": DIVINER_GCP_URL,
        "byte_range": list(rng),
        "file": str(DIVINER_FILE.relative_to(REPO_ROOT)),
        "sha256": sha256_file(DIVINER_FILE),
        "bin_center_lat": clat,
        "bin_center_lon": clon,
        "bin_size_deg": 0.5,
        "local_time_bins_with_data": len(tb),
        "tbol_max_k": round(max(temps), 1),
        "tbol_min_k": round(min(temps), 1),
        "tbol_max_local_time_h": next(t for t, v in tb if v == max(temps)),
        "citation": "Paige, D. A. et al. (2017). LRO DLRE Level 5 GCP V1.0. NASA Planetary Data System. "
        "Williams, J.-P. et al. (2017). Icarus 283, 300-325. doi:10.1016/j.icarus.2016.08.012",
        "note": "Bolometric brightness temperature binned at 0.5 degree (about 15 km) and 0.25 h of local time "
        "from nadir observations 2009-2015; it averages the pit with its surroundings.",
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
    ap.add_argument("--refresh", action="store_true", help="re-fetch NASA POWER, OSM and Diviner inputs")
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
    bounds = {site: site_inputs(man, site)[0] for site in SITES}
    osm = fetch_osm({k: roi_lonlat(b) for k, b in bounds.items()}, args.refresh)
    result["osm_cave_entrances"] = {
        "file": str(OSM_FILE.relative_to(REPO_ROOT)),
        "sha256": sha256_file(OSM_FILE),
        **{k: osm["source"][k] for k in ("name", "license", "retrieved_utc", "positional_note")},
    }
    pit = next(r for r in man["rois"] if r["id"] == "moon_marius_hills_pit")["landmark"]
    result["diviner"] = fetch_diviner(pit["lat"], pit["lon_east"], args.refresh)
    for site, cfg in SITES.items():
        b, landmarks, radius, assets = site_inputs(man, site)
        tile = cfg["tile"]
        dest = RAW_DIR / "nasadem" / f"NASADEM_HGT_{tile}.tif"
        rec = fetch(NASADEM_URL.format(tile=tile), dest, expected_size=NASADEM_SIZES[tile])
        checks.append(
            {
                "id": f"{site}:nasadem_sha256_pinned",
                "passed": rec.sha256 == NASADEM_SHA256[tile],
                "detail": rec.sha256,
            }
        )
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
        ho = holdout_points(osm, b["crs"], tr30, sim30.shape, landmarks)
        levels = []
        for res in cfg["levels"]:
            z, valid, tr, _ = read(assets[res])
            levels.append(search_level(z, valid, tr, landmarks, radius, cfg["land_filter"], res == cfg["observed"], ho))
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
            "holdout": [
                {"osm_id": h["osm_id"], "name": h["name"], "x_m": h["x"] - tr30.c, "y_m": tr30.f - h["y"]} for h in ho
            ],
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
                f"{lv['landmark_count']} chance={lv['random_recovered_fraction']} candidates={len(lv['candidates'])} "
                f"holdout {lv['holdout_recovered']}/{lv['holdout_count']} near={lv['candidates_near_holdout']}"
            )
        print(f"  climate {s['climate']['t2m_min_c']} .. {s['climate']['t2m_max_c']} C ({s['climate']['period']})")
    dv = result["diviner"]
    print(f"diviner bin ({dv['bin_center_lat']}, {dv['bin_center_lon']}): {dv['tbol_min_k']}..{dv['tbol_max_k']} K")
    print(f"wrote {OUT.relative_to(REPO_ROOT)}; gate {result['gate']['status']}")
    return 0 if result["gate"]["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
