import type { Site, SitesIndex } from "../data/types";
import { type AnalogyStatus, analogyRows, analogySummary, CITATIONS } from "../story/analogy";

const CHIP: Record<AnalogyStatus, { label: string; cls: string }> = {
  holds: { label: "holds", cls: "border-teal-300/50 text-teal-200" },
  breaks: { label: "breaks", cls: "border-rose-300/50 text-rose-200" },
  measured: { label: "measured here", cls: "border-sky-300/50 text-sky-200" },
  unknown: { label: "unknown", cls: "border-dashed border-amber-300/60 text-amber-200" },
};

/**
 * "Where the analogy holds and where it breaks" for one Earth site against the
 * Marius Hills Pit. Collapsed to a one-line summary; rows on demand. No scores.
 */
export function AnalogyMatrix({
  index,
  site,
  open = false,
}: {
  index: SitesIndex;
  site: Site;
  /** expanded by default (evidence drawer) */
  open?: boolean;
}) {
  const rows = analogyRows(index, site);
  const sum = analogySummary(rows);
  const cites = [...new Set(rows.flatMap((r) => r.cites))];
  return (
    <details
      open={open}
      data-testid={`analogy-${site.id}`}
      className="mt-2 rounded-lg border border-white/10 bg-[#0c111c]/95 p-2.5 text-[11px] text-zinc-300"
    >
      <summary className="cursor-pointer">
        <span className="text-[10px] uppercase tracking-widest text-zinc-400">
          {site.name.split(",")[0]} vs Marius Hills Pit
        </span>
        <span className="mt-0.5 block">
          <span className="text-teal-200">Holds:</span> {sum.holds.join(", ")}.{" "}
          <span className="text-rose-200">Breaks:</span> {sum.breaks.join(", ")}.
        </span>
      </summary>
      <table className="mt-2 w-full border-collapse text-left text-[10.5px]">
        <thead>
          <tr className="text-zinc-500">
            <th className="py-0.5 pr-2 font-normal">Dimension</th>
            <th className="py-0.5 pr-2 font-normal">Moon (pit)</th>
            <th className="py-0.5 pr-2 font-normal">This Earth site</th>
            <th className="py-0.5 font-normal">Analogy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dimension} className="border-t border-white/5 align-top">
              <td className="py-1 pr-2 text-zinc-200">{r.dimension}</td>
              <td className="py-1 pr-2">{r.moon}</td>
              <td className="py-1 pr-2">{r.earth}</td>
              <td className="py-1">
                <span className={`whitespace-nowrap rounded-full border px-1.5 ${CHIP[r.status].cls}`}>
                  {CHIP[r.status].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[9.5px] text-zinc-500">
        Earth cannot reproduce lunar gravity, vacuum or radiation; these sites test surface-mapping questions
        only. Sources: {cites.map((c) => CITATIONS[c]).join(" · ")}
      </p>
    </details>
  );
}
