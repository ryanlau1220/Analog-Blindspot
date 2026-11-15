import type { ExperimentLevel } from "../data/types";

export interface Range {
  min: number;
  max: number;
}

export interface LevelUncertainty {
  /** number of named points with a measured (non-null) relief value */
  n: number;
  /** number of random seeds with a background median */
  seeds: number;
  /** min/max of the background medians across random seeds; null when absent */
  seedRange: Range | null;
  /** min/max of the measured named-point relief values; null when none */
  pointRange: Range | null;
}

function range(values: number[]): Range | null {
  const finite = values.filter((x) => Number.isFinite(x));
  if (finite.length === 0) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}

/** Spread of the per-grid measurements, computed only from the level record. */
export function levelUncertainty(level: ExperimentLevel): LevelUncertainty {
  const points = Object.values(level.landmark_relief_m).filter((x): x is number => x !== null);
  return {
    n: points.length,
    seeds: level.background_seed_medians_m.filter((x) => Number.isFinite(x)).length,
    seedRange: range(level.background_seed_medians_m),
    pointRange: range(points),
  };
}
