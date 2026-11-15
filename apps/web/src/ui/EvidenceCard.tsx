import type { Landmark, Site } from "../data/types";

/** Opened by clicking a marker: what the point is, where it comes from, and the original data product. */
export function EvidenceCard({
  site,
  landmark,
  onClose,
}: {
  site: Site;
  landmark: Landmark;
  onClose: () => void;
}) {
  const p = site.provenance;
  const sourceUrl = landmark.source.match(/https?:\/\/\S+?(?=[)\s]|$)/)?.[0];
  return (
    <aside
      data-testid="evidence-card"
      className="absolute right-4 top-28 z-20 w-80 max-w-[calc(100%-2rem)] rounded-lg border border-amber-300/30 bg-zinc-950/90 p-4 text-sm text-zinc-200 shadow-2xl backdrop-blur sm:right-6 sm:top-32"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-300/80">
            {
              {
                pit: "Mapped pit",
                natural_bridge: "Named natural bridge",
                jameo: "Named jameo (lava-tube collapse opening)",
              }[landmark.kind]
            }
          </p>
          <h2 className="text-lg text-white">{landmark.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
        {landmark.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-400">
        Location source:{" "}
        {sourceUrl ? (
          <a className="text-sky-300 underline" href={sourceUrl} target="_blank" rel="noreferrer">
            {landmark.source.replace(sourceUrl, "").replace(/[()]/g, "").trim() || sourceUrl}
          </a>
        ) : (
          landmark.source
        )}
      </p>
      <div className="mt-3 rounded border border-white/10 bg-white/5 p-2 text-xs">
        <p className="text-zinc-400">Elevation data product</p>
        <a className="text-sky-300 underline" href={p.landing_page} target="_blank" rel="noreferrer">
          {p.title}
        </a>
        <p className="mt-1 text-zinc-500">{p.citation}</p>
      </div>
    </aside>
  );
}
