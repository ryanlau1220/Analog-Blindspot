import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateIndex } from "../data/load";
import type { SitesIndex } from "../data/types";
import { cameraPreset, initialState, reduce, type SceneState } from "../scene/state";
import { buildScenes, lastVisibleResolution, lossResolution } from "./scenes";
import { currentStep, initialStory, type StoryAction, sceneFromHash, storyReduce } from "./story";

const index: SitesIndex = validateIndex(
  JSON.parse(readFileSync(join(__dirname, "../../public/data/sites.json"), "utf8")),
);
const scenes = buildScenes(index);

/** Scene state as the app produces it: cumulative presets from the scene's first step. */
function stateAt(scene: number, step: number, from: SceneState = initialState(index)): SceneState {
  const sc = scenes[scene];
  if (!sc) throw new Error("no scene");
  return sc.steps
    .slice(0, step + 1)
    .reduce((s, st) => reduce(index, s, { type: "applyPreset", preset: st.preset }), from);
}

describe("scenes", () => {
  it("has the five chapters in order", () => {
    expect(scenes.map((s) => s.id)).toEqual(["mystery", "blindspot", "search", "experiment", "decision"]);
  });

  it("every step resolves to a valid scene with a finite camera", () => {
    scenes.forEach((sc, i) => {
      sc.steps.forEach((_, j) => {
        const s = stateAt(i, j);
        const site = index.sites.find((x) => x.id === s.site);
        expect(site?.variants.some((v) => v.id === s.variantId)).toBe(true);
        if (!site) return;
        const pose = cameraPreset(site, s);
        expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true);
      });
    });
  });

  it("lands on the same scene state regardless of where it is entered from", () => {
    const starts = scenes.map((_, k) => stateAt(k, scenes[k]?.steps.length ? scenes[k].steps.length - 1 : 0));
    scenes.forEach((_, i) => {
      const ref = stateAt(i, 0);
      for (const from of starts) expect(stateAt(i, 0, from)).toEqual(ref);
    });
  });

  it("blindspot cuts through the pit and earth experiment ends on a simulated grid", () => {
    const b = stateAt(1, 0);
    const moon = index.sites.find((s) => s.id === "moon");
    expect(b.cutaway.enabled).toBe(true);
    expect(b.cutaway.position).toBeCloseTo((moon?.landmarks[0]?.y_m ?? 0) / (moon?.extent_m ?? 1));
    const e = stateAt(3, (scenes[3]?.steps.length ?? 1) - 1);
    const endSite = index.sites.find((s) => s.id === e.site);
    expect(endSite?.variants.find((v) => v.id === e.variantId)?.observed).toBe(false);
  });

  it("quotes numbers from the exported facts, not typed-in values", () => {
    const f = index.sites.find((s) => s.id === "moon")?.facts;
    const text = scenes.map((s) => s.body.join(" ")).join(" ");
    expect(text).toContain(`${f?.depression_lower_bound_m.toFixed(1)} m`);
    expect(text).toContain(`${f?.atlas_depth_m.toFixed(0)} m`);
    const exp = index.sites.find((s) => s.id === "earth")?.experiment;
    if (!exp) throw new Error("no experiment");
    expect(lastVisibleResolution(exp)).toBe(4);
    expect(lossResolution(exp)).toBe(10);
    expect(text).toContain("up to 4 m");
    expect(text).toMatch(/SIMULATED/);
  });

  it("presents unverified candidates as unverified", () => {
    const byId = Object.fromEntries(index.candidates.map((c) => [c.id, c.status]));
    expect(byId.lava_beds).toBe("validated");
    expect(byId.harrat_khaybar).toBe("not_verified");
    // Lanzarote is "validated" only when its site (Phase D gate passed) is exported, and vice versa.
    const hasSite = index.sites.some((x) => x.id === "lanzarote");
    expect(byId.lanzarote).toBe(hasSite ? "validated" : "not_verified");
  });

  it("visits Lanzarote in chapters 3 and 4 only when its data is validated", () => {
    const hasSite = index.sites.some((x) => x.id === "lanzarote");
    const visits = (i: number) => (scenes[i]?.steps ?? []).some((_, j) => stateAt(i, j).site === "lanzarote");
    expect(visits(2)).toBe(hasSite);
    expect(visits(3)).toBe(hasSite);
    if (hasSite) {
      const last = stateAt(3, (scenes[3]?.steps.length ?? 1) - 1);
      const lanz = index.sites.find((x) => x.id === "lanzarote");
      expect(lanz?.variants.find((v) => v.id === last.variantId)?.observed).toBe(false);
      expect(scenes[3]?.body.join(" ")).toMatch(/Lanzarote/);
    }
  });
});

describe("story navigation", () => {
  const r = (s: typeof initialStory, a: StoryAction) => storyReduce(scenes, s, a);

  it("walks steps then scenes and stops replay at the end", () => {
    let s = r(initialStory, { type: "play" });
    let n = 0;
    while (s.playing && n++ < 100) s = r(s, { type: "next" });
    expect(s.scene).toBe(scenes.length - 1);
    expect(s.playing).toBe(false);
    expect(r(s, { type: "play" })).toMatchObject({ scene: 0, step: 0, playing: true });
  });

  it("goTo and prev always enter a scene at its first step, clamped", () => {
    expect(r({ ...initialStory, scene: 3, step: 2 }, { type: "goTo", scene: 99 })).toMatchObject({
      scene: 4,
      step: 0,
    });
    expect(r({ ...initialStory, scene: 3, step: 2 }, { type: "prev" })).toMatchObject({ scene: 3, step: 0 });
    expect(r({ ...initialStory, scene: 3, step: 0 }, { type: "prev" })).toMatchObject({ scene: 2, step: 0 });
    expect(r(initialStory, { type: "prev" })).toMatchObject({ scene: 0, step: 0 });
  });

  it("stays at a valid position under any action order", () => {
    const actions: StoryAction[] = [
      { type: "next" },
      { type: "prev" },
      { type: "play" },
      { type: "pause" },
      { type: "explore" },
      { type: "story" },
      { type: "goTo", scene: 2 },
      { type: "goTo", scene: -3 },
      { type: "goTo", scene: 1.5 },
    ];
    let seed = 11;
    let s = initialStory;
    for (let k = 0; k < 2000; k++) {
      seed = (seed * 16807) % 2147483647;
      s = r(s, actions[seed % actions.length] as StoryAction);
      expect(() => currentStep(scenes, s)).not.toThrow();
      if (s.mode === "explore") expect(s.playing).toBe(false);
    }
  });

  it("parses #scene= deep links", () => {
    expect(sceneFromHash(scenes, "#scene=experiment")).toBe(3);
    expect(sceneFromHash(scenes, "#scene=nope")).toBeNull();
  });
});
