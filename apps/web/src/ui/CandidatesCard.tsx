import type { Candidate } from "../data/types";

/** Earth analog destinations. Unverified sites are shown as such, with no measurements. */
export function CandidatesCard({ candidates }: { candidates: Candidate[] }) {
  return (
    <ul className="space-y-2" data-testid="candidates">
      {candidates.map((c) => {
        const ok = c.status === "validated";
        return (
          <li
            key={c.id}
            className={`rounded-md border p-2.5 text-xs ${
              ok
                ? "border-emerald-400/30 bg-emerald-950/30"
                : "border-dashed border-zinc-600 bg-transparent opacity-80"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-zinc-100">{c.site}</p>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                  ok ? "bg-emerald-400/20 text-emerald-200" : "bg-zinc-700/60 text-zinc-300"
                }`}
              >
                {ok ? "data verified" : "not verified"}
              </span>
            </div>
            <p className="mt-1 text-zinc-400">
              <a className="text-sky-300 underline" href={c.url} target="_blank" rel="noreferrer">
                {c.elevation_product}
              </a>
            </p>
            <p className="mt-0.5 text-zinc-400">{c.note}</p>
          </li>
        );
      })}
    </ul>
  );
}
