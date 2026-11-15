import type { Experiment, SitesIndex } from "../data/types";
import { MOLA_MEGDR, SLDEM2015 } from "./lunarProducts";
import { lastVisibleResolution, lossResolution } from "./scenes";

export { SLDEM2015 };

/**
 * The resolution requirement that the Earth experiment supports, and where
 * lunar terrain products sit against it. Grids and verdicts come from
 * sites.json; the global lunar product is a cited constant.
 */
export type Verdict = "above" | "not_above" | "not_measurable" | "not_computed";

export function verdictAt(exp: Experiment, grid: number): Verdict {
  const lv = exp.levels.find((l) => l.resolution_m === grid);
  if (!lv) return "not_computed";
  if (lv.landmark_relief_median_m === null || lv.background_relief_median_m === null) return "not_measurable";
  return lv.landmark_relief_median_m > lv.background_relief_median_m ? "above" : "not_above";
}

export interface SiteRequirement {
  siteId: string;
  name: string;
  features: string;
  observed: number;
  /** coarsest grid where the point median still exceeded the background */
  keptThrough: number | null;
  /** first grid where it did not */
  lostAt: number | null;
  /** first grid that cannot be measured with this radius */
  unmeasurableFrom: number | null;
}

const FEATURES: Record<string, string> = { earth: "bridge-scale clues", lanzarote: "jameo-scale openings" };

export function siteRequirements(index: SitesIndex): SiteRequirement[] {
  return index.sites
    .filter((s) => s.experiment && FEATURES[s.id])
    .map((s) => {
      const exp = s.experiment as Experiment;
      const unm = exp.levels.find((l) => l.landmark_relief_median_m === null)?.resolution_m ?? null;
      return {
        siteId: s.id,
        name: s.name.split(",")[0] ?? s.name,
        features: FEATURES[s.id] ?? "named features",
        observed: exp.levels.find((l) => l.observed)?.resolution_m ?? 0,
        keptThrough: lastVisibleResolution(exp),
        lostAt: lossResolution(exp),
        unmeasurableFrom: unm,
      };
    });
}

/** Every grid computed for any Earth site, ascending. */
export function computedGrids(index: SitesIndex): number[] {
  const g = new Set<number>();
  for (const s of index.sites) for (const l of s.experiment?.levels ?? []) g.add(l.resolution_m);
  return [...g].sort((a, b) => a - b);
}

export function lunarProducts(index: SitesIndex): { name: string; grid_m: number; note: string }[] {
  const moon = index.sites.find((s) => s.id === "moon");
  const nac = moon?.variants.find((v) => v.observed);
  return [
    ...(nac
      ? [
          {
            name: `LROC NAC DTM at Marius Hills (${moon?.provenance.product_id})`,
            grid_m: nac.resolution_m,
            note: "targeted stereo model, only where NAC stereo pairs exist",
          },
        ]
      : []),
    {
      name: SLDEM2015.name,
      grid_m: SLDEM2015.equator_m,
      note: "global terrain model, pixel size at the equator",
    },
  ];
}

/** Mars: published skylight sizes against the global MOLA grid, or null without a sized Mars candidate. */
export function marsContext(index: SitesIndex): string | null {
  const mars = index.candidates.find((c) => c.body === "Mars" && c.size_m);
  if (!mars?.size_m) return null;
  const [lo, hi] = mars.size_m;
  const cell = MOLA_MEGDR.equator_m;
  return `Mars: candidate cave skylights near Arsia Mons are ${lo}–${hi} m across, smaller than one cell of the global ${MOLA_MEGDR.name} (about ${cell.toFixed(0)} m). Only targeted HiRISE stereo models (1–2 m) approach the grids where Earth tube clues stood out.`;
}

/** One-sentence requirement for the decision chapter and the brief. */
export function requirementStatement(index: SitesIndex): string | null {
  const reqs = siteRequirements(index);
  const lb = reqs.find((r) => r.siteId === "earth");
  if (!lb || lb.keptThrough === null || lb.lostAt === null) return null;
  const lz = reqs.find((r) => r.siteId === "lanzarote");
  const products = lunarProducts(index);
  const nac = products[0];
  const global = products[products.length - 1];
  const parts = [
    `On this relief measure, ${lb.features} (Lava Beds) stand out on grids of ${lb.keptThrough} m or finer and not at ${lb.lostAt} m`,
  ];
  if (lz?.keptThrough != null)
    parts.push(`${lz.features} (Lanzarote) still stand out at ${lz.keptThrough} m`);
  let s = `${parts.join("; ")}.`;
  if (nac && global)
    s += ` The Marius Hills NAC terrain model (${nac.grid_m} m) sits at the bridge-scale limit; the global ${global.name} (about ${global.grid_m.toFixed(0)} m) is coarser than every grid where either feature type stood out.`;
  return s;
}
