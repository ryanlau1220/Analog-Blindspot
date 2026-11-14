"""Fetch named lava-tube surface features for Lava Beds from USGS GNIS.

GNIS feature class "Arch" inside Lava Beds National Monument holds the named
natural bridges, which are remnant lava-tube roof spans between collapse
trenches. These are independent of the LiDAR (they predate it), so they can be
used as point labels. GNIS coordinates are approximate (often rounded to whole
arc-seconds, roughly 25-30 m), which the landmark check must tolerate.

Usage: ``uv run fetch-landmarks``. Writes ``config/landmarks/lava_beds_gnis.geojson``.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import requests

from .paths import CONFIG_DIR

SERVICE = "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/5/query"
# Bounding box of OT.102024.32610.1 as published on the OpenTopography metadata page.
BBOX = (-121.57188041421496, 41.68693814691719, -121.46215226553198, 41.77291549498684)


def query_params() -> dict[str, str]:
    return {
        "geometry": ",".join(f"{v:.8f}" for v in BBOX),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "gaz_id,gaz_name,gaz_featureclass,county_name,state_alpha",
        "orderByFields": "gaz_id",
        "f": "json",
    }


def main() -> int:
    resp = requests.get(SERVICE, params=query_params(), timeout=120)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"GNIS query failed: {data['error']}")
    features = []
    for f in data["features"]:
        a = f["attributes"]
        lon, lat = f["geometry"]["points"][0]
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]},
                "properties": {
                    "name": a["gaz_name"],
                    "gnis_feature_class": a["gaz_featureclass"],
                    "gnis_id": a["gaz_id"],
                    "gnis_url": f"https://edits.nationalmap.gov/apps/gaz-domestic/public/summary/{a['gaz_id']}",
                    "county": a["county_name"],
                    "state": a["state_alpha"],
                },
            }
        )
    out = {
        "type": "FeatureCollection",
        "source": {
            "name": "USGS Geographic Names Information System (GNIS), The National Map Gazetteer",
            "service": SERVICE,
            "query": query_params(),
            "license": "Public domain (U.S. Government work)",
            "retrieved_utc": datetime.now(UTC).isoformat(timespec="seconds"),
            "positional_note": "GNIS points are approximate; they are not LiDAR-derived.",
        },
        "features": features,
    }
    dest = CONFIG_DIR / "landmarks" / "lava_beds_gnis.geojson"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {len(features)} GNIS landform features to {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
