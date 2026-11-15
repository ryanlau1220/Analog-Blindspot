import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { AnomalySearch, AnomalySearchLevel, NasaReference, SiteId, SitesIndex } from "../data/types";
import type { SceneState } from "../scene/state";
import { holdoutSentence } from "../story/scenes";
import { levelUncertainty, type Range } from "./uncertainty";

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
  onSearch,
  onReference,
}: {
  index: SitesIndex;
  state: SceneState;
  onVariant: (id: string) => void;
  onSite: (site: SiteId) => void;
  onCompare: (on: boolean) => void;
  onDetails: () => void;
  focused: boolean;
  onFocus: () => void;
  onSearch: (on: boolean) => void;
  /** show the NASA reference grid against the observed grid */
  onReference: () => void;
}) {
  const sites = index.sites.filter((s) => s.experiment && POINTS[s.id]);
  const site = sites.find((s) => s.id === state.site) ?? sites[0];
  if (!site?.experiment) return null;
  const exp = site.experiment;
  const variants = site.variants;
  const ref = site.nasa_reference;
  const isRef = !!ref && state.variantId === ref.variant_id;
  const shownId = isRef ? ref.comparison.against_variant_id : state.variantId;
  const i = Math.max(
    variants.findIndex((v) => v.id === shownId),
    0,
  );
  const v = variants[i];
  if (!v) return null;
  const searchLevel = exp.search?.levels.find((l) => l.resolution_m === v.resolution_m);
  const level = exp.levels.find((l) => l.resolution_m === v.resolution_m);
  const lm = level?.landmark_relief_median_m ?? null;
  const bg = level?.background_relief_median_m ?? null;
  const measurable = lm !== null && bg !== null;
  const stands = measurable && lm > bg;
  const max = Math.max(
    ...exp.levels.flatMap((l) => [l.landmark_relief_median_m ?? 0, l.background_relief_median_m ?? 0]),
  );
  const label = POINTS[site.id] ?? "Features";
  const unc = level ? levelUncertainty(level) : null;
  const uncParts: ReactNode[] = [];
  if (unc && unc.n > 0) uncParts.push(`n = ${unc.n} named points (approximate positions)`);
  if (unc?.seedRange)
    uncParts.push(
      <span
        key="seeds"
        title="Spread of the background median across random seeds; not a confidence interval"
      >
        background median across {unc.seeds} seeds: {fmtRange(unc.seedRange)} (not a confidence interval)
      </span>,
    );
  if (unc?.pointRange) uncParts.push(`points range ${fmtRange(unc.pointRange)}`);

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
          {focused ? (
            <>
              Exit focus <ArrowDownLeft size={14} aria-hidden="true" className="inline" />
            </>
          ) : (
            <>
              Focus experiment <ArrowUpRight size={14} aria-hidden="true" className="inline" />
            </>
          )}
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
        {isRef && ref ? (
          <ReferencePanel ref_={ref} />
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-widest text-zinc-400">
              Relief within {exp.radius_m} m (median)
            </p>
            {measurable ? (
              <>
                <Bar label={label} value={lm} max={max} cls="bg-teal-300" />
                <Bar
                  label="Random ground"
                  value={bg}
                  max={max}
                  cls="bg-zinc-500"
                  band={unc?.seedRange ?? null}
                />
                {uncParts.length > 0 && (
                  <p className="mt-1.5 text-[10px] leading-snug text-zinc-400" data-testid="lab-uncertainty">
                    {uncParts.map((part, k) => (
                      <Fragment key={typeof part === "string" ? part : "seeds"}>
                        {k > 0 && " · "}
                        {part}
                      </Fragment>
                    ))}
                  </p>
                )}
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
            {exp.search && searchLevel && (
              <SearchLine
                search={exp.search}
                level={searchLevel}
                label={label.toLowerCase()}
                on={state.search}
                onSearch={onSearch}
              />
            )}
          </>
        )}
      </div>
      {ref && !isRef && (
        <button
          type="button"
          data-testid="nasa-reference"
          onClick={onReference}
          className="mt-2 w-full rounded-lg border border-sky-300/40 bg-sky-950/30 px-3 py-1.5 text-left text-xs text-sky-100 hover:bg-sky-900/40"
        >
          Check the simulation against real NASA data: {ref.product_id} {ref.resolution_m} m{" "}
          <ArrowRight size={14} aria-hidden="true" className="inline" />
        </button>
      )}
      {isRef && (
        <button
          type="button"
          onClick={() => onVariant(v.id)}
          className="mt-2 text-xs text-zinc-300 underline hover:text-white"
        >
          <ArrowLeft size={14} aria-hidden="true" className="inline" /> Back to the simulated {v.resolution_m}{" "}
          m grid
        </button>
      )}

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

function ReferencePanel({ ref_ }: { ref_: NasaReference }) {
  const c = ref_.comparison;
  return (
    <div data-testid="nasa-reference-panel">
      <p className="text-[10px] uppercase tracking-widest text-sky-200">
        Independent NASA observation · {ref_.product_id}
      </p>
      <p className="mt-1.5 text-sm text-zinc-100">
        Real {ref_.resolution_m} m radar terrain (right) against the observed LiDAR (left).
      </p>
      <p className="mt-1.5 text-xs leading-snug text-zinc-300" data-testid="nasa-reference-stats">
        Against our simulated {ref_.resolution_m} m grid, cell by cell ({c.cells.toLocaleString()} cells): r ={" "}
        {c.pearson_r.toFixed(3)}, RMSE {c.rmse_m.toFixed(1)} m ({c.rmse_detrended_m.toFixed(1)} m after
        removing the {Math.abs(c.bias_m).toFixed(1)} m mean offset). The simulated grid agrees closely in
        overall elevation; equivalence for individual features remains unverified.
      </p>
      <p className="mt-1 text-[10px] text-zinc-500">
        {c.note} {ref_.citation}
      </p>
    </div>
  );
}

function SearchLine({
  search,
  level,
  label,
  on,
  onSearch,
}: {
  search: AnomalySearch;
  level: AnomalySearchLevel;
  label: string;
  on: boolean;
  onSearch: (on: boolean) => void;
}) {
  const measurable = level.threshold_m !== null;
  const chance = level.random_recovered_fraction;
  return (
    <div className="mt-3 border-t border-white/10 pt-2" data-testid="lab-search">
      <p className="text-[10px] uppercase tracking-widest text-zinc-400">Systematic search across the ROI</p>
      {measurable ? (
        <p className="mt-1 text-xs leading-snug text-zinc-200" data-testid="lab-search-result">
          {level.landmarks_recovered} of {level.landmark_count} named {label} lie within{" "}
          {search.match_radius_m} m of a top-{100 - search.percentile}% relief point
          {chance !== null && ` (random positions: ${Math.round(chance * 100)}%)`}.{" "}
          {level.candidates.length > 0 &&
            `${level.candidates.length} unverified anomalies away from named points.`}
        </p>
      ) : (
        <p className="mt-1 text-xs text-amber-200">
          Not measurable at {level.resolution_m} m with this radius.
        </p>
      )}
      {holdoutSentence(level, search.match_radius_m) && (
        <p className="mt-1 text-[11px] leading-snug text-emerald-200/90" data-testid="lab-holdout">
          {holdoutSentence(level, search.match_radius_m)}
        </p>
      )}
      {measurable && level.candidates.length > 0 && (
        <label className="mt-1.5 flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => onSearch(e.target.checked)}
            className="accent-amber-300"
            data-testid="search-toggle"
          />
          Show unverified anomalies (amber rings; green = next to a mapped cave entrance). Many may be roads,
          scarps or cliffs
        </label>
      )}
    </div>
  );
}

function fmtRange(r: Range): string {
  return r.min.toFixed(1) === r.max.toFixed(1)
    ? `${r.min.toFixed(1)} m`
    : `${r.min.toFixed(1)}–${r.max.toFixed(1)} m`;
}

function Bar({
  label,
  value,
  max,
  cls,
  band = null,
}: {
  label: string;
  value: number;
  max: number;
  cls: string;
  band?: Range | null;
}) {
  const frac = (x: number) => (max > 0 ? Math.min(Math.max(x / max, 0), 1) : 0);
  return (
    <div className="mt-1.5 grid grid-cols-[6.5rem_1fr_3.2rem] items-center gap-2 text-xs">
      <span className="text-zinc-300">{label}</span>
      <span className="relative h-2 rounded-full bg-white/5">
        <span
          className={`block h-2 rounded-full ${cls} motion-safe:transition-[transform] motion-safe:duration-500 origin-left`}
          style={{ transform: `scaleX(${max > 0 ? value / max : 0})` }}
        />
        {band && (
          <span
            aria-hidden="true"
            data-testid="lab-seed-band"
            className="absolute -top-0.5 h-3 rounded-sm bg-zinc-200/40 ring-1 ring-zinc-100/50"
            style={{
              left: `${frac(band.min) * 100}%`,
              width: `max(2px, ${(frac(band.max) - frac(band.min)) * 100}%)`,
            }}
          />
        )}
      </span>
      <span className="text-right font-mono text-zinc-100">{value.toFixed(1)} m</span>
    </div>
  );
}
