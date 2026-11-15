import { ArrowDown, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { type Dispatch, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import brandMark from "../assets/brand-mark.svg";
import { AmbientSound } from "../audio/AmbientSound";
import type { ExperimentLevel, Site, SitesIndex, Variant } from "../data/types";
import type { SceneAction, SceneState } from "../scene/state";
import { lossResolution, type StoryScene } from "../story/scenes";
import type { StoryAction, StoryState } from "../story/story";
import { AnalogyMatrix } from "./AnalogyMatrix";
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
  onJudge,
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
  onJudge: () => void;
}) {
  const inStory = story.mode === "story";
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 p-3 sm:p-6">
      <p className="pointer-events-auto flex min-w-0 items-center gap-2 self-center text-[9px] font-semibold tracking-[0.18em] whitespace-nowrap text-zinc-100 sm:text-[11px] sm:tracking-[0.35em]">
        <img
          src={brandMark}
          alt=""
          aria-hidden="true"
          width="30"
          height="30"
          className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
        />
        <span className="whitespace-nowrap max-[360px]:sr-only">ANALOG BLINDSPOT</span>
        <span className="ml-3 hidden font-normal tracking-normal text-zinc-400 lg:inline">
          Discover what planetary maps cannot tell us.
        </span>
      </p>
      <div className="pointer-events-auto flex items-center gap-1 justify-self-end">
        <IconButton testId="judge-toggle" label="Open judge presentation" onClick={onJudge}>
          <span className="hidden sm:inline">Judge presentation</span>
          <span className="sm:hidden">Judge</span>
        </IconButton>
        {inStory ? (
          <IconButton
            testId="play-toggle"
            label={story.playing ? "Pause guided tour" : "Play guided tour"}
            onClick={() => storyDispatch({ type: story.playing ? "pause" : "play" })}
          >
            {story.playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            <span className="hidden sm:inline">{story.playing ? " Pause" : " Guided tour"}</span>
          </IconButton>
        ) : (
          <IconButton testId="story-toggle" onClick={() => storyDispatch({ type: "story" })}>
            <ArrowLeft size={13} aria-hidden="true" /> Story
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
            <ArrowDown size={13} aria-hidden="true" className="inline" />{" "}
            {scrollJourney ? "Scroll journey on" : "Try scroll journey"}
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
      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-zinc-200 backdrop-blur hover:bg-white/10 sm:px-3"
    >
      {children}
    </button>
  );
}

/**
 * The Lava Beds grid the prediction asks about: the first coarsened grid where the
 * point median is not above background, else the coarsest measurable simulated grid.
 */
function predictionTarget(index: SitesIndex): { variant: Variant; level: ExperimentLevel } | null {
  const site = index.sites.find((s) => s.id === "earth");
  const exp = site?.experiment;
  if (!site || !exp) return null;
  const pair = (grid: number | null) => {
    if (grid === null) return null;
    const variant = site.variants.find((v) => v.resolution_m === grid);
    const level = exp.levels.find((l) => l.resolution_m === grid);
    return variant && level ? { variant, level } : null;
  };
  const loss = pair(lossResolution(exp));
  if (loss) return loss;
  const measurable = exp.levels
    .filter(
      (l) => !l.observed && l.landmark_relief_median_m !== null && l.background_relief_median_m !== null,
    )
    .map((l) => pair(l.resolution_m))
    .filter((x) => x !== null && !x.variant.observed);
  return measurable.reduce<{ variant: Variant; level: ExperimentLevel } | null>(
    (best, x) => (x && (!best || x.level.resolution_m > best.level.resolution_m) ? x : best),
    null,
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
  const [prediction, setPrediction] = useState<"above" | "below" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copyOpen, setCopyOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

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

  const target = scene.panel === "lab" ? predictionTarget(index) : null;
  let panel: ReactNode = null;
  let panelWidth = "lg:w-[24rem]";
  if (scene.panel === "destinations") {
    const here = index.sites.find((x) => x.id === sceneState.site && x.body === "Earth");
    panel = (
      <>
        <Destinations index={index} current={sceneState.site} onGo={go} />
        {here && <AnalogyMatrix index={index} site={here} />}
      </>
    );
    panelWidth = "lg:w-[34rem]";
  }
  if (scene.panel === "lab" && !revealed && target)
    panel = (
      <div className="rounded-xl border border-teal-300/30 bg-[#0c111c]/95 p-5" data-testid="prediction">
        <p className="text-xs tracking-widest text-teal-200">YOUR PREDICTION · LAVA BEDS</p>
        <fieldset className="mt-3">
          <legend className="text-lg text-white">
            At a simulated {target.variant.resolution_m} m grid, will the landmark group's median relief still
            exceed the sampled background?
          </legend>
          <div className="mt-4 grid gap-3 text-sm text-zinc-200">
            <label>
              <input
                type="radio"
                name="prediction"
                checked={prediction === "above"}
                onChange={() => setPrediction("above")}
              />{" "}
              Yes, still above
            </label>
            <label>
              <input
                type="radio"
                name="prediction"
                checked={prediction === "below"}
                onChange={() => setPrediction("below")}
              />{" "}
              No, at or below
            </label>
          </div>
        </fieldset>
        <button
          type="button"
          disabled={!prediction}
          className="ab-small-button mt-4 disabled:opacity-40"
          data-testid="prediction-reveal"
          onClick={() => {
            setRevealed(true);
            pause();
            sceneDispatch({
              type: "applyPreset",
              preset: {
                site: "earth",
                variantId: target.variant.id,
                exaggeration: 2,
                view: "landmark",
                compare: true,
              },
            });
          }}
        >
          Reveal the measured result <ArrowRight size={14} aria-hidden="true" className="inline" />
        </button>
        <p className="mt-3 text-xs text-zinc-400">
          This compares sampled surface relief, not cave detection.
        </p>
      </div>
    );
  if (scene.panel === "lab" && (revealed || !target))
    panel = (
      <>
        {target && <PredictionResult target={target} prediction={prediction} />}
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
          onSearch={(enabled) => {
            pause();
            sceneDispatch({ type: "setSearch", enabled });
          }}
          onReference={() => {
            pause();
            const ref = index.sites.find((x) => x.id === sceneState.site)?.nasa_reference;
            if (ref)
              sceneDispatch({ type: "applyPreset", preset: { variantId: ref.variant_id, compare: true } });
          }}
        />
      </>
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
        <button
          type="button"
          data-testid="copy-toggle"
          aria-expanded={copyOpen}
          aria-controls="story-copy-content"
          onClick={() => setCopyOpen(!copyOpen)}
          className="ab-small-button mt-2 inline-flex items-center gap-1"
        >
          {copyOpen ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronUp size={14} aria-hidden="true" />
          )}{" "}
          {copyOpen ? "Hide story" : "Show story"}
        </button>
        <div id="story-copy-content" hidden={!copyOpen}>
          <h1
            data-anim
            className="mt-2 text-[1.75rem] leading-[1.08] font-light tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
          >
            <TypedHeadline key={scene.id} text={scene.headline} />
          </h1>
          <p data-anim className={`mt-3 max-w-md text-[15px] leading-relaxed text-zinc-300 ${lgOnly}`}>
            {scene.sub}
          </p>
          <p
            data-anim
            className={`ab-takeaway mt-3 max-w-md text-sm text-zinc-200 ${scene.panel === "lab" ? lgOnly : ""}`}
          >
            <span className="ab-takeaway-label">{scene.panel === "lab" ? "CURRENT VIEW" : "FIELD NOTE"}</span>
            {scene.panel === "lab"
              ? revealed || !target
                ? labTakeaway
                : "Make a prediction before inspecting the measured result."
              : scene.takeaway}
          </p>
          {scene.panel === "legend" && (
            <div data-anim className="mt-3">
              <Legend />
            </div>
          )}
          {step.caption && <p className="mt-2 text-xs text-amber-200/90">{step.caption}</p>}
        </div>
      </div>
      {panel && (
        <div
          key={story.scene}
          data-anim="controls"
          className={`ab-panel-scroll pointer-events-auto w-full lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-10rem)] lg:justify-self-end lg:overflow-y-auto ${panelWidth}`}
        >
          <button
            type="button"
            data-testid="panel-toggle"
            aria-expanded={panelOpen}
            aria-controls="chapter-details"
            onClick={() => setPanelOpen(!panelOpen)}
            className="ab-small-button mb-2 inline-flex items-center gap-1"
          >
            {panelOpen ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronUp size={14} aria-hidden="true" />
            )}{" "}
            {panelOpen ? "Hide chapter panel" : "Show chapter panel"}
          </button>
          <div id="chapter-details" hidden={!panelOpen}>
            {panel}
          </div>
        </div>
      )}
      <div
        data-anim="controls"
        className={`pointer-events-auto flex flex-wrap items-center gap-3 lg:col-start-1 ${focusLab ? "hidden" : ""}`}
      >
        {scene.panel === "lab" && !revealed && target ? null : (
          <button
            type="button"
            data-testid="primary-action"
            onClick={act}
            className="ab-primary-action rounded-full bg-[#d5b293] px-5 py-2.5 text-sm font-medium text-[#090d16] shadow-lg transition hover:bg-[#e4c6aa]"
          >
            {scene.action.label} <ArrowRight size={14} aria-hidden="true" className="inline" />
          </button>
        )}
        {story.scene > 0 && (
          <button
            type="button"
            onClick={() => storyDispatch({ type: "goTo", scene: story.scene - 1 })}
            className="text-xs text-zinc-400 hover:text-white"
          >
            <ArrowLeft size={14} aria-hidden="true" className="inline" /> Previous
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

function PredictionResult({
  target,
  prediction,
}: {
  target: { variant: Variant; level: ExperimentLevel };
  prediction: "above" | "below" | null;
}) {
  const lm = target.level.landmark_relief_median_m;
  const bg = target.level.background_relief_median_m;
  if (lm === null || bg === null) return null;
  const above = lm > bg;
  const matched = prediction === (above ? "above" : "below");
  return (
    <p
      className="mb-2 rounded-lg bg-[#0c111c]/95 p-2.5 text-xs leading-snug text-teal-100"
      data-testid="prediction-result"
    >
      Your prediction: {prediction === "above" ? "above" : "at or below"}. At {target.variant.resolution_m} m
      the bridge-point median is {lm.toFixed(1)} m and the sampled background median is {bg.toFixed(1)} m:{" "}
      {above ? "above" : "not above"}.{" "}
      {matched ? "Your prediction matched the measurement." : "The measurement differs from your prediction."}{" "}
      This is not a detection test.
    </p>
  );
}

/** Screen readers receive the complete heading once; only the visual copy types in. */
function TypedHeadline({ text }: { text: string }) {
  const [length, setLength] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setLength(text.length);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const next = Math.min(
        text.length,
        Math.floor((performance.now() - start) / Math.min(24, 1400 / text.length)),
      );
      setLength(next);
      if (next < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, length)}
        <span className="invisible">{text.slice(length)}</span>
      </span>
    </>
  );
}
