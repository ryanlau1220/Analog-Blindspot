import type { SiteId, SitesIndex } from "../data/types";
import type { SceneState } from "../scene/state";

const POINTS: Partial<Record<SiteId, string>> = { earth: "Bridges", lanzarote: "Jameos" };
const SHORT: Partial<Record<SiteId, string>> = { earth: "Lava Beds", lanzarote: "Lanzarote" };

/**
 * Chapter 4 control: a scrubber that snaps only to the computed grids (no
 * in-between resolutions), the split-view toggle, and one prominent changing
 * measurement taken from sites.json for the grid on screen.
 */
export function ResolutionLab({
  index,
  state,
  onVariant,
  onSite,
  onCompare,
  onDetails,
  focused,
  onFocus,
}: {
  index: SitesIndex;
  state: SceneState;
  onVariant: (id: string) => void;
  onSite: (site: SiteId) => void;
  onCompare: (on: boolean) => void;
  onDetails: () => void;
  focused: boolean;
  onFocus: () => void;
}) {
  const sites = index.sites.filter((s) => s.experiment && POINTS[s.id]);
  const site = sites.find((s) => s.id === state.site) ?? sites[0];
  if (!site?.experiment) return null;
  const exp = site.experiment;
  const variants = site.variants;
  const i = Math.max(
    variants.findIndex((v) => v.id === state.variantId),
    0,
  );
  const v = variants[i];
  if (!v) return null;
  const level = exp.levels.find((l) => l.resolution_m === v.resolution_m);
  const lm = level?.landmark_relief_median_m ?? null;
  const bg = level?.background_relief_median_m ?? null;
  const measurable = lm !== null && bg !== null;
  const stands = measurable && lm > bg;
  const max = Math.max(
    ...exp.levels.flatMap((l) => [l.landmark_relief_median_m ?? 0, l.background_relief_median_m ?? 0]),
  );
  const label = POINTS[site.id] ?? "Features";

  return (
    <div
      data-testid="resolution-lab"
      className="rounded-xl border border-white/10 bg-[#0c111c]/85 p-3.5 backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-teal-200">Resolution experiment</span>
        <button
          type="button"
          data-testid="focus-lab"
          aria-pressed={focused}
          onClick={onFocus}
          className="ab-small-button"
        >
          {focused ? "Exit focus ↙" : "Focus experiment ↗"}
        </button>
      </div>
      {sites.length > 1 && (
        <div className="mb-3 flex gap-1">
          {sites.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === site.id}
              data-testid={`exp-site-${s.id}`}
              onClick={() => onSite(s.id)}
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                s.id === site.id ? "bg-zinc-100 text-black" : "bg-white/10 text-zinc-200 hover:bg-white/20"
              }`}
            >
              {SHORT[s.id] ?? s.name}
            </button>
          ))}
        </div>
      )}

      <label htmlFor="grid-scrub" className="text-[10px] uppercase tracking-widest text-zinc-400">
        Terrain grid
      </label>
      <input
        id="grid-scrub"
        data-testid="grid-scrub"
        type="range"
        min={0}
        max={variants.length - 1}
        step={1}
        value={i}
        aria-valuetext={`${v.resolution_m} m, ${v.observed ? "observed" : "simulated"}`}
        onChange={(e) => {
          const next = variants[Number(e.target.value)];
          if (next) onVariant(next.id);
        }}
        className="mt-1 w-full accent-teal-300"
      />
      <div className="mt-0.5 flex justify-between text-[10px]">
        {variants.map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`variant-${x.id}`}
            onClick={() => onVariant(x.id)}
            className={`rounded px-1 ${x.id === v.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {x.resolution_m} m
            <span className="block text-[9px] uppercase">{x.observed ? "observed" : "simulated"}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3" aria-live="polite">
        <p className="text-[10px] uppercase tracking-widest text-zinc-400">
          Relief within {exp.radius_m} m (median)
        </p>
        {measurable ? (
          <>
            <Bar label={label} value={lm} max={max} cls="bg-teal-300" />
            <Bar label="Random ground" value={bg} max={max} cls="bg-zinc-500" />
            <p
              className={`mt-2 text-sm ${stands ? "text-teal-200" : "text-amber-200"}`}
              data-testid="lab-verdict"
            >
              {stands
                ? `Point median is above the sampled background median at ${v.resolution_m} m.`
                : `Point median is at or below the sampled background median at ${v.resolution_m} m.`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-amber-200" data-testid="lab-verdict">
            Not measurable at {v.resolution_m} m: a {exp.radius_m} m circle covers too few cells.
          </p>
        )}
      </div>

      <details className="mt-2 text-[11px] leading-snug text-zinc-400">
        <summary className="cursor-pointer py-1 text-zinc-300">How this experiment works</summary>
        <ol className="ab-method">
          <li>Observed LiDAR terrain</li>
          <li>Average into computed grid cells</li>
          <li>Measure point and background relief</li>
          <li>Choose a field validation question</li>
        </ol>
        <p>
          Grid spacing is not effective instrument resolution. The shared display mesh and per-grid shading
          are visualizations; block averaging is a simulation, not a lunar sensor model.
        </p>
      </details>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={state.compare}
            onChange={(e) => onCompare(e.target.checked)}
            className="accent-teal-300"
            data-testid="compare-toggle"
          />
          Split view against the observed grid
        </label>
        <button type="button" onClick={onDetails} className="text-zinc-400 underline hover:text-white">
          Evidence table
        </button>
      </div>
    </div>
  );
}

function Bar({ label, value, max, cls }: { label: string; value: number; max: number; cls: string }) {
  return (
    <div className="mt-1.5 grid grid-cols-[6.5rem_1fr_3.2rem] items-center gap-2 text-xs">
      <span className="text-zinc-300">{label}</span>
      <span className="h-2 rounded-full bg-white/5">
        <span
          className={`block h-2 rounded-full ${cls} motion-safe:transition-[transform] motion-safe:duration-500 origin-left`}
          style={{ transform: `scaleX(${max > 0 ? value / max : 0})` }}
        />
      </span>
      <span className="text-right font-mono text-zinc-100">{value.toFixed(1)} m</span>
    </div>
  );
}
