import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIndex } from "../data/load";
import type { SitesIndex } from "../data/types";
import { initialState, reduce, siteVariants } from "../scene/state";
import { analogyRows } from "./analogy";
import { buildFindings } from "./findings";
import { MOLA_MEGDR, SLDEM2015 } from "./lunarProducts";
import { computedGrids, marsContext, requirementStatement, siteRequirements, verdictAt } from "./requirement";
import { holdoutSentence } from "./scenes";

const raw = JSON.parse(readFileSync(join(__dirname, "../../public/data/sites.json"), "utf8"));
const index: SitesIndex = validateIndex(raw);
const earth = index.sites.find((s) => s.id === "earth");
const lanz = index.sites.find((s) => s.id === "lanzarote");

describe("resolution requirement", () => {
  it("is computed from the experiment levels", () => {
    const r = Object.fromEntries(siteRequirements(index).map((x) => [x.siteId, x]));
    expect(r.earth).toMatchObject({ keptThrough: 4, lostAt: 10, unmeasurableFrom: 30 });
    expect(r.lanzarote).toMatchObject({ keptThrough: 10, lostAt: null, unmeasurableFrom: 30 });
    expect(computedGrids(index)).toEqual([0.5, 2, 4, 10, 30, 60]);
    if (!earth?.experiment) throw new Error("no experiment");
    expect(verdictAt(earth.experiment, 4)).toBe("above");
    expect(verdictAt(earth.experiment, 10)).toBe("not_above");
    expect(verdictAt(earth.experiment, 30)).toBe("not_measurable");
    expect(verdictAt(earth.experiment, 7)).toBe("not_computed");
  });

  it("states the limit and the global lunar product from data and citation", () => {
    expect(SLDEM2015.equator_m).toBeCloseTo(59.2, 1);
    const s = requirementStatement(index) ?? "";
    expect(s).toContain("tested 4 m grid, but not at 10 m");
    expect(s).toContain("background at the tested 10 m grid");
    expect(s).toContain("about 59 m");
    expect(buildFindings(index).supported[0]).toContain("Sampled relief comparison");
  });
});

describe("NASA reference and search", () => {
  it("keeps the NASADEM grid out of the simulated series but selectable", () => {
    const ref = earth?.nasa_reference;
    if (!earth || !ref) throw new Error("no NASA reference");
    expect(earth.variants.some((v) => v.reference)).toBe(false);
    expect(ref.variant.reference).toBe(true);
    expect(ref.variant.observed).toBe(false);
    expect(ref.variant.label).not.toContain("SIMULATED");
    expect(siteVariants(earth).map((v) => v.id)).toContain(ref.variant_id);
    const s = reduce(index, initialState(index, "earth"), {
      type: "selectVariant",
      variantId: ref.variant_id,
    });
    expect(s.variantId).toBe(ref.variant_id);
    expect(ref.comparison.pearson_r).toBeGreaterThan(0.99);
  });

  it("rejects a reference grid that claims to be a simulation", () => {
    const bad = structuredClone(raw);
    const site = bad.sites.find((s: { id: string }) => s.id === "earth");
    site.nasa_reference.variant.label = "SIMULATED something";
    expect(() => validateIndex(bad)).toThrow(/independent NASA observation/);
  });

  it("reports lattice recovery against chance and never inside named points", () => {
    for (const site of [earth, lanz]) {
      const search = site?.experiment?.search;
      if (!site || !search) throw new Error(`${site?.id}: no search`);
      for (const lv of search.levels) {
        if (lv.threshold_m === null) {
          expect(lv.candidates).toHaveLength(0);
          continue;
        }
        expect(lv.random_recovered_fraction).not.toBeNull();
        for (const c of lv.candidates)
          for (const lm of site.landmarks)
            expect(Math.hypot(c.x_m - lm.x_m, c.y_m - lm.y_m)).toBeGreaterThan(search.match_radius_m);
      }
    }
  });
});

describe("analogy matrix", () => {
  it("marks gravity, vacuum and radiation as breaks and uses the site climate", () => {
    if (!earth?.climate) throw new Error("no climate");
    const rows = analogyRows(index, earth);
    const by = Object.fromEntries(rows.map((r) => [r.dimension, r]));
    expect(by.Gravity?.status).toBe("breaks");
    expect(by["Surface radiation"]?.status).toBe("breaks");
    expect(by["Subsurface geometry"]?.status).toBe("unknown");
    expect(by["Surface temperature swing"]?.earth).toContain(earth.climate.t2m_max_c.toFixed(0));
  });

  it("gives every candidate point from data, including the Mars candidate", () => {
    const mars = index.candidates.find((c) => c.body === "Mars");
    expect(mars?.status).toBe("not_verified");
    expect(mars?.lat).toBeTypeOf("number");
    for (const s of index.sites) expect(s.landmarks[0]?.lat).toBeTypeOf("number");
  });
});

describe("independent checks", () => {
  it("validates the search against hold-out entrances that are not gazetteer points", () => {
    for (const site of [earth, lanz]) {
      const search = site?.experiment?.search;
      if (!site || !search?.holdout) throw new Error(`${site?.id}: no hold-out`);
      for (const h of search.holdout.points)
        for (const lm of site.landmarks)
          expect(Math.hypot(h.x_m - lm.x_m, h.y_m - lm.y_m)).toBeGreaterThan(search.match_radius_m);
      const obs = search.levels.find((l) => l.observed);
      expect(obs?.holdout_count).toBe(search.holdout.points.length);
      expect(holdoutSentence(obs as NonNullable<typeof obs>, search.match_radius_m)).toContain(
        "OpenStreetMap",
      );
    }
  });

  it("uses the processed Diviner bin for the lunar temperature swing", () => {
    const dv = index.sites.find((s) => s.id === "moon")?.facts?.diviner;
    if (!dv || !earth) throw new Error("no Diviner bin");
    expect(dv.bin_center_lat).toBeCloseTo(14.25);
    expect(dv.tbol_min_k).toBeLessThan(dv.tbol_max_k);
    const row = analogyRows(index, earth).find((r) => r.dimension === "Surface temperature swing");
    expect(row?.cites).toContain("diviner_gcp");
  });

  it("places Mars skylights against the global MOLA grid", () => {
    expect(MOLA_MEGDR.equator_m).toBeCloseTo(463, 0);
    expect(marsContext(index)).toMatch(/100–225 m across.*about 463 m/);
  });
});
