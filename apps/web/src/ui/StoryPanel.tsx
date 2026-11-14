import gsap from "gsap";
import { type Dispatch, type ReactNode, useLayoutEffect, useRef } from "react";
import type { SitesIndex } from "../data/types";
import type { SceneAction, SceneState } from "../scene/state";
import type { StoryScene } from "../story/scenes";
import type { StoryAction, StoryState } from "../story/story";
import { CandidatesCard } from "./CandidatesCard";
import { DecisionCard } from "./DecisionCard";
import { ExperimentCard } from "./ExperimentCard";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function StoryPanel({
  index,
  scenes,
  story,
  storyDispatch,
  scene: sceneState,
  sceneDispatch,
}: {
  index: SitesIndex;
  scenes: StoryScene[];
  story: StoryState;
  storyDispatch: Dispatch<StoryAction>;
  scene: SceneState;
  sceneDispatch: Dispatch<SceneAction>;
}) {
  const scene = scenes[story.scene];
  const step = scene?.steps[story.step];
  const body = useRef<HTMLDivElement>(null);

  // Cancellable entrance animation per chapter; reverted if the chapter changes mid-tween.
  // biome-ignore lint/correctness/useExhaustiveDependencies: animate on chapter change only
  useLayoutEffect(() => {
    if (!body.current || reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-anim]", { y: 14, opacity: 0, duration: 0.55, stagger: 0.08, ease: "power2.out" });
    }, body);
    return () => ctx.revert();
  }, [story.scene]);

  if (!scene || !step) return null;
  let panel: ReactNode = null;
  if (scene.panel === "candidates") panel = <CandidatesCard candidates={index.candidates} />;
  if (scene.panel === "experiment")
    panel = (
      <ExperimentCard
        index={index}
        state={sceneState}
        onSelect={(variantId) => {
          storyDispatch({ type: "pause" });
          sceneDispatch({ type: "selectVariant", variantId });
        }}
        onSite={(site) => {
          storyDispatch({ type: "pause" });
          sceneDispatch({ type: "applyPreset", preset: { site, exaggeration: 2, view: "landmark" } });
        }}
      />
    );
  if (scene.panel === "decision") panel = <DecisionCard index={index} />;

  return (
    <section
      data-testid="story-panel"
      aria-live="polite"
      className="absolute inset-x-0 bottom-0 flex max-h-[58dvh] flex-col rounded-t-xl border-t border-white/10 bg-zinc-950/85 backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-h-[min(70dvh,44rem)] sm:w-[27rem] sm:rounded-xl sm:border"
    >
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-3">
        <p data-anim className="text-[10px] uppercase tracking-[0.25em] text-amber-300/80">
          {scene.chapter}
        </p>
        <h2 data-anim className="mt-1 text-xl font-light leading-snug text-white sm:text-2xl">
          {scene.headline}
        </h2>
        {scene.body.map((p) => (
          <p data-anim key={p} className="mt-2 text-sm leading-relaxed text-zinc-300">
            {p}
          </p>
        ))}
        {step.caption && (
          <p className="mt-2 text-xs italic text-amber-200/90" data-testid="step-caption">
            {step.caption}
          </p>
        )}
        {panel && (
          <div data-anim className="mt-3">
            {panel}
          </div>
        )}
      </div>

      <nav
        className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5"
        aria-label="Story chapters"
      >
        <button
          type="button"
          onClick={() => storyDispatch({ type: "prev" })}
          disabled={story.scene === 0 && story.step === 0}
          className="rounded px-2 py-1 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-30"
          aria-label="Previous"
        >
          ←
        </button>
        <ol className="flex flex-1 items-center justify-center gap-1.5">
          {scenes.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                data-testid={`chapter-${s.id}`}
                aria-current={i === story.scene ? "step" : undefined}
                title={s.chapter}
                onClick={() => storyDispatch({ type: "goTo", scene: i })}
                className={`h-2.5 rounded-full transition-all ${
                  i === story.scene ? "w-6 bg-amber-300" : "w-2.5 bg-zinc-600 hover:bg-zinc-400"
                }`}
              >
                <span className="sr-only">{s.chapter}</span>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          data-testid="play-toggle"
          onClick={() => storyDispatch({ type: story.playing ? "pause" : "play" })}
          className="rounded px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
        >
          {story.playing ? "❚❚ Pause" : "▶ Replay"}
        </button>
        <button
          type="button"
          onClick={() => storyDispatch({ type: "next" })}
          disabled={story.scene === scenes.length - 1 && story.step === scene.steps.length - 1}
          className="rounded px-2 py-1 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-30"
          aria-label="Next"
        >
          →
        </button>
        <button
          type="button"
          data-testid="explore-toggle"
          onClick={() => storyDispatch({ type: "explore" })}
          className="ml-1 rounded border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
        >
          Explore
        </button>
      </nav>
    </section>
  );
}
