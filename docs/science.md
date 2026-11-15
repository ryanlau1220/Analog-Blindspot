# Science notes

This document describes the inputs, analysis and limits behind the current application. The machine-readable records are [Phase A](../datasets/manifest.json), [Phase D](../datasets/manifest_phase_d.json), [Phase E](../datasets/manifest_phase_e.json), and the exported [`sites.json`](../apps/web/public/data/sites.json). These are research and visualization results, not proof of a cave, subsurface geometry or a suitable base site.

## Inputs and provenance

| Input | Role | Scope |
| --- | --- | --- |
| LROC NAC DTM `NAC_DTM_MARIUSPIT01` and 4 m orthophoto | Lunar terrain and surface imagery | 4 m DTM posts at Marius Hills Pit; the pit interior includes missing elevation. |
| NCALM / OpenTopography Lava Beds bare-earth LiDAR | Earth terrain and resolution experiment | 0.5 m observed terrain; eight approximate USGS GNIS natural-bridge point locations. [doi:10.5069/G9ST7N19](https://doi.org/10.5069/G9ST7N19), CC BY 4.0, NSF EAR-2324629. |
| CNIG PNOA-LiDAR MDT02, tile `1080-4` | Lanzarote terrain and resolution experiment | 2 m observed terrain; six approximate IGN NGBE jameo/cave point locations. Attribution: Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es. |
| NASADEM | Independent Earth elevation comparison | 1 arc-second terrain reprojected to the ROIs' 30 m metric grids. [doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001](https://doi.org/10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001). |
| NASA POWER | Earth climate context | MERRA-2-based climatological 2 m air-temperature values for a broad grid cell, not local ground measurements. |
| LRO Diviner Global Cumulative Product | Lunar temperature context | A 0.5° bin, about 15 km across, containing the pit and surroundings; not a measurement inside the pit. [Williams et al. (2017)](https://doi.org/10.1016/j.icarus.2016.08.012). |
| OpenStreetMap cave entrances | Separate proximity check of flagged Earth terrain | Mapped points have incomplete coverage and positional uncertainty; they are not a complete independent cave inventory. [Attribution and ODbL](https://www.openstreetmap.org/copyright). |
| Published Mars candidate sizes | Planetary context | [Cushing et al. (2007)](https://doi.org/10.1029/2007GL030709); no Martian elevation analysis is implemented. |

The source configurations, expected sizes, checksums, exact citations and licences are recorded in `scientific/config/` and the manifests. NASADEM rasters are checked against pinned SHA-256 values, including when an existing cached file is used. The POWER, OpenStreetMap and Diviner inputs used by Phase E are saved in `scientific/config/`.

## Lunar terrain and thermal context

The 257 × 257-post Marius Hills DTM window contains 159 missing posts in the pit interior. They form an approximately 60 × 52 m gap; triangles touching missing posts are omitted rather than filled with an invented floor. Valid wall data reaches at least about 15.8 m below a surrounding rim reference: that is a **lower bound**, not the total pit depth. The cutaway hatching represents unmeasured subsurface; its depth is for display.

The Diviner input records bolometric brightness temperatures from **96.7 K to 392.0 K** across 48 of 96 local-time bins with data in the 0.5° cell. This mixes the pit with its surroundings. The often-cited approximately 17 °C shadowed-cave figure is a published model result for lunar pits, not a measurement of the interior of Marius Hills Pit. Neither result establishes habitability.

## Earth resolution experiment

The pipeline crops observed elevation data, then block-averages it onto coarser grids. At each named point and at seeded random background positions, local relief is the maximum minus minimum elevation within 30 m. Grid cells with too few samples for that measure are reported as **not measurable**, not as negative detections. Lanzarote's background applies a land filter so flat sea pixels do not dominate it.

| Site and grid | Named-point median relief | Sampled background median |
| --- | ---: | ---: |
| Lava Beds, 0.5 m observed | 8.4 m | 5.9 m |
| Lava Beds, 4 m simulated | 7.4 m | 5.3 m |
| Lava Beds, 10 m simulated | 4.3 m | 4.7 m |
| Lanzarote, 2 m observed | 15.4 m | 5.1 m |
| Lanzarote, 4 m simulated | 14.8 m | 4.8 m |
| Lanzarote, 10 m simulated | 13.0 m | 4.3 m |

These are point-group statistics, not feature outlines or a detection-rate benchmark. Landmark positions are approximate. Background seed ranges describe sensitivity to sampling and are not confidence intervals. A coarsened grid is a simulation: grid spacing is not the effective resolution of a planetary instrument, and block averaging is not an LROC or HiRISE sensor model.

For rendering, Earth variants use a common 257 × 257 display mesh, with shading derived from each grid. This is a visualization of terrain and grid effects, not a claim that every original source cell is a displayed mesh vertex. Vertical exaggeration is labelled in the app.

## Lattice search and featured lead

The search computes the same 30 m-radius local relief on a **30 m lattice** and flags points above the region's **95th percentile**. At observed Lava Beds resolution, the recorded result is 3,364 lattice locations, 169 flagged points and 24 unverified clusters away from named gazetteer points. The app exports a subset of candidate clusters rather than displaying all 24 individually.

The featured lead is the observed-grid candidate at ROI coordinates **x = 1,395 m, y = 915 m**, with **17.51 m** of relief inside the 30 m radius. Its recorded cluster contains 19 lattice cells. Coordinates identify the candidate in the ROI, not a surveyed cave entrance. The cyan marker and camera use that selection. The candidate is not flagged as being near a holdout entrance in the recorded results.

The separate OpenStreetMap check places **5 of 16** mapped Lava Beds cave entrances within **45 m** of a flagged point; about **15%** of 400 seeded random positions meet the same proximity criterion. This is a preliminary reference check, not a cave detector's precision or recall. Points are approximate, OpenStreetMap coverage is incomplete, and high relief can come from roads, scarps, cliffs or spoil heaps. Inspect independent imagery and conduct an appropriate field survey before interpreting any lead as a geological feature.

## NASADEM comparison

The Phase E pipeline compares the independently observed NASADEM terrain with the simulated 30 m Earth grids over the same ROIs. The recorded results are:

| Site | Pearson r | RMSE after mean-offset removal |
| --- | ---: | ---: |
| Lava Beds | 0.9984 | 1.49 m |
| Lanzarote | 0.9986 | 2.07 m |

These numbers describe overall cell-level elevation agreement; broad topography can dominate correlation. They do **not** demonstrate that block averaging and a real instrument preserve or lose individual cave-related features in the same way. NASADEM is a separate observation, not a simulation.

## Reproduction

Run from the repository root. Python 3.12+, `uv`, disk space and the large source rasters are required; raw inputs and derived GeoTIFFs are Git-ignored. Downloaded data may be subject to source terms and availability.

```bash
cd scientific
uv sync --locked
uv run fetch-sources        # LROC + OpenTopography; checks configured sizes and SHA-256
uv run fetch-landmarks      # USGS GNIS points
uv run fetch-landmarks-es   # IGN NGBE points
uv run phase-a              # validate Moon and Lava Beds; write manifest.json
```

For Lanzarote, obtain CNIG tile `MDT02-REGCAN95-HU28-1080-4-COB2.TIF` from the [CNIG download centre](https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=10325475), complete its interactive licence/download process, and place it in `datasets/raw/cnig_mdt02_lanzarote/` using that exact filename. The optional `1080-2` tile is not required for the configured ROI. See [`phase_d.toml`](../scientific/config/phase_d.toml) for the recorded product and attribution. The downloaded file is tagged EPSG:25828 although its name/catalogue identifies REGCAN95; the pipeline records the discrepancy.

```bash
uv run phase-d              # validate Lanzarote; write manifest_phase_d.json
uv run phase-e              # NASADEM, climate, search, OSM and Diviner; write manifest_phase_e.json
uv run export-web           # write apps/web/public/data/
uv run pytest               # data-dependent tests require the raw sources
```

Phase E downloads missing NASADEM tiles and verifies their pinned hashes. It normally uses the saved POWER, OpenStreetMap and Diviner inputs; `uv run phase-e --refresh` requests fresh versions of those inputs and can change the analysis results. A complete first run is therefore not fully offline unless all required raw files are already present. `uv run --locked pytest -q -m 'not data'` runs the scientific tests used by CI without the ignored large rasters.

## Further limits

Lava Beds and Lanzarote are established analog sites selected for different research questions, not newly discovered sites or proof of a lunar match. Harrat Khaybar remains an unverified candidate without a processed terrain profile. Earth gravity, atmosphere and thermal environment differ from the Moon and Mars. The app does not verify field access, cave stability, radiation shielding, underground connectivity or habitability. See the manifests and application evidence drawer for detailed checks, uncertainties and citations.
