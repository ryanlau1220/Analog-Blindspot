import type { Site, Variant } from "../data/types";
import type { SceneState } from "../scene/state";

export function SourcePanel({
  site,
  variant,
  state,
  compact = false,
}: {
  site: Site;
  variant: Variant;
  state: SceneState;
  /** story mode: on small screens keep only the title and data badge */
  compact?: boolean;
}) {
  const detail = compact ? "hidden sm:block" : "";
  const p = site.provenance;
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex max-w-sm flex-col gap-3 sm:left-6 sm:top-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">{site.body}</p>
        <h1 className="text-2xl font-light text-white sm:text-3xl">{site.name}</h1>
      </div>

      <div
        data-testid="variant-badge"
        className={`pointer-events-auto rounded-md border px-3 py-2 text-sm ${
          variant.observed
            ? "border-emerald-400/40 bg-emerald-950/60 text-emerald-100"
            : "border-fuchsia-400/60 bg-fuchsia-950/70 text-fuchsia-100"
        }`}
      >
        <p className="font-semibold">{variant.observed ? "OBSERVED DATA" : "SIMULATED COARSENING"}</p>
        <p className="mt-0.5 text-xs opacity-90">{variant.label}</p>
        {compact && (
          <p className="mt-0.5 text-[11px] opacity-80 sm:hidden">
            ×{state.exaggeration} vertical ·{" "}
            <a className="underline" href={site.provenance.landing_page} target="_blank" rel="noreferrer">
              {site.provenance.product_id}
            </a>
          </p>
        )}
      </div>

      <div
        className={`${detail} pointer-events-auto rounded-md bg-black/55 px-3 py-2 text-xs leading-relaxed text-zinc-300 backdrop-blur`}
      >
        <p>
          Source:{" "}
          <a className="text-sky-300 underline" href={p.landing_page} target="_blank" rel="noreferrer">
            {p.product_id}
          </a>
          {p.doi && (
            <>
              {" · "}
              <a
                className="text-sky-300 underline"
                href={`https://doi.org/${p.doi}`}
                target="_blank"
                rel="noreferrer"
              >
                doi:{p.doi}
              </a>
            </>
          )}
        </p>
        <p>
          {p.license}
          {p.credit ? ` · ${p.credit}` : ""}
        </p>
        <p>
          {site.extent_m.toFixed(0)} m square · display mesh {variant.display.grid}² at{" "}
          {variant.display.cell_m.toFixed(1)} m · relief texture{" "}
          {Number(variant.normal_map.m_per_px.toPrecision(3))} m/px
        </p>
        <p>Heights: {site.vertical}</p>
        <p className={state.exaggeration === 1 ? "" : "font-semibold text-amber-200"}>
          Vertical exaggeration ×{state.exaggeration}
          {state.exaggeration === 1 ? " (true scale)" : ""}
        </p>
      </div>

      <div
        className={`${detail} pointer-events-auto rounded-md bg-black/55 px-3 py-2 text-xs text-zinc-300 backdrop-blur`}
      >
        <p className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,#101014_0_3px,#3a3a46_3px_6px)]" />
          Below the surface: <span className="text-zinc-100">not measured</span> (block depth is display only)
        </p>
        {variant.elevation.nan_count > 0 && (
          <p className="mt-1 flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-sm bg-[repeating-linear-gradient(45deg,#1a0b1a_0_3px,#a8329a_3px_5px)]" />
            Hole in the surface, magenta in a section: no elevation data ({variant.elevation.nan_count} posts)
          </p>
        )}
      </div>
    </div>
  );
}
