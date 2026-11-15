# Analog Blindspot

A five-chapter, visual-first story about what orbital terrain models measure at Marius Hills Pit (Moon), and how
relief around known surface features changes as Earth terrain grids are coarsened. The terrain comparisons use checked elevation products and explicitly labelled simulated coarsening.
Published planetary context and climatology are separately attributed. Nothing in it shows subsurface geometry as measured.

**Decision:** use Lava Beds to investigate smaller surface clues, and Lanzarote to investigate larger collapse
features. These are known sites chosen for different test questions, not newly discovered analogs or proven lunar
matches. The statistics compare median local relief at named points with a sampled background; they do not measure
detection rates. Field access and subsurface correspondence remain unverified.

- **Moon:** LROC NAC DTM `NAC_DTM_MARIUSPIT01` (4 m). The pit interior has no elevation data and is shown as a
  hole.
- **Earth 1:** Lava Beds, California, NCALM airborne LiDAR (0.5 m), doi:10.5069/G9ST7N19.
- **Earth 2:** Lanzarote, Malpaís de La Corona, CNIG PNOA-LiDAR MDT02 (2 m), tile 1080-4.
- **Not verified:** Harrat Khaybar (shown only as a candidate, with no measurements).

## What the prototype does

Follow the lunar pit from an orbital image to the gap in the elevation model, examine two established
Earth analog sites, predict a sampled relief comparison, and choose a field investigation. A lattice
search highlights unverified relief anomalies and compares proximity to named points and a separate
OpenStreetMap entrance set. These are leads for further checking, not newly validated analog sites.
The printable brief and evidence drawer document sources, methods, and uncertainty.

Earth LiDAR is block-averaged to simulate coarser grids. A difference between sampled landmark and
background medians is **not** a detection rate, a resolution requirement, or proof of lunar or
Martian subsurface geometry. NASADEM is a separate real observation, not a simulated grid.
Diviner's 0.5° bin describes the pit's surroundings, not its interior; Mars grid comparisons are
context, not an analysis of Martian terrain or a validated base recommendation. Field access,
candidate anomalies, and underground correspondence still require investigation.

## Run

```sh
pnpm install
pnpm dev            # http://localhost:5173  (#scene=<id> deep links, #brief = printable brief)
pnpm build          # static site in apps/web/dist; BASE_PATH=/sub/ pnpm build for subpath hosting
```

The app reads only `apps/web/public/data` (committed) and makes no remote API calls at runtime.
The optional ambient soundtrack is synthesized locally, starts only when the sound control is selected, and
stops when the tab is hidden or the experience is closed. The story remains usable without audio.

## Cloudflare deployment

This is a static-only Cloudflare Worker; no Worker code or backend is required. The GitHub Actions workflow
`.github/workflows/ci-deploy.yml` validates pull requests and pushes to `main`, and deploys a validated `main`
commit to Cloudflare. It also supports manual runs on `main`. The workflow runs a desktop and mobile browser
smoke test, scientific tests that do not require the ignored raw rasters, and compares key production files to
the validated build after deploying. A stale run skips deployment if a newer commit is already on `main`.

Configure the repository's **Settings → Secrets and variables → Actions → Repository secrets**:

- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the Worker.
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to that account with the **Edit Cloudflare Workers**
  template. Never commit the token or paste it into an issue.

Use `.node-version` and the `packageManager` field for the tested Node and pnpm versions. Leave `BASE_PATH` unset
for the production domain root. To verify locally without deploying, run `pnpm install --frozen-lockfile`,
`pnpm test`, `pnpm check`, `pnpm build`, `pnpm --filter web smoke` (requires Chrome), and
`pnpm exec wrangler deploy --dry-run`. Do not also enable automatic Cloudflare Git builds for this Worker unless
you deliberately want two deployment systems.

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
uv run phase-e              # NASADEM, climate, lattice search, OSM hold-out and Diviner -> manifest_phase_e.json
                            # add --refresh to refetch POWER, OSM and Diviner inputs
uv run export-web           # -> apps/web/public/data
uv run pytest
```

## Docs

- `docs/science.md`: terrain validation, measured values, methods and limitations.
- `datasets/manifest_phase_e.json`: NASADEM, climate, search and hold-out results.
- `docs/storytelling.md`: chapters, interaction rules, the printable brief.
- `datasets/manifest.json`: provenance, licences, checksums and gate results.

## Credits and licences

- LROC data: NASA/GSFC/Arizona State University, public domain (PDS).
- Lava Beds LiDAR: Williams, E. (2024), NCALM / OpenTopography, CC BY 4.0, NSF EAR-2324629.
- Lanzarote: Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es.
- Gazetteers: USGS GNIS (public domain); IGN NGBE (CC BY 4.0); LROC Pits Atlas.
- OpenStreetMap contributors: cave entrance points, ODbL. NASA POWER, NASADEM and LRO Diviner: NASA data; see the evidence drawer and Phase E manifest for provenance.

### Presentation controls

- **Try scroll journey** pins the 3D stage while native scrolling advances through the five chapters.
  Chapter buttons, Previous/Next, deep links, and the guided tour remain available. Turn it off to orbit
  and zoom the terrain manually. Touch scrolling works over the terrain on mobile.
- In **Resolution**, select **Focus experiment** to clear the headline and supporting copy from the stage.
  **Reveal the difference** sweeps the existing observed/simulated split across the same ground in 3.6 seconds.
  Stop it at any time or drag the split yourself; arrow keys adjust the split without changing chapter.
  The sweep never interpolates scientific measurements or generates intermediate resolutions.
- **Enable sound** (♪ on narrow screens) starts the original synthesized ambience at 35% volume.
  The volume slider appears while playing. Sound stops when the tab is hidden; it never autoplays.
  The higher register and richer harmonics are intended to be more audible on small speakers.
- Reduced-motion preferences replace the sweep with a static midpoint comparison and disable spatial
  presentation transitions. All results remain accessible without motion or audio.
- **How this experiment works** expands the four-step data-to-decision explanation and scientific limitations.

Suggested judging sequence: lunar question → blindspot → Earth candidates → focused resolution reveal →
field decision and validation brief. The application still makes no claim to have measured the subsurface
or validated a new lunar/Mars base location.
