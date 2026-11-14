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
