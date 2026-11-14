import type { Experiment, MoonFacts, SitesIndex } from "../data/types";
import type { ScenePreset } from "../scene/state";

/**
 * The five chapters. Every number in the text comes from sites.json (and so
 * from datasets/manifest.json); nothing is typed in by hand.
 */
export type SceneId = "mystery" | "blindspot" | "search" | "experiment" | "decision";

export interface StoryStep {
  preset: ScenePreset;
  /** auto-advance time during guided replay */
  ms: number;
  caption?: string;
}

export interface StoryScene {
  id: SceneId;
  chapter: string;
  headline: string;
  body: string[];
  steps: StoryStep[];
  /** extra panel shown with this scene */
  panel?: "candidates" | "experiment" | "decision";
}

const m = (v: number, digits = 0) => `${v.toFixed(digits)} m`;
const range = ([a, b]: [number, number]) => `${a}–${b} m`;

/** First coarsened grid at which landmark relief no longer exceeds background relief. */
export function lossResolution(exp: Experiment): number | null {
  for (const lv of exp.levels) {
    if (lv.landmark_relief_median_m === null || lv.background_relief_median_m === null)
      return lv.resolution_m;
    if (lv.landmark_relief_median_m <= lv.background_relief_median_m) return lv.resolution_m;
  }
  return null;
}

/** Coarsest grid at which landmark relief still exceeds background relief. */
export function lastVisibleResolution(exp: Experiment): number | null {
  let last: number | null = null;
  for (const lv of exp.levels) {
    if (
      lv.landmark_relief_median_m !== null &&
      lv.background_relief_median_m !== null &&
      lv.landmark_relief_median_m > lv.background_relief_median_m
    ) {
      last = lv.resolution_m;
    } else break;
  }
  return last;
}

export function buildScenes(index: SitesIndex): StoryScene[] {
  const moon = index.sites.find((s) => s.id === "moon");
  const earth = index.sites.find((s) => s.id === "earth");
  const f: MoonFacts | undefined = moon?.facts;
  const exp: Experiment | undefined = earth?.experiment;
  if (!moon || !earth || !f || !exp)
    throw new Error("sites.json lacks story facts; rerun `uv run export-web`");
  const loss = lossResolution(exp);
  const kept = lastVisibleResolution(exp);
  const simulated = earth.variants.filter((v) => !v.observed);

  const scenesOut: StoryScene[] = [
    {
      id: "mystery",
      chapter: "1 · Mystery",
      headline: "A hole in the Moon, and a hole in the data.",
      body: [
        `Marius Hills Pit opens in a sinuous rille on the lunar nearside (${f.pit_lat.toFixed(2)}° N, ${f.pit_lon_east.toFixed(2)}° E). The LROC Pits Atlas lists a ${range(f.atlas_funnel_diameter_m)} funnel and a depth of about ${m(f.atlas_depth_m)}.`,
        `You are looking at the real LROC NAC terrain model, 4 m between elevation posts, at true vertical scale. The dark gap at the marker is where the model has no elevation at all.`,
      ],
      steps: [
        {
          preset: { site: "moon", exaggeration: 1, cutaway: false, drape: "relief", view: "overview" },
          ms: 3500,
        },
        {
          preset: { view: "landmark" },
          ms: 5000,
          caption: "Closer: the funnel rim is measured, the interior is not.",
        },
      ],
    },
    {
      id: "blindspot",
      chapter: "2 · Blindspot",
      headline: "The terrain model sees the funnel, not the floor.",
      body: [
        `The section follows the measured surface (yellow line). Valid posts on the funnel walls reach at least ${m(f.depression_lower_bound_m, 1)} below the surrounding rim. That is a lower bound: the interior, about ${m(f.gap_extent_ew_m)} × ${m(f.gap_extent_ns_m)}, has no elevation data.`,
        `Everything below the surface is hatched because nothing in this product measures it. Whether a void continues beyond the pit is unknown, so no cave is drawn.`,
      ],
      steps: [
        {
          preset: {
            site: "moon",
            exaggeration: 2,
            cutaway: true,
            cutPosition: "landmark",
            drape: "relief",
            view: "section",
          },
          ms: 7000,
          caption: "Vertical exaggeration ×2 in this view.",
        },
      ],
    },
    {
      id: "search",
      chapter: "3 · Search Earth",
      headline: "Go where lava tubes can be walked into.",
      body: [
        "Lava Beds National Monument, California, is a region where lava tubes are particularly abundant. NCALM flew this 0.5 m airborne LiDAR survey in 2023 to look for their surface expression.",
        `The markers are ${exp.landmark_count} named natural bridges from the USGS GNIS gazetteer, along a collapsed lava-tube trench. Their positions are approximate. The LiDAR measures the surface only.`,
      ],
      panel: "candidates",
      steps: [
        {
          preset: { site: "earth", variantId: "0p5m", exaggeration: 1, cutaway: false, view: "overview" },
          ms: 4500,
        },
        { preset: { view: "landmark", exaggeration: 2 }, ms: 4500, caption: "Vertical exaggeration ×2." },
      ],
    },
    {
      id: "experiment",
      chapter: "4 · Resolution experiment",
      headline: "Blur the Earth data until the bridges disappear.",
      body: [
        `The coarser grids are SIMULATED from the 0.5 m LiDAR by averaging blocks of pixels. They are not observations at those resolutions.`,
        loss !== null && kept !== null
          ? `Measured as relief (${exp.measure}), the bridge points stand out from ${exp.background_points} random points up to ${kept} m. From ${loss} m on, they do not.`
          : `Measured as relief (${exp.measure}), compare the bridge points with ${exp.background_points} random points at each grid.`,
      ],
      panel: "experiment",
      steps: [
        {
          preset: { site: "earth", variantId: "0p5m", exaggeration: 2, cutaway: false, view: "landmark" },
          ms: 3000,
        },
        ...simulated.map((v) => ({
          preset: { variantId: v.id },
          ms: 3000,
          caption: `Simulated ${v.resolution_m} m grid.`,
        })),
      ],
    },
    {
      id: "decision",
      chapter: "5 · Scientific decision",
      headline: "What the data supports, and what it cannot.",
      body: [
        "Marius Hills Pit is measured at its rim and walls but not inside. On Earth, a known lava-tube surface clue fades once the grid gets coarse enough.",
      ],
      panel: "decision",
      steps: [
        {
          preset: { site: "moon", exaggeration: 1, cutaway: false, drape: "orthophoto", view: "landmark" },
          ms: 9000,
        },
      ],
    },
  ];
  // Pin every field on each scene's first step so a chapter looks the same however it is reached.
  for (const sc of scenesOut) {
    const first = sc.steps[0];
    if (!first) throw new Error(`${sc.id} has no steps`);
    const site = first.preset.site === "earth" ? earth : moon;
    first.preset = {
      variantId: site.variants.find((v) => v.observed)?.id,
      exaggeration: 1,
      cutaway: false,
      cutPosition: 0.5,
      drape: "relief",
      view: "overview",
      ...first.preset,
    };
  }
  return scenesOut;
}
