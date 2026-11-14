"""Fetch named lava-tube surface features at Malpaís de La Corona (Lanzarote)
from the IGN Nomenclátor Geográfico Básico de España (NGBE) INSPIRE WFS.

"Jameo" is the local term for a collapse opening into a lava tube; NGBE records
Jameos del Agua, several other jameos and Cueva de los Verdes as point features
("Elemento puntual del paisaje"). They are independent of the LiDAR. Positions
come from the 1:25 000 BTN25 base map, so treat them as approximate (tens of m).

Usage: ``uv run fetch-landmarks-es``. Writes ``config/landmarks/lanzarote_ngbe.geojson``.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime

import requests

from .paths import CONFIG_DIR

SERVICE = "https://www.ign.es/wfs-inspire/ngbe"
# lat_min, lon_min, lat_max, lon_max in EPSG:4258 axis order
BBOX = (29.120, -13.500, 29.200, -13.400)
KEEP = re.compile(r"^(Jameo|Jameos|Cueva)\b")
# Excludes the geodetic vertex named "Jameos del Agua" and area names ("Paraje") such as Jameos de Arriba.
KEEP_TYPE = "Elemento puntual del paisaje"

FEATURE_RE = re.compile(
    r'gml:id="ES\.IGN\.NGBE\.(\d+)".*?<gml:pos>([-\d.]+) ([-\d.]+)</gml:pos>.*?'
    r"<gn:localType>.*?>([^<]+)</gmd:LocalisedCharacterString>.*?"
    r"<gn:sourceOfName>([^<]*)</gn:sourceOfName>.*?<gn:text>([^<]+)</gn:text>",
    re.S,
)


def params() -> dict[str, str]:
    return {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "gn:NamedPlace",
        "count": "1000",
        "BBOX": ",".join(f"{v:.3f}" for v in BBOX) + ",urn:ogc:def:crs:EPSG::4258",
    }


def parse(xml: str) -> list[dict]:
    out = []
    for fid, lat, lon, local_type, src, name in FEATURE_RE.findall(xml):
        out.append(
            {
                "id": fid,
                "lat": float(lat),
                "lon": float(lon),
                "type": local_type.strip(),
                "source_of_name": src,
                "name": name.strip(),
            }
        )
    return out


def main() -> int:
    r = requests.get(
        SERVICE,
        params=params(),
        timeout=180,
        headers={"User-Agent": "analog-blindspot-science/0.1 (scientific data validation)"},
    )
    r.raise_for_status()
    places = parse(r.text)
    keep = sorted((p for p in places if KEEP.match(p["name"]) and p["type"] == KEEP_TYPE), key=lambda p: p["lon"])
    feats = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
            "properties": {
                "name": p["name"],
                "ngbe_id": p["id"],
                "ngbe_local_type": p["type"],
                "source_of_name": p["source_of_name"],
                "ngbe_uri": f"https://www.ign.es/wfs-inspire/ngbe?service=WFS&version=2.0.0&request=GetFeatureById"
                f"&storedquery_id=urn:ogc:def:query:OGC-WFS::GetFeatureById&ID=ES.IGN.NGBE.{p['id']}",
            },
        }
        for p in keep
    ]
    out = {
        "type": "FeatureCollection",
        "source": {
            "name": "IGN Nomenclátor Geográfico Básico de España (NGBE), INSPIRE WFS",
            "service": SERVICE,
            "query": params(),
            "crs": "EPSG:4258",
            "license": "CC BY 4.0 (IGN / scne.es)",
            "retrieved_utc": datetime.now(UTC).isoformat(timespec="seconds"),
            "selection": f"type {KEEP_TYPE!r} and name matching {KEEP.pattern!r}, of {len(places)} places in the bbox",
            "positional_note": "Points from the 1:25 000 BTN25 base map; approximate, not LiDAR-derived.",
        },
        "features": feats,
    }
    dest = CONFIG_DIR / "landmarks" / "lanzarote_ngbe.geojson"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(feats)} of {len(places)} NGBE places to {dest}")
    for f in feats:
        print("  ", f["properties"]["name"], f["geometry"]["coordinates"])
    return 0 if feats else 1


if __name__ == "__main__":
    raise SystemExit(main())
