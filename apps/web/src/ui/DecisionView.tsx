import { useState } from "react";
import type { SitesIndex } from "../data/types";
import {
  computedGrids,
  lunarProducts,
  marsContext,
  requirementStatement,
  siteRequirements,
  type Verdict,
  verdictAt,
} from "../story/requirement";

const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  above: { text: "stands out", cls: "text-teal-200" },
  not_above: { text: "does not stand out", cls: "text-amber-200" },
  not_measurable: { text: "not measurable (too few cells)", cls: "text-zinc-400" },
  not_computed: { text: "not computed", cls: "text-zinc-500" },
};

/**
 * Chapter 5: the decision. Leads with the resolution requirement the data
 * supports, lets the user test "what if the map had a G m grid?" on the
 * computed grids only, then the site roles and the unknown.
 */
export function DecisionView({ index }: { index: SitesIndex }) {
  const grids = computedGrids(index);
  const reqs = siteRequirements(index);
  const products = lunarProducts(index);
  const statement = requirementStatement(index);
  const nac = products[0]?.grid_m;
  const [grid, setGrid] = useState<number>(() => (nac && grids.includes(nac) ? nac : (grids[0] ?? 0)));
  const coarser = products.filter((p) => p.grid_m > Math.max(...grids));

  return (
    <section data-testid="decision-view" className="rounded-xl border border-white/10 bg-[#0c111c]/95 p-4">
      <p className="text-[10px] tracking-[.2em] text-teal-200">THE RESOLUTION REQUIREMENT</p>
      {statement && (
        <p className="mt-2 text-[15px] leading-snug text-white" data-testid="requirement">
          {statement}
        </p>
      )}

      <div className="mt-3 rounded-lg border border-white/10 p-3" data-testid="what-if">
        <p className="text-xs text-zinc-300">What if the map had a grid of…</p>
        <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Terrain grid">
          {grids.map((g) => (
            // biome-ignore lint/a11y/useSemanticElements: compact pill radio
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={g === grid}
              data-testid={`whatif-${g}`}
              onClick={() => setGrid(g)}
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                g === grid ? "bg-zinc-100 text-black" : "bg-white/10 text-zinc-200 hover:bg-white/20"
              }`}
            >
              {g} m{g === nac ? " · Marius DTM" : ""}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-1 text-sm" aria-live="polite">
          {reqs.map((r) => {
            const exp = index.sites.find((s) => s.id === r.siteId)?.experiment;
            const v = exp ? verdictAt(exp, grid) : "not_computed";
            const obs = grid === r.observed;
            return (
              <li key={r.siteId} data-testid={`whatif-result-${r.siteId}`}>
                <span className="text-zinc-300">
                  {r.name} {r.features}:
                </span>{" "}
                <span className={VERDICT[v].cls}>{VERDICT[v].text}</span>
                <span className="text-[11px] text-zinc-500">
                  {" "}
                  ({obs ? "observed" : v === "not_computed" ? "grid not in this site's series" : "simulated"})
                </span>
              </li>
            );
          })}
        </ul>
        {coarser.map((p) => (
          <p key={p.name} className="mt-2 text-[11px] text-zinc-400">
            {p.name}: about {p.grid_m.toFixed(0)} m ({p.note}), coarser than every grid tested here.
          </p>
        ))}
        {marsContext(index) && (
          <p className="mt-2 text-[11px] text-zinc-400" data-testid="mars-context">
            {marsContext(index)}
          </p>
        )}
        <p className="mt-1 text-[10px] text-zinc-500">
          Point medians against sampled background on block-averaged grids; a stereo DTM is not a block mean.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {reqs.map((r, k) => (
          <article
            key={r.siteId}
            className={`rounded-lg border p-3 ${k === 0 ? "border-teal-200/30 bg-teal-950/25" : "border-amber-200/30 bg-amber-950/20"}`}
          >
            <p className={`text-[10px] tracking-widest ${k === 0 ? "text-teal-200" : "text-amber-200"}`}>
              0{k + 1} / {r.name}
            </p>
            <h2 className="mt-1 text-base text-white">
              {k === 0 ? "Test the fine-scale limit" : "Test larger collapse openings"}
            </h2>
            <p className="mt-1 text-xs text-zinc-300">
              {r.keptThrough !== null
                ? `Stands out through ${r.keptThrough} m${r.lostAt !== null ? `, not at ${r.lostAt} m` : ""}${
                    r.unmeasurableFrom !== null ? `; ${r.unmeasurableFrom} m not measurable` : ""
                  }.`
                : "No grid where the points stand out."}
            </p>
          </article>
        ))}
      </div>
      <p className="mt-3 border-l-2 border-amber-200 pl-3 text-sm text-zinc-200">
        <b>Still unknown:</b> whether the pit opens into a cave. No dataset here measures the subsurface.
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        Next: field-check the unverified relief anomalies from the lattice search, map feature outlines to
        score detection, and survey the inside of a known tube. Lava Beds and Lanzarote are known analog
        sites; the anomalies are where new clues could be.
      </p>
    </section>
  );
}
