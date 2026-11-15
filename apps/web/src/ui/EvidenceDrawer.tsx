import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import type { Site, SitesIndex, Variant } from "../data/types";
import type { SceneState } from "../scene/state";
import type { StoryScene } from "../story/scenes";
import { AnalogyMatrix } from "./AnalogyMatrix";
import { CandidatesCard } from "./CandidatesCard";
import { DecisionCard } from "./DecisionCard";
import { ExperimentCard } from "./ExperimentCard";
import { Legend } from "./Legend";

/**
 * Layer 3: detailed scientific information on demand: the chapter's full
 * explanation, the dataset record (product, DOI, licence, CRS, vertical
 * reference, grids), the chapter's evidence table, and reproducibility.
 */
export function EvidenceDrawer({
  index,
  site,
  variant,
  state,
  scene,
  onClose,
  onVariant,
  onSite,
}: {
  index: SitesIndex;
  site: Site;
  variant: Variant;
  state: SceneState;
  scene: StoryScene | null;
  onClose: () => void;
  onVariant: (id: string) => void;
  onSite: (id: Site["id"]) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const headingId = useId();
  // Ref so the open effect runs once: focus moves in on open and back on close.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Keep keys inside the modal from reaching the global story shortcuts.
    if (e.key !== "Escape") e.stopPropagation();
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      e.preventDefault();
      panel.current.focus();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const p = site.provenance;
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="evidence-backdrop"
        onClick={onClose}
        className="absolute inset-0 z-20 bg-black/40"
      />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={onKeyDown}
        data-testid="evidence-drawer"
        className="absolute inset-x-0 bottom-0 z-30 max-h-[80dvh] overflow-y-auto rounded-t-xl border-t border-white/10 bg-[#0c111c]/95 p-5 text-sm text-zinc-300 shadow-2xl backdrop-blur outline-none sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-t-0 sm:border-l"
      >
        <div className="flex items-start justify-between">
          <h2 id={headingId} className="text-[10px] uppercase tracking-[0.25em] text-teal-300/80">
            Evidence
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evidence"
            className="text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {scene && (
          <Section title={scene.chapter}>
            {scene.body.map((t) => (
              <p key={t} className="mt-1.5 leading-relaxed">
                {t}
              </p>
            ))}
          </Section>
        )}

        <Section title="On screen">
          <Legend compact />
          <p className="mt-2 text-xs">
            <span className={variant.observed ? "text-teal-200" : "text-violet-200"}>{variant.label}</span>
          </p>
        </Section>

        {site.nasa_reference && (
          <Section title="Independent NASA check">
            <p className="text-xs leading-relaxed">
              <a
                className="text-sky-300 underline"
                href={site.nasa_reference.landing_page}
                target="_blank"
                rel="noreferrer"
              >
                {site.nasa_reference.title}
              </a>{" "}
              (tiles {site.nasa_reference.tiles.join(", ")}) against the simulated{" "}
              {site.nasa_reference.resolution_m} m grid: r ={" "}
              {site.nasa_reference.comparison.pearson_r.toFixed(4)}, RMSE{" "}
              {site.nasa_reference.comparison.rmse_m.toFixed(2)} m, mean offset{" "}
              {site.nasa_reference.comparison.bias_m.toFixed(2)} m. {site.nasa_reference.comparison.note}{" "}
              Heights: {site.nasa_reference.vertical}. {site.nasa_reference.license}.
            </p>
            {site.climate && (
              <p className="mt-1.5 text-xs leading-relaxed">
                Air temperature at the site ({site.climate.period}): {site.climate.t2m_min_c.toFixed(1)} to{" "}
                {site.climate.t2m_max_c.toFixed(1)} °C. {site.climate.note}{" "}
                <a
                  className="text-sky-300 underline"
                  href={site.climate.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  NASA POWER request
                </a>
              </p>
            )}
          </Section>
        )}

        <Section title="Dataset">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
            <Row k="Product">
              <a className="text-sky-300 underline" href={p.landing_page} target="_blank" rel="noreferrer">
                {p.product_id}
              </a>
            </Row>
            <Row k="Title">{p.title}</Row>
            {p.doi && (
              <Row k="DOI">
                <a
                  className="text-sky-300 underline"
                  href={`https://doi.org/${p.doi}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {p.doi}
                </a>
              </Row>
            )}
            <Row k="Licence">
              {p.license}
              {p.credit ? ` · ${p.credit}` : ""}
            </Row>
            <Row k="Horizontal">{site.crs}</Row>
            <Row k="Heights">{site.vertical}</Row>
            <Row k="Extent">{site.extent_m.toFixed(0)} m square</Row>
            <Row k="Grid shown">
              {variant.resolution_m} m (
              {variant.observed ? "observed" : variant.reference ? "NASA reference" : "simulated"}); display
              mesh {variant.display.grid}² at {variant.display.cell_m.toFixed(1)} m; shading{" "}
              {Number(variant.normal_map.m_per_px.toPrecision(3))} m/px
            </Row>
            <Row k="Elevation">
              {variant.elevation.min_m.toFixed(1)} to {variant.elevation.max_m.toFixed(1)} m
              {variant.elevation.nan_count ? ` · ${variant.elevation.nan_count} posts without data` : ""}
            </Row>
            <Row k="Exaggeration">
              ×{state.exaggeration}
              {state.exaggeration === 1 ? " (true scale)" : ""} · block depth is display only
            </Row>
            <Row k="Subsurface">{site.subsurface}</Row>
          </dl>
          <p className="mt-2 text-[11px] text-zinc-500">{p.citation}</p>
        </Section>

        {scene?.panel === "destinations" && (
          <Section title="Where the analogy holds and breaks">
            {index.sites
              .filter((x) => x.body === "Earth")
              .map((x) => (
                <AnalogyMatrix key={x.id} index={index} site={x} open />
              ))}
          </Section>
        )}
        {scene?.panel === "destinations" && (
          <Section title="Candidate sites">
            <CandidatesCard candidates={index.candidates} />
          </Section>
        )}
        {scene?.panel === "lab" && (
          <Section title="Evidence table">
            <ExperimentCard index={index} state={state} onSelect={onVariant} onSite={onSite} />
          </Section>
        )}
        {scene?.panel === "decision" && (
          <Section title="Full findings">
            <DecisionCard index={index} />
          </Section>
        )}

        <Section title="Reproduce">
          <p className="text-xs leading-relaxed">
            Manifest {index.manifest_generated_utc.slice(0, 10)}, sha256 {index.manifest_sha256.slice(0, 12)}
            …. In <code>scientific/</code>: <code>uv run fetch-sources</code>, <code>phase-a</code>,{" "}
            <code>phase-d</code>, <code>export-web</code>. See docs/science.md.
          </p>
          <a href="#brief" className="mt-2 inline-block text-xs text-amber-200 underline">
            Printable Field Validation Brief
          </a>
        </Section>
      </aside>
    </>
  );
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-white/10 pt-3">
      <h3 className="mb-1.5 text-[10px] uppercase tracking-widest text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-zinc-200">{children}</dd>
    </>
  );
}
