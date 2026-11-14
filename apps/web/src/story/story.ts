import type { StoryScene } from "./scenes";

export interface StoryState {
  mode: "story" | "explore";
  scene: number;
  step: number;
  playing: boolean;
}

export type StoryAction =
  | { type: "goTo"; scene: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "explore" }
  | { type: "story" };

export const initialStory: StoryState = { mode: "story", scene: 0, step: 0, playing: false };

const clampScene = (scenes: StoryScene[], i: number) =>
  Number.isInteger(i) ? Math.min(Math.max(i, 0), scenes.length - 1) : 0;

/**
 * Story navigation. ``next`` walks the steps of the current scene, then moves
 * to the first step of the next scene; ``prev`` and ``goTo`` always land on a
 * scene's first step, so a scene is always entered from its defined start.
 * Guided replay stops at the end instead of looping.
 */
export function storyReduce(scenes: StoryScene[], s: StoryState, a: StoryAction): StoryState {
  switch (a.type) {
    case "goTo":
      return { ...s, mode: "story", scene: clampScene(scenes, a.scene), step: 0 };
    case "next": {
      const scene = scenes[s.scene];
      if (scene && s.step + 1 < scene.steps.length) return { ...s, step: s.step + 1 };
      if (s.scene + 1 < scenes.length) return { ...s, scene: s.scene + 1, step: 0 };
      return { ...s, playing: false };
    }
    case "prev":
      return s.step > 0 ? { ...s, step: 0 } : { ...s, scene: clampScene(scenes, s.scene - 1), step: 0 };
    case "play": {
      const atEnd = s.scene === scenes.length - 1 && s.step === (scenes[s.scene]?.steps.length ?? 1) - 1;
      return { ...s, mode: "story", playing: true, ...(atEnd ? { scene: 0, step: 0 } : {}) };
    }
    case "pause":
      return s.playing ? { ...s, playing: false } : s;
    case "explore":
      return { ...s, mode: "explore", playing: false };
    case "story":
      return { ...s, mode: "story" };
  }
}

export function currentStep(scenes: StoryScene[], s: StoryState) {
  const scene = scenes[s.scene];
  const step = scene?.steps[s.step];
  if (!scene || !step) throw new Error(`invalid story position ${s.scene}/${s.step}`);
  return { scene, step };
}

/** Story state to and from the URL hash (#scene=experiment), so a chapter can be linked directly. */
export function sceneFromHash(scenes: StoryScene[], hash: string): number | null {
  const id = new URLSearchParams(hash.replace(/^#/, "")).get("scene");
  const i = scenes.findIndex((x) => x.id === id);
  return i >= 0 ? i : null;
}
