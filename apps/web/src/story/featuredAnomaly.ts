import type { AnomalySearchLevel } from "../data/types";

/** Stable lattice coordinates in the Lava Beds ROI, not the mutable rank in a sorted list. */
export const FEATURED_ANOMALY = { x_m: 1395, y_m: 915 } as const;

export function findFeaturedAnomaly(level: AnomalySearchLevel | undefined) {
  return level?.candidates.find(
    (candidate) => candidate.x_m === FEATURED_ANOMALY.x_m && candidate.y_m === FEATURED_ANOMALY.y_m,
  );
}
