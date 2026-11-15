import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHeights, validateIndex } from "../data/load";
import type { SitesIndex } from "../data/types";
import { FEATURED_ANOMALY, findFeaturedAnomaly } from "../story/featuredAnomaly";
import { cameraPreset, initialState, reduce, type SceneAction } from "./state";

const DATA = join(__dirname, "../../public/data");
const index: SitesIndex = validateIndex(JSON.parse(readFileSync(join(DATA, "sites.json"), "utf8")));

describe("exported assets", () => {
  it("labels every non-observed variant as simulated and keeps subsurface unmeasured", () => {
    for (const s of index.sites) {
      expect(s.subsurface).toBe("not measured");
      for (const v of s.variants) if (!v.observed) expect(v.label).toMatch(/SIMULATED COARSENING/);
    }
    const earth = index.sites.find((s) => s.id === "earth");
    expect(earth?.variants.map((v) => v.resolution_m)).toEqual([0.5, 4, 10, 30]);
  });

  it("keeps the Moon pit interior as NaN in the shipped heights", () => {
    const moon = index.sites.find((s) => s.id === "moon");
    const v = moon?.variants[0];
    if (!moon || !v) throw new Error("moon missing");
    const buf = readFileSync(join(DATA, "moon", v.heights.file));
    const h = parseHeights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), v.heights);
    const nan = h.filter((x) => Number.isNaN(x)).length;
    expect(nan).toBe(v.elevation.nan_count);
    expect(nan).toBe(159);
  });

  it("rejects an index that claims subsurface data or mislabels a simulation", () => {
    const bad = structuredClone(index) as SitesIndex;
    (bad.sites[0] as { subsurface: string }).subsurface = "measured";
    expect(() => validateIndex(bad)).toThrow();
    const bad2 = structuredClone(index) as SitesIndex;
    const v = bad2.sites[1]?.variants[1];
    if (v) v.label = "4 m terrain";
    expect(() => validateIndex(bad2)).toThrow(/SIMULATED/);
  });
});

describe("scene reducer", () => {
  it("ties the featured search measurement, marker coordinates, and camera target to the same candidate", () => {
    const site = index.sites.find((s) => s.id === "earth");
    if (!site) throw new Error("earth missing");
    const candidate = findFeaturedAnomaly(site.experiment?.search?.levels.find((l) => l.observed));
    expect(candidate).toMatchObject(FEATURED_ANOMALY);
    expect(candidate?.relief_m).toBeGreaterThan(0);
    const state = reduce(index, initialState(index, "earth"), {
      type: "applyPreset",
      preset: { view: "anomaly", featuredAnomaly: FEATURED_ANOMALY },
    });
    const height = site.variants[0]?.elevation.min_m ?? 0;
    const pose = cameraPreset(site, state, true, height);
    expect(pose.target).toEqual([
      FEATURED_ANOMALY.x_m - site.extent_m / 2,
      0,
      FEATURED_ANOMALY.y_m - site.extent_m / 2,
    ]);
    expect(reduce(index, state, { type: "setFeaturedAnomaly", target: { x_m: -1, y_m: -1 } })).toBe(state);
  });
  it("resets to the observed variant when switching site", () => {
    let s = initialState(index, "earth");
    s = reduce(index, s, { type: "selectVariant", variantId: "30m" });
    s = reduce(index, s, { type: "selectSite", site: "moon" });
    expect(s.variantId).toBe("4m");
    s = reduce(index, s, { type: "selectSite", site: "earth" });
    expect(s.variantId).toBe("0p5m");
  });

  it("ignores invalid requests instead of producing a broken state", () => {
    const s = initialState(index, "earth");
    expect(reduce(index, s, { type: "selectVariant", variantId: "2m" })).toBe(s);
    expect(reduce(index, s, { type: "setDrape", drape: "orthophoto" })).toBe(s);
    expect(reduce(index, s, { type: "setExaggeration", value: 3 as 1 })).toBe(s);
    expect(reduce(index, s, { type: "setCutPosition", position: 7 }).cutaway.position).toBe(1);
  });

  it("stays valid under any order of actions", () => {
    const actions: SceneAction[] = [
      { type: "toggleCutaway" },
      { type: "selectSite", site: "earth" },
      { type: "setDrape", drape: "orthophoto" },
      { type: "selectVariant", variantId: "10m" },
      { type: "setExaggeration", value: 4 },
      { type: "selectSite", site: "moon" },
      { type: "setDrape", drape: "orthophoto" },
      { type: "selectSite", site: "earth" },
      { type: "setCutPosition", position: Number.NaN },
    ];
    let seed = 7;
    for (let trial = 0; trial < 200; trial++) {
      let s = initialState(index);
      for (let k = 0; k < 12; k++) {
        seed = (seed * 16807) % 2147483647;
        s = reduce(index, s, actions[seed % actions.length] as SceneAction);
        const site = index.sites.find((x) => x.id === s.site);
        expect(site?.variants.some((v) => v.id === s.variantId)).toBe(true);
        if (s.drape === "orthophoto") expect(site?.drape).not.toBeNull();
        expect(s.cutaway.position).toBeGreaterThanOrEqual(0);
        expect(s.cutaway.position).toBeLessThanOrEqual(1);
      }
    }
  });
});
