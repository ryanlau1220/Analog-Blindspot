# Analog Blindspot — Verified Data Research and Kiro CLI Handoff

Research date: 2026-11-14 (Malaysia). Status: source catalogs and metadata verified; **actual downloaded raster pixels, coverage at feature level, and scientific results not yet validated**.

## Mission
Build an immersive, visual-first, five-chapter scientific story centered on Marius Hills Pit (Moon), with terrestrial lava-tube surface analog investigations. The signature interaction is controlled DEM coarsening that makes real mapped surface features less detectable. Make unknown subsurface volume visibly unknown. Avoid SaaS dashboards, fabricated caves, black-box suitability scores, and misleading scientific conclusions.

## Verified authoritative source products

### Moon: required
- LROC Marius Pit DTM `NAC_DTM_MARIUSPIT01`, **4 m/px** (not 2 m); geographic bbox lat 13.40..15.05 N; east lon 303.01..303.46 (0–360 system). Official GeoTIFF ~159.30 MB; associated confidence map, orthophotos 1.10 m/px. Product: https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_MARIUSPIT01 ; overview https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_MARIUSPIT01
- LROC Pits Atlas: actual Marius Hills Pit at lat **14.0917 N**, lon **303.2299 E** (equivalent -56.7701 in -180..180); funnel diameter 79–92 m; approximate depth 40 m. https://lroc.im-ldi.com/atlases/pits/1
- IMPORTANT: separate `NAC_DTM_MARIUS` 2 m/px terrain product spans lon 303.86–304.36, and does **not** contain target pit lon 303.2299. Do not accidentally use it to depict the pit. https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_MARIUS
- Confirm that raster valid-data pixels, not merely bounding box, encompass the pit after download; validate masks and elevations.

### Earth reference 1: required, strongest verified
- **Lava Beds National Monument, CA, USA**, project `Lidar Survey of Lava Tubes, CA 2023`, PI Edward Williams, NSF-supported NCALM, OpenTopography DOI 10.5069/G9ST7N19; raster sampling **0.5 m**; survey extent **57.44 km²**; ~21.84 returns/m²; CC BY 4.0; acquisition 2023-09-28; publication 2024-10-23. Raster data ID `OTSDEM.102024.32610.1`. Site https://portal.opentopography.org/datasetMetadata?otCollectionID=OT.102024.32610.1
- Bbox lat 41.68693814691719..41.77291549498684, lon -121.57188041421496..-121.46215226553198. Horizontal UTM Zone 10N EPSG:32610; vertical NAVD88 GEOID18 EPSG:5703.
- Portal shows dataset/raster download options, but registration/API access and retrieval of *individual raster tiles* have not been tested. Choose a ROI containing documented lava-tube surface features and verify those pixels; do not infer subsurface mapping from surface LiDAR.

### Earth reference 2: candidate, broad coverage confirmed but target tile not retrieved
- **Lanzarote / La Corona volcanic region, Canary Islands, Spain**. Spanish IGN/CNIG PNOA LiDAR second-cycle coverage shows **CAN (Canarias) MDT02 complete**, and MDT02 is **2 m** bare-earth DTM distributed as COG GeoTIFF by MTN25 sheet. Catalog: https://centrodedescargas.cnig.es/CentroDescargas/catalogo.do?Serie=MDT02 ; coverage: https://pnoa.ign.es/pnoa-lidar/segunda-cobertura ; technical: https://pnoa.ign.es/pnoa-lidar/productos-a-descarga
- Coordinate system REGCAN95 / local UTM, orthometric elevations; inspect exact product metadata. CNIG site states CC BY 4.0 terms requiring attribution: https://centrodedescargas.cnig.es/CentroDescargas/home
- **Must locate the specific COG tile covering the chosen La Corona/lava-tube surface feature**, download, and validate it before using this site quantitatively. Do not claim subsurface ground truth without a separate validated source.

### Earth candidate 3: optional, not suited to same high-resolution experiment
- **Harrat Khaybar, Saudi Arabia**. Peer-reviewed published terrain study uses ALOS-PALSAR-derived **12.5 m** DEM of the volcanic field. Article: https://www.mdpi.com/2073-445X/12/3/705 ; possible underlying search/download provider: https://search.asf.alaska.edu/ . A published 2026 supplementary Zenodo record also mentions 12.5 m rasters (but archaeological risk layers are not a terrain DEM substitute): https://zenodo.org/records/20416101
- Full high-res 1–2 m bare-earth coverage of a specific pit/tube feature NOT confirmed. Do not upscale 12.5 m to 1 m and call it high-resolution evidence. An honest candidate with `resolution_insufficient` or `subsurface_unknown` can still work for narrative, if presented accurately.

## Data validation gates — mandatory before declaring data ready
1. Download actual source product or an exact cropped raster for Moon and Lava Beds; check file integrity and provenance.
2. Inspect with rasterio/GDAL: CRS/projection/body, bounds, pixel dimensions, nodata fraction, units, vertical reference, band type, and asset license.
3. Check valid pixels and recognizable feature at selected ROI **inside** actual data footprint, not merely the dataset bbox.
4. Moon geographic longitude likely uses 0..360 and lunar-specific projection; never apply Earth EPSG:4326 assumptions to a lunar raster. For Earth work, reproject to local metric coordinates; preserve elevations and record datum.
5. Choose a fixed ROI and reference landform, store polygon/landmark annotations and citation. Avoid fabricating a feature label.
6. Build real 0.5 m Earth raster downsampling to 2, 4, 10, 30, 60 m (only where sampling is physically meaningful), using an anti-alias/aggregation method; ensure the same spatial extent and metric coordinate system. Recompute terrain derivatives; quantify feature retention only if independent ground-truth labels exist. Use label `simulated coarsening`, NEVER label coarsened Earth raster as a real LROC observation.
7. Do not confuse 1.10 m orthophoto resolution with 4 m lunar elevation model resolution.
8. If terrain data is missing for a candidate, present 'not verified' and show it separately, without simulated precise measurements.

## Proposed story and visualization
1. **Mystery**: visually approach Marius Hills Pit with real topography and one punchy headline.
2. **Blindspot**: reveal surface profile and dark/transparent unmeasured subsurface; never synthesize cave geometry as fact.
3. **Search Earth**: transition to Lava Beds, Lanzarote (if verified), and optional Harrat; candidates are destinations, not dashboard rows.
4. **Resolution Experiment**: high-resolution Lava Beds reference compared against genuine calculated coarsening; track visibly preserved/lost landforms and surface properties. Show original sampling and the simulation setting clearly.
5. **Scientific Decision**: accessible source-backed conclusion, caveats, and one-page printable Field Validation Brief. No unsupported global best-site ranking.

## Technical architecture
- Frontend: React + TypeScript + Vite, pnpm, Three.js + React Three Fiber + Drei, GSAP, Tailwind; Biome and Vitest.
- Scientific scripts: Python managed with uv, rasterio/GDAL, numpy, pytest, Ruff. Preprocess offline; static JSON and optimized 3D assets only at runtime.
- Repo: `apps/web`, `scientific/src`, `scientific/tests`, `datasets/manifest.json`, `docs/science.md`, `docs/storytelling.md`, `pnpm-workspace.yaml`. Lockfiles committed. Raw large rasters ignored from Git.
- Avoid backend/database/agent orchestration/Turborepo until justified. Kiro CLI is coding agent, not a required app feature.
- Three.js cutaway: static side skirts / prebuilt blocks and alpha/clipping; NOT runtime heavy boolean geometry. Render meshes 257x257 samples initially, optimize and lazy-load textures; keep original DEM independent of display LOD. Typed discrete scene states plus cancellable GSAP transitions.

## Acceptance criteria
- Source manifest includes URL, DOI/product ID, acquisition/publication date, pixel spacing, CRS, vertical datum, extent, attribution/license, and derived asset versions.
- A reviewer can click an evidence marker and see the real original data product.
- Spatial degradation output is reproducible from checked-in scripts/config.
- No hidden subsurface geometry is asserted as measured data; no fake rankings/confidence.
- Scene transitions can be played out of order without broken camera state.
- Demo runs from local preprocessed assets without remote API requirements.
- Printable brief lists source limitations and next field measurement, and explicitly distinguishes research hypotheses from conclusions.

## Kiro CLI implementation phases
**Phase A — Scientific gate**: fetch/crop MARIUSPIT01 and Lava Beds DEM, verify ROI, compute metric downsampled raster variants, output provenance manifest and reference PNG samples; add unit tests. STOP if either fails; choose different verified ROI instead of fake geometry.
**Phase B — 3D vertical slice**: real terrain + proper elevation scaling + 4 resolution variants + cutaway visualization; performance smoke test.
**Phase C — narrative**: 5 scenes, animations, evidence cards and guided replay, responsive.
**Phase D — site expansion**: acquire verified Lanzarote exact COG tile, optional Khaybar static profile; no invented metadata.
**Phase E — scientific validation and submission**: compare features and limitations, printable brief, citations, licensing, demos, documentation, test deploy.

### Suggested Kiro prompt
"Read `docs/research/dataset-validation.md` first. Start with Phase A only. Validate real LROC MARIUSPIT01 and NCALM Lava Beds source tiles at pixel level, including CRS, data masks, and selected recognizable features. Write reproducible uv-managed scripts, tests, and `datasets/manifest.json`. Report any inaccessible dataset or absent coverage explicitly. Do not create invented terrain, cave geometry, similarity rankings, or substitute a 2 m Marius DTM that misses the named pit. Once scientific gate passes, implement the 3D vertical slice using pnpm React/R3F and preprocessed assets. Keep cinematic five-scene UX and data provenance requirements in the handoff."

## Source verification limitations
This handoff verifies **publication/catalog metadata and download entrypoints**, NOT byte-level successful retrieval of all elevation data nor validated terrain derivatives. Practical download/clip/test is still an implementation gate. CNIG exact tile unresolved. OpenTopography guest/registration requirements not confirmed. Khaybar precise ROI and high-resolution coverage unresolved.
