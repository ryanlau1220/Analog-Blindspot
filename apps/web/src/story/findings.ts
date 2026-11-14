import type { SitesIndex } from "../data/types";
import { lastVisibleResolution, lossResolution } from "./scenes";

/**
 * Statements shared by the chapter-5 card and the printable brief. Conclusions
 * (supported), hypotheses, limits and next measurements are kept as separate
 * lists; every number is read from sites.json.
 */
export interface Findings {
  supported: string[];
  hypotheses: string[];
  limits: string[];
  next: string[];
}

export function buildFindings(index: SitesIndex): Findings {
  const moon = index.sites.find((s) => s.id === "moon");
  const earth = index.sites.find((s) => s.id === "earth");
  const lanz = index.sites.find((s) => s.id === "lanzarote");
  const f = moon?.facts;
  const exp = earth?.experiment;
  if (!f || !exp) throw new Error("sites.json lacks facts or experiment");
  const loss = lossResolution(exp);
  const kept = lastVisibleResolution(exp);
  const lexp = lanz?.experiment;
  const lKept = lexp ? lastVisibleResolution(lexp) : null;
  const lLoss = lexp ? lossResolution(lexp) : null;

  const supported = [
    `The LROC 4 m terrain model resolves the funnel of Marius Hills Pit: wall posts reach at least ${f.depression_lower_bound_m.toFixed(1)} m below the rim.`,
    `It has no elevation for the pit interior (${f.gap_posts} posts, about ${f.gap_extent_ew_m.toFixed(0)} × ${f.gap_extent_ns_m.toFixed(0)} m). The atlas depth of ${f.atlas_depth_m} m comes from separate stereo modelling.`,
  ];
  if (kept !== null && loss !== null) {
    supported.push(
      `At Lava Beds, relief around ${exp.landmark_count} named bridge points exceeds relief at random points from 0.5 m to ${kept} m and not from ${loss} m on (simulated coarsening).`,
    );
  }
  if (lexp && lKept !== null) {
    supported.push(
      `At Lanzarote, relief around ${lexp.landmark_count} named jameos exceeds relief at random land points from 2 m to ${lKept} m${
        lLoss === null ? " (coarser grids are too coarse for this measure)" : ` and not from ${lLoss} m on`
      }. The jameos, with larger relief than the bridges, stay distinguishable at a coarser grid.`,
    );
  }

  return {
    supported,
    hypotheses: [
      "Surface clues at the scale of the Lava Beds bridges would be hard to recognise in a lunar terrain model with 4 m posts. This assumes block averaging mimics a stereo DTM, which it does not exactly.",
      ...(lexp
        ? [
            "Collapse features with tens of metres of relief, like the Lanzarote jameos, would remain recognisable at coarser lunar grids. Not tested against lunar data.",
          ]
        : []),
    ],
    limits: [
      f.effective_resolution_note,
      `${exp.caveat} Gazetteer positions (GNIS, NGBE) are approximate.`,
      "Coarsened grids are simulations made by block averaging, not observations at those resolutions.",
      "None of the datasets measures the subsurface. No void or cave geometry is shown as fact.",
    ],
    next: [
      "Elevation data for the Marius Hills Pit floor and overhangs, rather than a single depth estimate.",
      "Mapped outlines of the Lava Beds collapses and bridges (and the La Corona jameos), so feature loss can be scored instead of compared at points.",
      "A direct subsurface measurement at a known tube with a mapped interior, to test what surface relief predicts.",
    ],
  };
}
