# Analog Blindspot

A five-chapter, visual-first story about what orbital terrain models measure at Marius Hills Pit (Moon), and how
how relief around known surface features changes as Earth terrain grids are coarsened. Every number shown comes from
real, checked elevation data. Nothing in it shows subsurface geometry as measured.

**Decision:** use Lava Beds to investigate smaller surface clues, and Lanzarote to investigate larger collapse
features. These are known sites chosen for different test questions, not newly discovered analogs or proven lunar
matches. The statistics compare median local relief at named points with a sampled background; they do not measure
detection rates. Field access and subsurface correspondence remain unverified.

- **Moon:** LROC NAC DTM `NAC_DTM_MARIUSPIT01` (4 m). The pit interior has no elevation data and is shown as a
  hole.
- **Earth 1:** Lava Beds, California, NCALM airborne LiDAR (0.5 m), doi:10.5069/G9ST7N19.
- **Earth 2:** Lanzarote, Malpaís de La Corona, CNIG PNOA-LiDAR MDT02 (2 m), tile 1080-4.
- **Not verified:** Harrat Khaybar (shown only as a candidate, with no measurements).

## Run

```sh
pnpm install
pnpm dev            # http://localhost:5173  (#scene=<id> deep links, #brief = printable brief)
pnpm build          # static site in apps/web/dist; BASE_PATH=/sub/ pnpm build for subpath hosting
```

The app reads only `apps/web/public/data` (9.4 MB, committed) and makes no remote API calls at runtime.

## Rebuild the data

```sh
cd scientific
uv sync
uv run fetch-sources        # LROC + OpenTopography products, size and SHA-256 checked (~1.1 GB, git-ignored)
uv run fetch-landmarks      # USGS GNIS (Lava Beds)
uv run fetch-landmarks-es   # IGN NGBE (Lanzarote)
uv run phase-a              # Moon + Lava Beds gate -> datasets/manifest.json
# Lanzarote tile: manual browser download (CNIG uses reCAPTCHA), see docs/science.md
uv run phase-d              # Lanzarote gate -> datasets/manifest_phase_d.json
uv run export-web           # -> apps/web/public/data
uv run pytest
```

## Docs

- `docs/science.md`: data validation (Phases A, B and D), measured values, limitations.
- `docs/storytelling.md`: chapters, interaction rules, the printable brief.
- `docs/judging.md`: demo script, evidence, and submission checklist.
- `datasets/manifest.json`: provenance, licences, checksums and gate results.

## Credits and licences

- LROC data: NASA/GSFC/Arizona State University, public domain (PDS).
- Lava Beds LiDAR: Williams, E. (2024), NCALM / OpenTopography, CC BY 4.0, NSF EAR-2324629.
- Lanzarote: Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es.
- Gazetteers: USGS GNIS (public domain); IGN NGBE (CC BY 4.0); LROC Pits Atlas.
