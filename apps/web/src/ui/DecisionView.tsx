import type { SitesIndex } from "../data/types";

export function DecisionView({ index }: { index: SitesIndex }) {
  const earth = index.sites.find((site) => site.id === "earth");
  const lanz = index.sites.find((site) => site.id === "lanzarote");
  return (
    <section data-testid="decision-view" className="rounded-xl border border-white/10 bg-[#0c111c]/95 p-4">
      <p className="text-[10px] tracking-[.2em] text-teal-200">
        MISSION DECISION · EARTH ANALOG INVESTIGATION
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <article className="rounded-lg border border-teal-200/30 bg-teal-950/25 p-4">
          <p className="text-xs tracking-widest text-teal-200">01 / {earth?.name ?? "Lava Beds"}</p>
          <h2 className="mt-2 text-lg text-white">Fine-scale surface clues</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Investigate surface expression around documented lava-tube environments using the observed LiDAR.
          </p>
        </article>
        <article className="rounded-lg border border-amber-200/30 bg-amber-950/20 p-4">
          <p className="text-xs tracking-widest text-amber-200">02 / {lanz?.name ?? "Lanzarote"}</p>
          <h2 className="mt-2 text-lg text-white">Larger collapse openings</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Investigate mapped jameos and compare their surface relief under simulated coarser sampling.
          </p>
        </article>
      </div>
      <p className="mt-3 border-l-2 border-amber-200 pl-3 text-sm text-zinc-200">
        <b>Still unknown:</b> lunar subsurface geometry. Surface elevation alone does not establish a lunar
        match.
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        Next: map surface features and survey a known tube interior, subject to field access. These are
        established sites, not newly discovered analogs.
      </p>
    </section>
  );
}
