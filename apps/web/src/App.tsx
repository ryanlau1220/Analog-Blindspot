import { useEffect, useMemo, useReducer, useState } from "react";
import { loadIndex } from "./data/load";
import type { SitesIndex } from "./data/types";
import { initialState, reduce, type SceneAction, type SceneState } from "./scene/state";
import { Viewer } from "./scene/Viewer";
import { buildScenes, type StoryScene } from "./story/scenes";
import {
  currentStep,
  initialStory,
  type StoryAction,
  type StoryState,
  sceneFromHash,
  storyReduce,
} from "./story/story";
import { Brief } from "./ui/Brief";
import { ControlPanel } from "./ui/ControlPanel";
import { EvidenceCard } from "./ui/EvidenceCard";
import { EvidenceDrawer } from "./ui/EvidenceDrawer";
import { StoryOverlay, TopBar } from "./ui/StoryOverlay";

export function App() {
  const [index, setIndex] = useState<SitesIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadIndex().then(setIndex, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <FullScreenMessage title="Terrain data unavailable" body={error} />;
  if (!index) return <FullScreenMessage title="Loading verified terrain…" body="" />;
  return <Routes index={index} />;
}

/** "#brief" shows the printable brief; anything else is the 3D experience. */
function Routes({ index }: { index: SitesIndex }) {
  const [brief, setBrief] = useState(() => window.location.hash === "#brief");
  useEffect(() => {
    const on = () => setBrief(window.location.hash === "#brief");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return brief ? <Brief index={index} /> : <Experience index={index} />;
}

function Experience({ index }: { index: SitesIndex }) {
  const scenes = useMemo(() => buildScenes(index), [index]);
  const [state, dispatch] = useReducer(
    (s: SceneState, a: SceneAction) => reduce(index, s, a),
    index,
    (i) => initialState(i),
  );
  const [story, storyDispatch] = useReducer(
    (s: StoryState, a: StoryAction) => storyReduce(scenes, s, a),
    scenes,
    (sc) => ({ ...initialStory, scene: sceneFromHash(sc, window.location.hash) ?? 0 }),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  // Establishing dolly only when the experience opens on chapter 1.
  const [intro] = useState(() => story.scene === 0);

  useStoryDriver(scenes, story, storyDispatch, dispatch);
  useTestHooks(state, dispatch, story, storyDispatch);

  const site = index.sites.find((s) => s.id === state.site);
  const variant = site?.variants.find((v) => v.id === state.variantId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear selection when the site changes
  useEffect(() => setSelected(null), [state.site]);
  if (!site || !variant)
    return <FullScreenMessage title="Invalid scene state" body={JSON.stringify(state)} />;
  const landmark = site.landmarks.find((l) => l.id === selected) ?? null;
  const inStory = story.mode === "story";
  const observed = site.variants.find((v) => v.observed) ?? null;
  const compareVariant = state.compare && !variant.observed ? observed : null;
  const scene = inStory ? (scenes[story.scene] ?? null) : null;
  const openEvidence = () => {
    storyDispatch({ type: "pause" });
    setDrawer(true);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#090d16] text-zinc-100">
      <div className="absolute inset-0" onPointerDownCapture={() => storyDispatch({ type: "pause" })}>
        <Viewer
          site={site}
          variant={variant}
          compareVariant={compareVariant}
          state={state}
          selected={selected}
          onSelect={setSelected}
          intro={intro}
        />
      </div>
      <TopBar
        site={site}
        variant={variant}
        state={state}
        scenes={scenes}
        story={story}
        storyDispatch={storyDispatch}
        onEvidence={openEvidence}
      />
      {inStory ? (
        <StoryOverlay
          index={index}
          scenes={scenes}
          story={story}
          storyDispatch={storyDispatch}
          scene={state}
          sceneDispatch={dispatch}
          onEvidence={openEvidence}
        />
      ) : (
        <ControlPanel sites={index.sites} site={site} state={state} dispatch={dispatch} />
      )}
      {landmark && <EvidenceCard site={site} landmark={landmark} onClose={() => setSelected(null)} />}
      {drawer && (
        <EvidenceDrawer
          index={index}
          site={site}
          variant={variant}
          state={state}
          scene={scene}
          onClose={() => setDrawer(false)}
          onVariant={(variantId) => dispatch({ type: "selectVariant", variantId })}
          onSite={(s) =>
            dispatch({ type: "applyPreset", preset: { site: s, exaggeration: 2, view: "landmark" } })
          }
        />
      )}
    </div>
  );
}

/**
 * Applies the current story step to the 3D scene, runs guided replay, keyboard
 * navigation and the #scene= deep link. Steps are applied cumulatively from the
 * scene's first step, so a scene looks the same however it was reached.
 */
function useStoryDriver(
  scenes: StoryScene[],
  story: StoryState,
  storyDispatch: (a: StoryAction) => void,
  dispatch: (a: SceneAction) => void,
) {
  // Only position changes re-apply presets; pausing or user edits within a step are kept.
  const { mode, scene: sceneIdx, step: stepIdx } = story;
  useEffect(() => {
    if (mode !== "story") return;
    const { scene } = currentStep(scenes, { ...initialStory, scene: sceneIdx, step: stepIdx });
    const steps = scene.steps.slice(0, stepIdx + 1);
    // Earlier steps' delayed presets apply at once; the current step's after its delay.
    for (const st of steps.slice(0, -1)) {
      dispatch({ type: "applyPreset", preset: st.preset });
      if (st.followUp) dispatch({ type: "applyPreset", preset: st.followUp.preset });
    }
    const cur = steps[steps.length - 1];
    if (cur) dispatch({ type: "applyPreset", preset: cur.preset });
    const hash = `#scene=${scene.id}`;
    if (window.location.hash !== hash) history.replaceState(null, "", hash);
    const then = cur?.followUp;
    if (!then) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      dispatch({ type: "applyPreset", preset: then.preset });
      return;
    }
    // Cancelled if the user navigates away before it fires.
    const t = window.setTimeout(() => dispatch({ type: "applyPreset", preset: then.preset }), then.afterMs);
    return () => window.clearTimeout(t);
  }, [scenes, mode, sceneIdx, stepIdx, dispatch]);

  useEffect(() => {
    if (!story.playing || story.mode !== "story") return;
    const { step } = currentStep(scenes, story);
    const t = window.setTimeout(() => storyDispatch({ type: "next" }), step.ms);
    return () => window.clearTimeout(t);
  }, [scenes, story, storyDispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") storyDispatch({ type: "next" });
      else if (e.key === "ArrowLeft") storyDispatch({ type: "prev" });
      else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        storyDispatch({ type: story.playing ? "pause" : "play" });
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [story.playing, storyDispatch]);

  useEffect(() => {
    const onHash = () => {
      const i = sceneFromHash(scenes, window.location.hash);
      if (i !== null) storyDispatch({ type: "goTo", scene: i });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [scenes, storyDispatch]);
}

function FullScreenMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-black p-8 text-zinc-200">
      <div className="max-w-lg text-center">
        <p className="text-lg">{title}</p>
        {body && <p className="mt-2 font-mono text-sm text-red-300">{body}</p>}
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __ab?: {
      state: SceneState;
      dispatch: (a: SceneAction) => void;
      story?: StoryState;
      storyDispatch?: (a: StoryAction) => void;
      readyKey: string | null;
      render?: { calls: number; triangles: number };
      camera?: [number, number, number];
    };
  }
}

/** `?test=1` exposes the reducers to the performance smoke test. */
function useTestHooks(
  state: SceneState,
  dispatch: (a: SceneAction) => void,
  story: StoryState,
  storyDispatch: (a: StoryAction) => void,
) {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("test")) return;
    window.__ab = { ...(window.__ab ?? { readyKey: null }), state, dispatch, story, storyDispatch };
  }, [state, dispatch, story, storyDispatch]);
}
