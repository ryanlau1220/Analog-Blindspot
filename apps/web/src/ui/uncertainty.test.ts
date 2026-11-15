import { describe, expect, it } from "vitest";
import type { ExperimentLevel } from "../data/types";
import { levelUncertainty } from "./uncertainty";

const base: ExperimentLevel = {
  resolution_m: 10,
  observed: false,
  landmark_relief_median_m: 4,
  background_relief_median_m: 5,
  landmark_relief_m: { a: 3.1, b: null, c: 14.2, d: 6 },
  background_relief_samples_m: [1, 2, 3],
  background_seed_medians_m: [5.9, 5.6, 5.8],
  slope_deg_p95: 20,
};

describe("levelUncertainty", () => {
  it("counts non-null points and takes min/max ranges", () => {
    expect(levelUncertainty(base)).toEqual({
      n: 3,
      seeds: 3,
      seedRange: { min: 5.6, max: 5.9 },
      pointRange: { min: 3.1, max: 14.2 },
    });
  });

  it("returns null ranges when data is empty", () => {
    const u = levelUncertainty({
      ...base,
      landmark_relief_m: { a: null, b: null },
      background_seed_medians_m: [],
    });
    expect(u).toEqual({ n: 0, seeds: 0, seedRange: null, pointRange: null });
  });
});
