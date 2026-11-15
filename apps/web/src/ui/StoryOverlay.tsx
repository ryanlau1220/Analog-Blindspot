import { type Dispatch, type ReactNode, useLayoutEffect, useRef } from "react";
import { AmbientSound } from "../audio/AmbientSound";
import type { Site, SitesIndex, Variant } from "../data/types";
import type { SceneAction, SceneState } from "../scene/state";
import type { StoryScene } from "../story/scenes";
import type { StoryAction, StoryState } from "../story/story";
import { DataChip } from "./DataChip";
import { DecisionView } from "./DecisionView";
import { Destinations } from "./Destinations";
import { Legend } from "./Legend";
import { ResolutionLab } from "./ResolutionLab";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pad = (i: number) => String(i + 1).padStart(2, "0");

/** Top bar shared by story and explore modes: wordmark, data chip, chapter rail, mode buttons. */
export function TopBar({
  site,
  variant,
  state,
  scenes,
  story,
  storyDispatch,
  onEvidence,
  scrollJourney,
  onScrollJourney,
}: {
  site: Site;
  variant: Variant;
  state: SceneState;
  scenes: StoryScene[];
  story: StoryState;
  storyDispatch: Dispatch<StoryAction>;
  onEvidence: () => void;
  scrollJourney: boolean;
  onScrollJourney: () => void;
}) {
  const inStory = story.mode === "story";
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 p-3 sm:p-6">
      <p className="pointer-events-auto self-center text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-zinc-100 sm:text-[11px] sm:tracking-[0.35em]">
        <span className="max-[360px]:hidden">ANALOG </span>BLINDSPOT
        <span className="ml-3 hidden font-normal tracking-normal text-zinc-400 lg:inline">
          Discover what planetary maps cannot tell us.
        </span>
      </p>
      <div className="pointer-events-auto flex items-center gap-1 justify-self-end">
        {inStory ? (
          <IconButton
            testId="play-toggle"
            label={story.playing ? "Pause guided tour" : "Play guided tour"}
            onClick={() => storyDispatch({ type: story.playing ? "pause" : "play" })}
          >
            {story.playing ? "❚❚" : "▶"}
            <span className="hidden sm:inline">{story.playing ? " Pause" : " Guided tour"}</span>
          </IconButton>
        ) : (
          <IconButton testId="story-toggle" onClick={() => storyDispatch({ type: "story" })}>
            ← Story
          </IconButton>
        )}
        {inStory && (
          <IconButton testId="explore-toggle" onClick={() => storyDispatch({ type: "explore" })}>
            Explore
          </IconButton>
        )}
        <IconButton testId="evidence-toggle" onClick={onEvidence}>
          Evidence
        </IconButton>
        <AmbientSound />
      </div>
      <div className="pointer-events-auto col-span-2 min-w-0 sm:col-span-1">
        <DataChip site={site} variant={variant} exaggeration={state.exaggeration} onOpen={onEvidence} />
      </div>
      {inStory && (
        <nav
          aria-label="Chapters"
          className="pointer-events-auto col-span-2 sm:col-span-1 sm:col-start-2 sm:justify-self-end"
        >
          <button
            type="button"
            data-testid="scroll-toggle"
            aria-pressed={scrollJourney}
            onClick={onScrollJourney}
            className="mb-1 text-[11px] text-teal-200 min-h-6"
          >
            {scrollJourney ? "↓ Scroll journey on" : "↓ Try scroll journey"}
          </button>
          <ol className="flex gap-1">
            {scenes.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`chapter-${s.id}`}
                  aria-current={i === story.scene ? "step" : undefined}
                  aria-label={`Chapter ${i + 1}: ${s.chapter}`}
                  onClick={() => storyDispatch({ type: "goTo", scene: i })}
                  className={`flex flex-col items-start rounded px-1.5 py-1 text-left transition ${
                    i === story.scene ? "text-white" : "text-zinc-300 hover:text-white"
                  }`}
                >
                  <span
                    className={`mb-1 block h-0.5 w-10 rounded transition-colors sm:w-14 ${
                      i === story.scene ? "bg-teal-300" : i < story.scene ? "bg-zinc-400" : "bg-zinc-700"
                    }`}
                  />
                  <span className="text-[10px] tabular-nums">{pad(i)}</span>
                  <span className="hidden text-[10px] whitespace-nowrap md:block">{s.chapter}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </header>
  );
}

function IconButton({
  children,
  onClick,
  testId,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  testId: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      className="rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-zinc-200 backdrop-blur hover:bg-white/10 sm:px-3"
    >
      {children}
    </button>
  );
}

/** Layer 1 of story mode: one headline, one supporting line, one takeaway, one action, one panel. */
export function StoryOverlay({
  index,
  scenes,
  story,
  storyDispatch,
  scene: sceneState,
  sceneDispatch,
  onEvidence,
  focusLab,
  onFocusLab,
}: {
  index: SitesIndex;
  scenes: StoryScene[];
  story: StoryState;
  storyDispatch: Dispatch<StoryAction>;
  scene: SceneState;
  sceneDispatch: Dispatch<SceneAction>;
  onEvidence: () => void;
  focusLab: boolean;
  onFocusLab: () => void;
}) {
  const scene = scenes[story.scene];
  const step = scene?.steps[story.step];
  const root = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: animate on chapter change only
  useLayoutEffect(() => {
    if (!root.current || reducedMotion()) return;
    // Native animations use the document clock, independent of WebGL frame rate.
    // Controls fade without changing position, so they remain stable click targets.
    const animations = Array.from(root.current.querySelectorAll<HTMLElement>("[data-anim]")).map(
      (element, i) =>
        element.animate(
          element.dataset.anim === "controls"
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: "translateY(18px)" },
                { opacity: 1, transform: "none" },
              ],
          { duration: 800, delay: 150 + i * 120, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
        ),
    );
    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [story.scene]);

  if (!scene || !step) return null;
  const pause = () => storyDispatch({ type: "pause" });
  const go = (site: Site["id"]) => {
    pause();
    sceneDispatch({ type: "applyPreset", preset: { site, exaggeration: 2, view: "landmark" } });
  };
  const act = () => {
    if (scene.action.kind === "brief") window.location.hash = "#brief";
    else storyDispatch({ type: "goTo", scene: story.scene + 1 });
  };

  let panel: ReactNode = null;
  let panelWidth = "lg:w-[24rem]";
  if (scene.panel === "destinations") {
    panel = <Destinations index={index} current={sceneState.site} onGo={go} />;
    panelWidth = "lg:w-[30rem]";
  }
  if (scene.panel === "lab")
    panel = (
      <ResolutionLab
        index={index}
        state={sceneState}
        onVariant={(variantId) => {
          pause();
          sceneDispatch({ type: "selectVariant", variantId });
        }}
        onSite={(site) => {
          pause();
          sceneDispatch({
            type: "applyPreset",
            preset: { site, exaggeration: 2, view: "landmark", compare: true },
          });
        }}
        onCompare={(enabled) => sceneDispatch({ type: "setCompare", enabled })}
        onDetails={onEvidence}
        focused={focusLab}
        onFocus={onFocusLab}
      />
    );
  if (scene.panel === "decision") {
    panel = <DecisionView index={index} />;
    panelWidth = "lg:w-[34rem]";
  }

  // Interactive chapters: on small screens the panel replaces the supporting lines.
  const dense = scene.panel === "lab" || scene.panel === "destinations" || scene.panel === "decision";
  const lgOnly = dense ? "hidden lg:block" : "";
  const selectedExperiment = index.sites.find((site) => site.id === sceneState.site)?.experiment;
  const selectedVariant = index.sites
    .find((site) => site.id === sceneState.site)
    ?.variants.find((variant) => variant.id === sceneState.variantId);
  const selectedLevel = selectedExperiment?.levels.find(
    (level) => level.resolution_m === selectedVariant?.resolution_m,
  );
  const labTakeaway = selectedLevel
    ? selectedLevel.landmark_relief_median_m === null || selectedLevel.background_relief_median_m === null
      ? `${selectedVariant?.resolution_m} m grid: too few cells to measure relief with this method.`
      : `${sceneState.site === "lanzarote" ? "Lanzarote" : "Lava Beds"}: median point relief ${selectedLevel.landmark_relief_median_m.toFixed(1)} m; sampled background median ${selectedLevel.background_relief_median_m.toFixed(1)} m.`
    : scene.takeaway;

  return (
    <div
      ref={root}
      data-testid="story-panel"
      className={`${focusLab ? "ab-lab-focused" : ""} pointer-events-none absolute inset-x-0 bottom-0 z-10 grid max-h-[66dvh] grid-cols-1 items-end gap-x-8 gap-y-4 overflow-y-auto bg-gradient-to-t from-[#090d16] via-[#090d16]/85 to-transparent px-4 pt-16 pb-4 sm:px-8 sm:pb-8 lg:max-h-none lg:grid-cols-[minmax(0,36rem)_1fr] lg:overflow-visible lg:from-[#090d16]/90 lg:via-transparent`}
    >
      <div
        className={`ab-story-copy pointer-events-auto rounded-lg bg-[#090d16]/85 p-3 lg:bg-transparent lg:p-0 ${focusLab ? "hidden" : ""}`}
        aria-live="polite"
      >
        <p data-anim className="ab-chapter-label text-[11px] uppercase tracking-[0.3em] text-teal-300/90">
          <span aria-hidden="true" className="ab-chapter-mark" />
          {pad(story.scene)} · {scene.chapter}
        </p>
        <h1
          data-anim
          className="mt-2 text-[1.75rem] leading-[1.08] font-light tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
        >
          {scene.headline}
        </h1>
        <p data-anim className={`mt-3 max-w-md text-[15px] leading-relaxed text-zinc-300 ${lgOnly}`}>
          {scene.sub}
        </p>
        <p
          data-anim
          className={`ab-takeaway mt-3 max-w-md text-sm text-zinc-200 ${scene.panel === "lab" ? lgOnly : ""}`}
        >
          <span className="ab-takeaway-label">{scene.panel === "lab" ? "CURRENT VIEW" : "FIELD NOTE"}</span>
          {scene.panel === "lab" ? labTakeaway : scene.takeaway}
        </p>
        {scene.panel === "legend" && (
          <div data-anim className="mt-3">
            <Legend />
          </div>
        )}
        {step.caption && <p className="mt-2 text-xs text-amber-200/90">{step.caption}</p>}
      </div>
      {panel && (
        <div
          data-anim="controls"
          className={`pointer-events-auto w-full lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-self-end ${panelWidth}`}
        >
          {panel}
        </div>
      )}
      <div
        data-anim="controls"
        className={`pointer-events-auto flex flex-wrap items-center gap-3 lg:col-start-1 ${focusLab ? "hidden" : ""}`}
      >
        <button
          type="button"
          data-testid="primary-action"
          onClick={act}
          className="ab-primary-action rounded-full bg-[#d5b293] px-5 py-2.5 text-sm font-medium text-[#090d16] shadow-lg transition hover:bg-[#e4c6aa]"
        >
          {scene.action.label} →
        </button>
        {story.scene > 0 && (
          <button
            type="button"
            onClick={() => storyDispatch({ type: "goTo", scene: story.scene - 1 })}
            className="text-xs text-zinc-400 hover:text-white"
          >
            ← Previous
          </button>
        )}
        <button
          type="button"
          onClick={onEvidence}
          className="text-xs text-zinc-400 underline hover:text-white"
        >
          How do we know?
        </button>
      </div>
    </div>
  );
}
