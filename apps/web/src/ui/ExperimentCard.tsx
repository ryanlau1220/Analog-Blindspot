import type { SitesIndex } from "../data/types";
import type { SceneState } from "../scene/state";

/**
 * Relief around the GNIS bridge points vs random background points, per grid.
 * Rows that have a 3D variant can be clicked to show it.
 */
export function ExperimentCard({
  index,
  state,
  onSelect,
}: {
  index: SitesIndex;
  state: SceneState;
  onSelect: (variantId: string) => void;
}) {
  const earth = index.sites.find((s) => s.id === "earth");
  const exp = earth?.experiment;
  if (!earth || !exp) return null;
  const max = Math.max(
    ...exp.levels.flatMap((l) => [l.landmark_relief_median_m ?? 0, l.background_relief_median_m ?? 0]),
  );
  const shown = state.site === "earth" ? earth.variants.find((v) => v.id === state.variantId) : undefined;

  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2.5" data-testid="experiment">
      <div className="mb-2 flex items-center gap-3 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-amber-300" /> bridge points (median)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-zinc-500" /> random points (median)
        </span>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {exp.levels.map((lv) => {
            const variant = earth.variants.find((v) => v.resolution_m === lv.resolution_m);
            const active = shown?.resolution_m === lv.resolution_m;
            const measurable = lv.landmark_relief_median_m !== null && lv.background_relief_median_m !== null;
            const bar = (v: number | null, cls: string) => (
              <div className="h-1.5 rounded-sm bg-white/5">
                <div className={`h-1.5 rounded-sm ${cls}`} style={{ width: `${((v ?? 0) / max) * 100}%` }} />
              </div>
            );
            return (
              <tr key={lv.resolution_m} className={active ? "bg-amber-300/10" : ""}>
                <td className="w-24 py-1 pr-2 align-middle">
                  {variant ? (
                    <button
                      type="button"
                      data-testid={`exp-${variant.id}`}
                      onClick={() => onSelect(variant.id)}
                      className={`rounded px-1.5 py-0.5 ${active ? "bg-zinc-100 text-black" : "bg-white/10 text-zinc-200 hover:bg-white/20"}`}
                    >
                      {lv.resolution_m} m
                    </button>
                  ) : (
                    <span className="px-1.5 text-zinc-400">{lv.resolution_m} m</span>
                  )}
                  <span className="ml-1 text-[9px] uppercase text-zinc-500">
                    {lv.observed ? "obs" : "sim"}
                  </span>
                </td>
                <td className="py-1 align-middle">
                  {measurable ? (
                    <div className="flex flex-col gap-0.5">
                      {bar(lv.landmark_relief_median_m, "bg-amber-300")}
                      {bar(lv.background_relief_median_m, "bg-zinc-500")}
                    </div>
                  ) : (
                    <span className="text-zinc-500">not measurable at this grid</span>
                  )}
                </td>
                <td className="w-20 py-1 pl-2 text-right align-middle font-mono text-[11px] text-zinc-300">
                  {measurable
                    ? `${lv.landmark_relief_median_m?.toFixed(1)} / ${lv.background_relief_median_m?.toFixed(1)}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500">
        Relief = {exp.measure}, in metres. {exp.background_note}. {exp.caveat}
      </p>
    </div>
  );
}
