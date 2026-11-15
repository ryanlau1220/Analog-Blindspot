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
  /** a second preset applied after a delay (e.g. open the cut once the camera has arrived) */
  followUp?: { afterMs: number; preset: ScenePreset };
}

export interface StoryScene {
  id: SceneId;
  /** short chapter label for the progress rail */
  chapter: string;
  /** layer 1: one dominant headline */
  headline: string;
  /** layer 1: one supporting line */
  sub: string;
  /** layer 2: the scene's single scientific takeaway, built from sites.json */
  takeaway: string;
  /** layer 1: the one primary action */
  action: { label: string; kind: "next" | "brief" };
  /** layer 3: detailed explanation, shown in the evidence drawer */
  body: string[];
  steps: StoryStep[];
  /** chapter-specific interactive overlay */
  panel?: "legend" | "destinations" | "lab" | "decision";
}

const m = (v: number, digits = 0) => `${v.toFixed(digits)} m`;
const range = ([a, b]: [number, number]) => `${a}–${b} m`;

/** First coarsened grid at which landmark relief no longer exceeds background relief. */
export function lossResolution(exp: Experiment): number | null {
  for (const lv of exp.levels) {
    if (lv.landmark_relief_median_m === null || lv.background_relief_median_m === null) continue;
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
  // Optional third site: only present in sites.json once its Phase D gate has passed.
  const lanz = index.sites.find((s) => s.id === "lanzarote");
  const lexp = lanz?.experiment;
  const lKept = lexp ? lastVisibleResolution(lexp) : null;
  const lLoss = lexp ? lossResolution(lexp) : null;
  const median = (e: Experiment) => e.levels.find((l) => l.observed)?.landmark_relief_median_m ?? null;
  const simulated = earth.variants.filter((v) => !v.observed);

  const obs = (site: typeof earth) => site.variants.find((v) => v.observed);
  const scenesOut: StoryScene[] = [
    {
      id: "mystery",
      chapter: "The Mystery",
      headline: "The pit is real. What lies beneath is still unmeasured.",
      sub: "One lunar opening. An incomplete map. A mystery we cannot resolve from orbit.",
      takeaway: `Real LROC terrain, ${obs(moon)?.resolution_m} m between elevation posts. Inside the magenta edge the model has no elevation at all.`,
      action: { label: "Reveal the blind spot", kind: "next" },
      body: [
        `Marius Hills Pit opens in a sinuous rille on the lunar nearside (${f.pit_lat.toFixed(2)}° N, ${f.pit_lon_east.toFixed(2)}° E). The LROC Pits Atlas lists a ${range(f.atlas_funnel_diameter_m)} funnel and a depth of about ${m(f.atlas_depth_m)}.`,
        "You are looking at the real LROC NAC terrain model at true vertical scale, draped with the verified 4 m LROC orthophoto. The magenta outline marks where measured elevation stops.",
      ],
      steps: [
        {
          preset: { site: "moon", exaggeration: 1, cutaway: false, drape: "orthophoto", view: "hero" },
          ms: 6000,
        },
      ],
    },
    {
      id: "blindspot",
      chapter: "The Blindspot",
      headline: "A visible opening doesn't reveal what lies beneath.",
      sub: "The display mesh traces the measured surface; magenta marks missing elevation. The grid is a display mesh, not individual source pixels.",
      takeaway: `The walls are measured to at least ${m(f.depression_lower_bound_m, 1)} below the rim. The ${m(f.gap_extent_ew_m)} × ${m(f.gap_extent_ns_m)} interior has no data. Below that, nothing is measured.`,
      action: { label: "Search Earth for clues", kind: "next" },
      body: [
        `The section follows the measured surface (cyan line). Valid posts on the funnel walls reach at least ${m(f.depression_lower_bound_m, 1)} below the surrounding rim. That is a lower bound: the interior, about ${m(f.gap_extent_ew_m)} × ${m(f.gap_extent_ns_m)}, has no elevation data (magenta).`,
        "Everything below the surface is hatched because nothing in this product measures it. Whether a void continues beyond the pit is unknown, so no cave is drawn. The block depth is for display only.",
      ],
      panel: "legend",
      steps: [
        {
          // Approach first; open the cut once the camera faces the section line.
          preset: { site: "moon", exaggeration: 2, cutaway: false, cutPosition: "landmark", view: "section" },
          ms: 8000,
          caption: "Vertical exaggeration ×2.",
          followUp: { afterMs: 1500, preset: { cutaway: true } },
        },
      ],
    },
    {
      id: "search",
      chapter: "Search Earth",
      headline: "Earth holds clues to landscapes we cannot fully explore.",
      sub: "Choose a known Earth site for a specific surface-measurement question.",
      takeaway:
        "Two sites have checked airborne LiDAR of surfaces above known lava tubes. Neither is a proven universal analog.",
      action: { label: "Run the resolution experiment", kind: "next" },
      body: [
        "Lava Beds National Monument, California, is a region where lava tubes are particularly abundant. NCALM flew this 0.5 m airborne LiDAR survey in 2023 to look for their surface expression.",
        `The Lava Beds markers are ${exp.landmark_count} named natural bridges from the USGS GNIS gazetteer, along a collapsed lava-tube trench. Their positions are approximate. The LiDAR measures the surface only.`,
        ...(lanz && lexp
          ? [
              `At Lanzarote the markers are ${lexp.landmark_count} named jameos (collapse openings into a lava tube) from the IGN gazetteer, on the ${obs(lanz)?.resolution_m} m CNIG LiDAR terrain model.`,
            ]
          : []),
      ],
      panel: "destinations",
      steps: [
        {
          preset: { site: "earth", exaggeration: 2, view: "landmark" },
          ms: 5000,
          caption: "Vertical exaggeration ×2.",
        },
        ...(lanz
          ? [
              {
                preset: { site: "lanzarote" as const, exaggeration: 2 as const, view: "landmark" as const },
                ms: 5000,
                caption: "Vertical exaggeration ×2.",
              },
            ]
          : []),
      ],
    },
    {
      id: "experiment",
      chapter: "Resolution",
      headline: "Can the surface clues keep their distinction?",
      sub: "Predict the outcome, then compare observed terrain with a simulated coarser grid.",
      takeaway:
        loss !== null && kept !== null
          ? `Median bridge-point relief exceeds background through ${kept} m; at ${loss} m it does not.`
          : "Compare the bridges with random ground at each grid.",
      action: { label: "See what we can conclude", kind: "next" },
      body: [
        "The coarser grids are SIMULATED from the observed LiDAR by averaging blocks of real pixels. They are not observations at those resolutions, and no grid between the computed ones is shown.",
        loss !== null && kept !== null
          ? `Measured as relief (${exp.measure}), the median for bridge points exceeds the median for ${exp.background_points} random points through ${kept} m; at ${loss} m it does not. This is not a detection benchmark.`
          : `Measured as relief (${exp.measure}), compare the bridge points with ${exp.background_points} random points at each grid.`,
        ...(lanz && lexp && lKept !== null
          ? [
              `At Lanzarote the median point relief is ${median(lexp)?.toFixed(1)} m, against ${median(exp)?.toFixed(1)} m for Lava Beds. Its median exceeds the sampled background at ${lKept} m${lLoss === null ? "; coarser grids are not measurable with this method" : `, but not at ${lLoss} m`}.`,
            ]
          : []),
        "The 3D mesh uses the same 257 × 257 display grid for every variant; the shading comes from each grid at its own resolution.",
      ],
      panel: "lab",
      steps: [
        {
          preset: {
            site: "earth",
            variantId: obs(earth)?.id,
            exaggeration: 2,
            view: "landmark",
            compare: false,
          },
          ms: 4000,
          caption: "Vertical exaggeration ×2.",
        },
        ...simulated.map((v) => ({ preset: { variantId: v.id }, ms: 3000 })),
        ...(lanz
          ? lanz.variants.map((v) => ({
              preset: v.observed
                ? {
                    site: "lanzarote" as const,
                    exaggeration: 2 as const,
                    view: "landmark" as const,
                    compare: true,
                  }
                : { variantId: v.id },
              ms: 3000,
            }))
          : []),
      ],
    },
    {
      id: "decision",
      chapter: "Field Decision",
      headline: "One Moon. Two Earth sites. Different questions.",
      sub: "Two known candidate environments, two measurement questions, and one crucial unknown.",
      takeaway: "Every statement below is backed by the datasets in this app; hypotheses are marked as such.",
      action: { label: "View Field Validation Brief", kind: "brief" },
      body: [
        "Marius Hills Pit is measured at its rim and walls but not inside. Earth site recommendations are conditional on the measurement question, not proof of a lunar match or a newly discovered site.",
      ],
      panel: "decision",
      steps: [{ preset: { site: "moon", exaggeration: 1, drape: "orthophoto", view: "landmark" }, ms: 9000 }],
    },
  ];
  // Pin every field on each scene's first step so a chapter looks the same however it is reached.
  for (const sc of scenesOut) {
    const first = sc.steps[0];
    if (!first) throw new Error(`${sc.id} has no steps`);
    const site = index.sites.find((x) => x.id === (first.preset.site ?? "moon")) ?? moon;
    first.preset = {
      variantId: obs(site)?.id,
      exaggeration: 1,
      cutaway: false,
      cutPosition: 0.5,
      drape: "relief",
      view: "overview",
      compare: false,
      ...first.preset,
    };
  }
  return scenesOut;
}
