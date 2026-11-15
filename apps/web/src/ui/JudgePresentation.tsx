import { ArrowLeft, ArrowRight, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SitesIndex } from "../data/types";
import type { ScenePreset } from "../scene/state";
import { findFeaturedAnomaly } from "../story/featuredAnomaly";

/** A separate, uninterrupted presentation; the full research experience remains available. */
export function JudgePresentation({
  index,
  apply,
  onExit,
}: {
  index: SitesIndex;
  apply: (preset: ScenePreset) => void;
  onExit: () => void;
}) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const earth = index.sites.find((s) => s.id === "earth");
  const observed = earth?.variants.find((v) => v.observed);
  const level = earth?.experiment?.search?.levels.find((l) => l.observed);
  const candidate = findFeaturedAnomaly(level);
  const search = earth?.experiment?.search;
  const comparison = earth?.experiment?.levels.find((item) => item.resolution_m === 10);
  const slides: {
    label: string;
    title: string;
    text: string;
    detail: string;
    preset: ScenePreset;
    ms: number;
  }[] = [
    {
      label: "01 / THE QUESTION",
      title: "Could this pit shelter future explorers?",
      text: "Marius Hills Pit is real. What lies beneath remains unknown.",
      detail: "LROC terrain measures the surface, not the pit interior or habitability.",
      preset: {
        site: "moon",
        view: "hero",
        drape: "orthophoto",
        cutaway: false,
        compare: false,
        search: false,
        exaggeration: 1,
      },
      ms: 15000,
    },
    {
      label: "02 / THE BLIND SPOT",
      title: "A map cannot show what it never measured.",
      text: "The magenta region marks missing elevation. The underground is unobserved.",
      detail: "A possible lava tube is a research question, not a confirmed shelter.",
      preset: {
        site: "moon",
        view: "section",
        cutaway: true,
        cutPosition: "landmark",
        compare: false,
        search: false,
        exaggeration: 2,
      },
      ms: 15000,
    },
    {
      label: "03 / THE EXPERIMENT",
      title: "Test the blind spot on Earth.",
      text: "Watch the same ground change from observed LiDAR to a simulated 10 m grid.",
      detail:
        comparison?.landmark_relief_median_m != null && comparison.background_relief_median_m != null
          ? `At 10 m, the sampled bridge-point median is ${comparison.landmark_relief_median_m.toFixed(1)} m; background is ${comparison.background_relief_median_m.toFixed(1)} m. This is not a cave-detection test.`
          : "Grid averaging is a simulation, not a lunar sensor model.",
      preset: {
        site: "earth",
        variantId: earth?.variants.find((v) => v.resolution_m === 10)?.id,
        view: "feature",
        cutaway: false,
        compare: true,
        search: false,
        exaggeration: 2,
      },
      ms: 16000,
    },
    {
      label: "04 / THE INVESTIGATION",
      title: "Search the whole landscape.",
      text: level
        ? `${level.flagged_points} high-relief points across ${level.lattice_points.toLocaleString()} sampled locations.`
        : "Flag unusually high relief across the search region.",
      detail:
        "Amber rings mark unverified clusters. Green rings are near mapped cave entrances; neither is proof of a cave.",
      preset: {
        site: "earth",
        variantId: observed?.id,
        view: "overview",
        cutaway: false,
        compare: false,
        search: true,
        featuredAnomaly: null,
        exaggeration: 2,
      },
      ms: 9000,
    },
    {
      label: "05 / THE LEAD",
      title: "A lead, not a discovery.",
      text:
        level && candidate
          ? `${level.candidate_clusters} unverified clusters. The highlighted lead has ${candidate.relief_m.toFixed(1)} m of local relief within a ${search?.radius_m} m radius.`
          : "The terrain search highlights unverified leads for investigation.",
      detail:
        level && search
          ? `${level.holdout_recovered} of ${level.holdout_count} mapped cave entrances lie within ${search.match_radius_m} m of a flagged point; random positions: ${Math.round((level.random_recovered_fraction ?? 0) * 100)}%. Roads and cliffs can also be flagged.`
          : "High relief is not proof of a cave; other terrain can look similar.",
      preset: {
        site: "earth",
        variantId: observed?.id,
        view: "anomaly",
        cutaway: false,
        compare: false,
        search: true,
        featuredAnomaly: candidate ? { x_m: candidate.x_m, y_m: candidate.y_m } : null,
        exaggeration: 2,
      },
      ms: 18000,
    },
    {
      label: "06 / THE NEXT STEP",
      title: "Find the clues. Verify what matters.",
      text: "Use Earth analogs to plan targeted observations, then verify promising terrain in the field.",
      detail:
        "Next: inspect high-resolution imagery, survey the anomaly, and check for a subsurface opening.",
      preset: {
        site: "earth",
        variantId: observed?.id,
        view: "anomaly",
        cutaway: false,
        compare: false,
        search: true,
        featuredAnomaly: candidate ? { x_m: candidate.x_m, y_m: candidate.y_m } : null,
        exaggeration: 2,
      },
      ms: 17000,
    },
  ];
  const slide = slides[step];
  // Presets only change when navigating, not while the timer or play state changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: slide data is derived from a stable index
  useEffect(() => {
    if (slide) apply(slide.preset);
  }, [step, index]);
  const duration = slide?.ms;
  useEffect(() => {
    if (!playing || duration === undefined) return;
    const timer = window.setTimeout(() => {
      if (step === slides.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [playing, step, duration, slides.length]);
  if (!slide) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-r from-[#090d16]/90 via-[#090d16]/25 to-transparent p-4 sm:p-8"
      data-testid="judge-presentation"
    >
      <header className="pointer-events-auto flex items-center justify-between gap-4">
        <p className="text-xs font-semibold tracking-[.2em] text-teal-200">
          ANALOG BLINDSPOT / JUDGE PRESENTATION
        </p>
        <button
          type="button"
          onClick={onExit}
          className="ab-small-button inline-flex min-h-11 items-center gap-1"
        >
          <X size={16} aria-hidden="true" /> Exit
        </button>
      </header>
      <main
        className="pointer-events-auto max-h-[75dvh] max-w-xl overflow-y-auto rounded-xl bg-[#090d16]/85 p-5 sm:p-7"
        aria-live="polite"
      >
        <p className="text-xs tracking-[.2em] text-teal-200">{slide.label}</p>
        <h1 className="mt-3 text-3xl leading-tight text-white sm:text-5xl">{slide.title}</h1>
        <p className="mt-4 text-base text-zinc-100 sm:text-lg">{slide.text}</p>
        <p className="mt-3 border-l-2 border-amber-300 pl-3 text-sm text-zinc-300">{slide.detail}</p>
        <nav aria-label="Presentation controls" className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="ab-small-button min-h-11"
            disabled={step === 0}
            onClick={() => {
              setPlaying(false);
              setStep(step - 1);
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Previous
          </button>
          <button
            type="button"
            className="ab-small-button min-h-11"
            onClick={() => {
              if (!playing && step === slides.length - 1) setStep(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{" "}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="ab-small-button min-h-11"
            disabled={step === slides.length - 1}
            onClick={() => {
              setPlaying(false);
              setStep(step + 1);
            }}
          >
            Next <ArrowRight size={16} aria-hidden="true" />
          </button>
          {step === slides.length - 1 && (
            <a className="ab-small-button inline-flex min-h-11 items-center" href="#brief">
              Open validation brief
            </a>
          )}
          <span className="ml-2 text-xs text-zinc-400">
            {step + 1} / {slides.length} · about 90 seconds
          </span>
        </nav>
      </main>
    </div>
  );
}
