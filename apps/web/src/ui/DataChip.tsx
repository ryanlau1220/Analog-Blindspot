import type { Site, Variant } from "../data/types";

/**
 * Layer 2: one line of contextual evidence. Observed (cyan, solid) vs simulated
 * (violet, dashed) is always visible; the full record opens in the drawer.
 */
export function DataChip({
  site,
  variant,
  exaggeration,
  onOpen,
}: {
  site: Site;
  variant: Variant;
  exaggeration: number;
  onOpen: () => void;
}) {
  const obs = variant.observed;
  return (
    <button
      type="button"
      data-testid="variant-badge"
      onClick={onOpen}
      title="Open the evidence for this view"
      className={`flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] backdrop-blur transition hover:bg-white/10 ${
        obs
          ? "border-teal-300/40 bg-teal-950/40 text-teal-50"
          : "border-dashed border-violet-300/70 bg-violet-950/50 text-violet-50"
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${obs ? "bg-teal-300" : "bg-violet-300"}`} />
      <span className="font-semibold tracking-wider">{obs ? "OBSERVED" : "SIMULATED"}</span>
      <span className="truncate opacity-85">
        <span className="hidden sm:inline">{site.provenance.product_id.split(",")[0]} · </span>
        {variant.resolution_m} m grid
      </span>
      <span className={exaggeration === 1 ? "opacity-70" : "font-semibold text-amber-200"}>
        ×{exaggeration}
        <span className="hidden sm:inline">{exaggeration === 1 ? " true scale" : " vertical"}</span>
      </span>
      <span aria-hidden className="opacity-60">
        ⓘ
      </span>
    </button>
  );
}
