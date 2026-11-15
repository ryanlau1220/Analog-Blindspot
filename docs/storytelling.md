# Storytelling (Phase C)

The app opens in **story mode**: five chapters drive the 3D scene. **Explore** switches to free controls, and
**Back to the story** returns. Chapters can be linked directly with `#scene=<id>`.

| # | id | Scene | Steps (guided replay) |
|---|---|---|---|
| 1 | `mystery` | Moon overview, then close to the pit, ×1 | 2 |
| 2 | `blindspot` | East–west section through the pit, ×2, camera facing the cut | 1 |
| 3 | `search` | Lava Beds 0.5 m overview ×1, then bridges ×2; candidate sites card | 2 |
| 4 | `experiment` | Bridges ×2: 0.5 m, then simulated 4, 10 and 30 m; relief table | 4 |
| 5 | `decision` | Pit with orthophoto; supported / hypothesis / limits / next measurements | 1 |

## Rules the code enforces

- **Numbers come from data, not prose.** Scene text and cards read `sites.json` (`facts`, `experiment`,
  `candidates`), which `uv run export-web` writes from `datasets/manifest.json`. The 4 m / 10 m threshold in
  chapters 4 and 5 is computed by `lossResolution` / `lastVisibleResolution`, not typed in.
- **Chapters are deterministic.** Each chapter's first step pins every scene field, and steps apply cumulatively,
  so a chapter looks the same whether it is reached by replay, arrows, a dot or a deep link (tested).
- **Visual vocabulary** (Phase C; see the redesign colours below). The section profile line, yellow in Phase C and cyan now, is the measured surface. Grey hatching means below the surface,
  not measured. Magenta cross-hatch means no elevation data (the pit interior). A green badge means observed
  data; a magenta badge means `SIMULATED COARSENING`.
- **Unverified sites stay unverified.** Lanzarote and Harrat Khaybar appear in chapter 3 with dashed borders,
  the catalog-stated product and why they are not verified. They have no measurements and no 3D scene.
- Chapter 5 keeps "supported by the data" separate from "hypothesis, not tested here".

## Interaction

- Replay auto-advances on each step's timer and stops at chapter 5. Any pointer-down on the scene, or choosing
  a grid in the experiment table, pauses it.
- Keys: ← / → move between steps and chapters; Space plays or pauses.
- Camera moves are GSAP tweens that are killed and restarted from the current pose on every change, so
  out-of-order navigation never leaves a stale camera. Panel text has a short GSAP entrance that reverts if
  the chapter changes mid-animation. `prefers-reduced-motion` disables both.
- Layout: on phones the chapter panel is a bottom sheet (max 58% of the screen height) and the source panel
  shrinks to title, data badge, exaggeration and product link.

## Verification (2026-11-14)

- Vitest: 23 tests. These cover all scenes resolving to valid states with finite cameras, chapter state being
  independent of the entry point, text quoting exported numbers, unverified candidates, and 2000 random story
  actions.
- `pnpm perf` visits chapters in the order 5, 1, 4, 2, 3, runs a full guided replay (49.6 s, ended on chapter
  5), loads a phone viewport (390 × 844) deep-linked to chapter 2, and checks for zero console or page errors.
  Screenshots are written to `apps/web/perf-results/`. Rendering was software only (SwiftShader); frame rate on
  a hardware GPU is still unmeasured.

Not in Phase C: the printable Field Validation Brief (Phase E) and new sites (Phase D).

## Phase D and E additions

- **Lanzarote (validated in Phase D)** appears in chapter 3 as an extra step and in chapter 4 as extra steps
  (2 m observed, then simulated 4, 10 and 30 m). The experiment card has a Lava Beds / Lanzarote tab. All of
  this only appears if `sites.json` contains the Lanzarote site, which `export-web` writes only after the
  Phase D gate passes.
- `src/story/findings.ts` is the single source for the conclusion, hypothesis, limit and next-measurement
  statements. The chapter-5 card and the brief both use it.
- **Printable Field Validation Brief:** open `#brief`, or use the link in chapter 5. It is one A4 page built
  from `sites.json`. It contains:
  - the question;
  - findings supported by the data, kept separate from research hypotheses;
  - recommended next field measurements;
  - experiment tables for both Earth sites;
  - data products with licences, with unverified candidates marked NOT VERIFIED;
  - source limitations and citations.

  "Print / save as PDF" uses the browser's print dialog, with `@page` set to A4 and 10 mm margins.

## Cinematic redesign (from `tmp/TODO.md`)

The scientific data, numbers and conclusions are unchanged. Only presentation changed.

| # | Chapter | Headline | Primary action | Context panel |
|---|---|---|---|---|
| 1 | The Mystery | We mapped the surface. Not what lies beneath. | Reveal the blind spot | legend |
| 2 | The Blindspot | A visible opening doesn't reveal what lies beneath. | Search Earth for clues | legend |
| 3 | Search Earth | Earth holds clues to landscapes we cannot fully explore. | Run the resolution experiment | destinations |
| 4 | Resolution | Reduce the resolution. Watch the evidence fade. | See what we can conclude | lab |
| 5 | The Discovery | The next discovery begins where our observations end. | View Field Validation Brief | decision |

### Layers (progressive disclosure)

1. **Cinematic view:** the terrain, one headline, one supporting line, one primary action (`StoryOverlay`).
   The top bar (`TopBar`) holds the title, the chapter progress and the Guided tour / Explore / Evidence buttons.
2. **Context:** `DataChip` (observed or simulated, product, grid, exaggeration; the ⓘ explains it), the
   takeaway line, and the chapter panel (`Legend`, `Destinations`, `ResolutionLab`, `DecisionView`).
3. **Detailed record:** `EvidenceDrawer` ("How do we know?" / Evidence) holds each chapter's `body` text,
   sources, licences and citations, plus the experiment table and candidate list.

### Camera and motion

- A `hero` view opens chapter 1 with a 2.4 s dolly-in. Wide screens (≥ 760 px and landscape) shift the pit right
  of centre to leave room for text. Narrow screens keep it centred.
- Chapter 2 arrives on the intact surface, and a `followUp` preset opens the cut 1.5 s later. Under
  `prefers-reduced-motion` the cut applies immediately.
- Site changes fade through the background colour (`ab-site-fade`).

### Colour meaning

- Cyan `#5eead4`: measured surface (section line, observed badge).
- Magenta `#e040c8`: no elevation data. The pit outline and, in the section, the band between neighbouring
  measured posts.
- Dark hatch: below the surface, not measured.
- Amber: uncertain, hypothesis, or not verified.
- Violet dashed: simulated coarsening.
- Base palette: `#090D16` background, `#303A4A` surfaces, `#D5B293` primary action.

### Chapter 4: resolution comparison

The left half shows the observed grid and the right half the selected simulated grid. Clipping planes in screen
space split one scene, and the split handle can be dragged. The scrubber snaps only to grids that were
actually computed (observed, 4, 10, 30 m). Intermediate resolutions are never interpolated. The panel says "on
this relief measure" and does not claim that the features are proven to disappear.

### Chapter 5: decision

Four tiles: established, where each Earth site helps, still uncertain (hypothesis), and the observation that
would resolve it. The text comes from `findings.ts`. There are no scores or rankings.

### Screenshots

- Before: `docs/screenshots/before/` (1366×768, 390×844).
- After: `docs/screenshots/after/` (1366×768, 1920×1080, 390×844).
- To regenerate: in `apps/web`, run `pnpm build && SETTLE_MS=3200 node scripts/screens.mjs <outdir> 1366x768
  1920x1080 390x844`. The script uses the `?test=1` hooks and SwiftShader.
