# Science notes: Phase A data gate

Status (2026-11-14): **gate passed** for the two required datasets. Machine-readable record:
[`datasets/manifest.json`](../datasets/manifest.json). Lanzarote and Harrat Khaybar were not checked in Phase A
and are listed as `not_verified`.

## Reproduce

```sh
cd scientific
uv sync
uv run fetch-sources     # ~1.08 GB into datasets/raw (git-ignored), size + SHA-256 checked
uv run fetch-landmarks   # USGS GNIS query -> scientific/config/landmarks/lava_beds_gnis.geojson
uv run phase-a           # checks, derived GeoTIFFs, previews, manifest; non-zero exit on any failed check
uv run pytest            # unit tests + checks on the real data (skipped if raw data is absent)
```

Configuration lives in `scientific/config/sources.toml` (URLs, expected byte sizes) and
`scientific/config/phase_a.toml` (ROIs, thresholds, coarsening targets, visual-review notes).

## Downloads

All 8 source files downloaded on the first attempt. None failed. Each file has a `.download.json` sidecar with
the URL, the final URL after redirect, ETag, byte size and SHA-256.

| Dataset | File | Bytes |
|---|---|---|
| LROC NAC_DTM_MARIUSPIT01 v1.9 | DTM GeoTIFF, PDS3 label, README, confidence map (IMG), 4 m orthophoto M1274609891 (IMG) | 167,037,299 (DTM) |
| OpenTopography OTSDEM.102024.32610.1 | bare-earth COG `LAVA_GEG_50C_COG.tif`, raster boundary GeoJSON, NCALM survey report PDF | 781,152,145 (DTM) |

The OpenTopography raster came from the public bucket `opentopography.s3.sdsc.edu/raster/CA23_Williams/`
without registration.

## Moon: Marius Hills Pit in MARIUSPIT01

What the pixels show:
- CRS: lunar Equirectangular (1737.4 km sphere, standard parallel 14° N, central meridian 180°). No Earth EPSG
  code is involved. Spacing is 4.000 m, grid is 3331 × 12529 px, nodata is −3.4028e38, and the DTM is float32 in metres.
- Valid data covers 449.9 km², which is 67.4 % of the raster rectangle. The footprint is a slanted stereo strip,
  so the bounding box overstates coverage.
- The Pits Atlas point (14.0917° N, 303.2299° E) falls on pixel row 7262.11, col 1649.55. pyproj and the PDS3
  label equations agree to within 1.5e-9 px. The RDR SIS prints the line equation with the opposite sign for L0;
  the form used here is the one that places MAXIMUM_LATITUDE on the top image edge (covered by a test).
- In the 257 × 257 px ROI (1028 m), 99.76 % of pixels are valid. The 159 invalid pixels form a single gap
  measuring 60 × 52 m (equivalent diameter 56.9 m). The gap contains the atlas point and matches the atlas inner
  diameter of 49–55 m. The confidence map labels these pixels 0 (nodata).
- **The DTM does not measure the pit floor.** Valid funnel-wall pixels drop at least 15.8 m below the median
  of the 55–90 m rim annulus, which is a lower bound. The atlas depth of 40 m comes from separate stereo
  modelling and is not reproduced by these pixels. Nothing has been interpolated into the gap.
- The 4 m orthophoto has its own 64 × 64 m nodata block over the pit.
- Elevations in the ROI run from −1587 to −1529 m. They are treated as heights relative to the 1737.4 km sphere,
  which is the LROC convention. The label does not state this explicitly.

Do not use `NAC_DTM_MARIUS` (2 m). It covers 303.86–304.36° E and does not contain the pit.

## Earth: Lava Beds, Cave Loop natural bridges

- CRS is EPSG:32610 and spacing is 0.5 m. The raster is 20009 × 20009 px with nodata −9999. The vertical datum,
  NAVD88 (GEOID18), comes from OpenTopography metadata; it is not embedded in the GeoTIFF.
- Valid pixels cover 57.45 km². The catalog states 57.44 km², and the published boundary polygon is 57.44 km².
- The ROI spans 1800 m × 1800 m, UTM 622680–624480 E and 4617300–4619100 N. It is snapped to a 60 m grid,
  and 100 % of its pixels are valid.
- Landmarks are eight GNIS "Arch" features (named lava-tube natural bridges). They come from the USGS GNIS
  gazetteer and are independent of the LiDAR: Garden, Hopkins, Chocolate, Sentinel, Venetian, Brushy, Natural and
  Ovis Bridge. All eight fall on valid pixels. Their positions are approximate, within tens of metres of the
  visible features.
- Visual review at 0.5 m shows a sinuous collapse trench and collapse pits next to the GNIS points. Paved roads
  are also visible. Review notes are in `phase_a.toml` → `visual_review`.

### Simulated coarsening (block mean, identical extent at every level)

Relief is the maximum minus the minimum elevation within 30 m of each point. Background is the same measure at
400 seeded random points in the ROI.

| Grid | Landmark relief, median | Background relief, median | Slope p95 |
|---|---|---|---|
| 0.5 m (observed) | 8.44 m | 5.91 m | 25.1° |
| 2 m (simulated) | 7.90 m | 5.66 m | 19.4° |
| 4 m (simulated) | 7.42 m | 5.30 m | 15.4° |
| 10 m (simulated) | 4.27 m | 4.70 m | 10.8° |
| 30 m (simulated) | not measurable (too few cells) | n/a | 7.4° |
| 60 m (simulated) | not measurable | n/a | 6.6° |

From 10 m onward, the bridge points no longer stand out from the background on this measure, and the trench
cannot be seen in the 30 m preview. This result describes a relief statistic at eight point labels. It is not a
detection-rate benchmark: there are no mapped outline labels.

## Caveats carried forward
- None of these products measure subsurface void geometry, on the Moon or on Earth.
- Coarsened Earth rasters are simulations and must never be labelled as LROC or any other observation.
- The 1.10 m LROC orthophotos give image resolution, not elevation resolution.

# Phase B: 3D vertical slice

## Run

```sh
cd scientific && uv run export-web    # validated rasters -> apps/web/public/data (5.4 MB, committed)
cd .. && pnpm install
pnpm dev                              # http://localhost:5173
pnpm test && pnpm check               # Vitest, Biome, tsc
pnpm build && pnpm perf               # headless-Chrome performance smoke test
```

`export-web` refuses to run unless the Phase A gate passed. The app makes no remote API calls; all terrain comes
from `public/data`.

## How the terrain is displayed

- **Moon:** the mesh is the 257 × 257 native 4 m DTM window. Each vertex is one DTM post, with no resampling.
  Every triangle that touches the 159 nodata posts is dropped, so the pit interior is a visible hole, not an
  invented floor. An optional drape shows the real 4 m orthophoto.
- **Earth:** four variants are available: 0.5 m (observed), and 4, 10 and 30 m (labelled `SIMULATED COARSENING`
  everywhere in the UI and data). Each variant is area-averaged onto the same 257 × 257 display grid
  (7.0 m cells). Shading comes from an object-space normal map computed from that variant at its own resolution.
  For the 0.5 m variant the normal map is capped at 1 m/px. Coarse variants use nearest filtering, so 30 m cells
  appear as cells. Normal maps use lossless WebP; lossy encoding was tested and rejected because it shifted
  normals by up to 88/255.
- All variants of a site share one datum, so switching variants never shifts the surface vertically. Vertical
  exaggeration (×1/×2/×4) is always shown on screen, and ×1 is true scale.
- **Cutaway:** an east–west clipping plane cuts the static block. A cap generated from the measured surface
  profile closes the cut, and that profile is drawn in yellow. Everything below the surface (cap, walls, floor)
  uses one hatched "not measured" material, and the block depth is labelled as display-only. Nodata along the
  section line stays a gap. No subsurface or cave geometry exists in the scene.
- **Markers:** markers show the Pits Atlas point (placed at the rim median, since the pit has no data) and the
  eight GNIS bridges. Clicking a marker opens the location source and the original elevation product.

## Performance smoke test (2026-11-14, this machine)

There is no GPU here. Chrome fell back to SwiftShader (software), so frame rates are only a floor:

- Each frame draws about 133k triangles at 1280 × 800. Software rendering gave 2.2–4.2 fps.
- A variant was ready 0.5–2.9 s after it was requested.
- 5.38 MB of data was transferred in total.
- A burst of out-of-order actions ended in the correct state, with no console or page errors.

The script requires 30 fps when it detects a hardware GPU and 2 fps on software rendering. **Hardware-GPU frame
rate has not been measured yet.** The report and screenshots are written to `apps/web/perf-results/`
(git-ignored).

# Phase D: site expansion

Status (2026-11-14): **Lanzarote is blocked on a manual download.** The exact tile is identified and the
validation pipeline is ready, but no Lanzarote pixels have been checked yet. **Harrat Khaybar was not
attempted.**

## Lanzarote / Malpaís de La Corona

**Landmarks.** `uv run fetch-landmarks-es` queries the IGN Nomenclátor Geográfico Básico de España (NGBE)
INSPIRE WFS for the La Corona area. It keeps the six point features named as jameos or caves: Jameo de la
Gente, Jameo Redondo, Jameo Cumplido, Jameo de Puerta Falsa, Cueva de los Verdes and Jameos del Agua. A geodetic
vertex that is also called "Jameos del Agua" and the area name "Jameos de Arriba" are excluded. The positions
come from the 1:25 000 BTN25 base map and are approximate. The output is
`scientific/config/landmarks/lanzarote_ngbe.geojson`, which is committed.

**Tiles.** I queried the CNIG download centre catalogue (`archivosSerie`, MDT02 2nd coverage) at each landmark
point:

| File | CNIG id | Catalogue size | Year | Covers |
|---|---|---|---|---|
| `MDT02-REGCAN95-HU28-1080-4-COB2.TIF` | 10325475 | 72.01 MB | 2015 | all six landmarks (required) |
| `MDT02-REGCAN95-HU28-1080-2-COB2.TIF` | 10325533 | 58.92 MB | 2015 | western three (optional) |

The CNIG detail page states: COG format, 2 m, REGCAN95 with UTM in the Canary Islands, orthometric heights, one
file per MTN25 sheet. The licence is Orden FOM/2807/2015, which is compatible with CC BY 4.0. For derived
products the required attribution is "Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es". The download
page does not name the geoid model, so the manifest leaves it unstated.

**Why the download is manual.** CNIG's direct download runs through reCAPTCHA and then an interactive licence
step. I did not script around either. National WCS services were checked as an alternative.
`servicios.idee.es/wcs-inspire/mdt` serves 5 m at its finest, which is not the MDT02 product. GRAFCAN's WCS
paths returned 404.

**To finish Lanzarote:**

1. Open https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=10325475 in a browser, accept the
   licence and download the file.
2. Put it, under its original name, in `datasets/raw/cnig_mdt02_lanzarote/`. Add `1080-2` (sec=10325533) only
   if the gate asks for it.
3. Run `cd scientific && uv run phase-d && uv run export-web`, then `pnpm perf`.

**What `uv run phase-d` checks once the file is present:**

- **Integrity:** byte size against the catalogue MB, then SHA-256, recorded in an `.ingest.json` sidecar.
- **Projection and grid:** CRS is REGCAN95 / UTM 28N (EPSG:4083) and pixel spacing is 2 m.
- **Coverage:** valid-pixel fraction per tile, and at least 90 % valid in the 3 km ROI (its east edge
  approaches the coast).
- **Landmarks:** all six NGBE points fall on valid pixels.
- **Relief:** relief within 30 m of the jameos is greater than at 400 seeded random points. This is the same
  measure used at Lava Beds.
- **Outputs:** simulated coarsening to 4, 10, 30 and 60 m, derived GeoTIFFs tagged `SIMULATED`, and hillshade
  previews.

Tiles are mosaicked only if their grids are aligned, so nothing is resampled. Results go to
`datasets/manifest_phase_d.json` and are also embedded in `datasets/manifest.json` under `phase_d`. Phase A
keeps that key when it regenerates the manifest.

If the gate passes, `export-web` adds a third site (2 m observed; 4, 10 and 30 m simulated) to the viewer, and
the chapter-3 card switches to "data verified". Until then the card names the identified tile and says it is
awaiting download. The validation branch is covered by `tests/test_phase_d.py`, which uses a synthetic tile in a
temporary directory only. A version of that tile without depressions must fail the relief check, and it does.

## Harrat Khaybar (optional, not attempted)

The handoff's source is a 12.5 m ALOS-PALSAR-derived DEM from ASF Vertex, and that download needs a NASA
Earthdata login. At 12.5 m it cannot support the 0.5 m coarsening experiment anyway (`resolution_insufficient`).
It stays in the app as "not verified" with no profile. A substitute such as the 30 m Copernicus DEM would be a
different product (a surface model, not a terrain model, and coarser), so I did not use one without agreement.
