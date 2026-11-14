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
- **Visual vocabulary.** The yellow line is the measured section profile. Grey hatching means below the surface,
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
