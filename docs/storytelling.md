# Story and interaction guide

Analog Blindspot has a five-chapter story, a separate six-stage judge presentation and a free exploration mode. The [README](../README.md) introduces the project; [Science notes](science.md) document its data and limits. The current experience is defined by [`scenes.ts`](../apps/web/src/story/scenes.ts) and [`JudgePresentation.tsx`](../apps/web/src/ui/JudgePresentation.tsx).

## Judge presentation

Select **Judge presentation** in the top bar. It runs for approximately 90 seconds when left playing; **Pause**, **Previous**, **Next** and **Exit** are available throughout.

| Stage | What visitors see | What it establishes |
| --- | --- | --- |
| 1. The question | Marius Hills Pit | A visible pit motivates a question about potential shelter, not a claim of habitability. |
| 2. The blind spot | Surface cutaway and missing elevation | The terrain model does not measure the pit interior or the underground. |
| 3. The experiment | Close view of Lava Beds with an observed/simulated split sweep | Coarsening changes how the same ground is represented; the displayed relief statistics compare groups of sampled points. |
| 4. The investigation | Search-region overview with candidate rings | The terrain search highlights high-relief locations for further study. |
| 5. The lead | A cyan-ringed cluster and measured relief | A specific observed-grid candidate is a lead, not a confirmed cave. |
| 6. The next step | The same lead and a link to the Field Validation Brief | Independent imagery and field measurements are needed before drawing geological conclusions. |

The featured Lava Beds candidate is identified by its recorded ROI coordinates in [`featuredAnomaly.ts`](../apps/web/src/story/featuredAnomaly.ts). The evidence, marker and camera use that same selection; the camera samples the displayed terrain height. The 17.51 m figure is local surface relief within a 30 m radius, not cave depth. Amber rings mark other unverified clusters; green rings identify clusters near a mapped OpenStreetMap entrance. These colors do not establish what any feature is.

The comparison uses the observed 0.5 m LiDAR and a simulated 10 m grid. Its moving split compares the same ground; it does not generate intermediate scientific measurements. With reduced motion enabled, the comparison stays at a static midpoint and camera transitions are suppressed.

## Five-chapter story

| Chapter | Deep link | Focus |
| --- | --- | --- |
| The Mystery | `#scene=mystery` | Real LROC terrain and the lunar pit. |
| The Blindspot | `#scene=blindspot` | A cut through measured terrain and the missing-elevation gap. |
| Search Earth | `#scene=search` | Lava Beds and Lanzarote as established analog environments, plus their differences from the Moon. |
| Resolution | `#scene=experiment` | A prediction followed by the observed/simulated comparison and anomaly search. |
| Field Decision | `#scene=decision` | Site-specific investigation questions, planetary context and the printable brief. |

Chapter buttons, **Previous** / **Next** and keyboard controls navigate the story. The guided tour advances through timed steps, but pauses at the prediction so a visitor can respond. Interaction with the scene or relevant controls also pauses replay. The optional **scroll journey** advances chapters while keeping the 3D scene in view; turn it off to orbit and zoom normally.

The story copy and chapter-specific panel can be collapsed and reopened. **Focus experiment** gives the comparison more space; its split can be dragged or adjusted with arrow keys. **Reveal the difference** sweeps between the existing grids and can be stopped. The Evidence control opens sources and detail without replacing the main story.

## Reading the visual evidence

- **Cyan surface line:** measured surface at the section; a cyan ring in the judge presentation highlights the selected unverified Earth lead.
- **Magenta:** missing lunar elevation; the app does not fill the pit gap with a guessed floor.
- **Hatching below the surface:** unmeasured subsurface, not a rendered cave.
- **Observed versus simulated labels:** Earth coarse grids are block-mean simulations; NASADEM is a separate observation.
- **Amber and green search rings:** unverified clusters, with green indicating proximity to an OpenStreetMap cave entrance rather than a confirmed detection.

The optional ambient audio starts only after a user enables it and stops when the tab is hidden. Motion and sound are not needed to read the results.

## Field Validation Brief

Open `#brief` directly or select **View Field Validation Brief** from the field decision or presentation. The browser-printable brief separates data-supported findings, hypotheses, limitations, sources and suggested next measurements. Its source is [`Brief.tsx`](../apps/web/src/ui/Brief.tsx).

## Verification

From the repository root, run `pnpm build` and then `pnpm --filter web smoke` for the browser checks. The smoke test covers desktop, mobile, small screens, slow animation frames, presentation navigation and the selected anomaly state. Set `CHROME` if Chrome is not at `/usr/bin/google-chrome`. Run `pnpm perf` for a device-specific rendering check; software and hardware rendering results should be reported separately.
