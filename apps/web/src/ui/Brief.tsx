import type { ReactNode } from "react";
import type { Site, SitesIndex } from "../data/types";
import { CITATIONS } from "../story/analogy";
import { buildFindings } from "../story/findings";
import { SLDEM2015 } from "../story/lunarProducts";

/**
 * One-page printable Field Validation Brief (#brief). Built from sites.json
 * only; prints on A4/Letter with the browser's print dialog.
 */
export function Brief({ index }: { index: SitesIndex }) {
  const f = buildFindings(index);
  const earthSites = index.sites.filter((s) => s.experiment);
  return (
    <div className="min-h-dvh bg-zinc-200 py-6 text-zinc-900 print:bg-white print:py-0">
      <div className="mx-auto mb-3 flex max-w-[210mm] justify-between px-2 print:hidden">
        <a href="#scene=decision" className="text-sm text-zinc-700 underline">
          ← Back to the story
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700"
        >
          Print / save as PDF
        </button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[12mm] py-[10mm] text-[9.5pt] leading-snug shadow print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-end justify-between border-b-2 border-zinc-900 pb-1.5">
          <div>
            <p className="text-[8pt] uppercase tracking-[0.2em] text-zinc-500">Analog Blindspot</p>
            <h1 className="text-[16pt] font-semibold">
              Field Validation Brief: Marius Hills Pit and Earth analogs
            </h1>
          </div>
          <p className="text-right text-[7.5pt] text-zinc-500">
            Data {index.asset_version} · manifest {index.manifest_generated_utc.slice(0, 10)}
            <br />
            sha256 {index.manifest_sha256.slice(0, 12)}…
          </p>
        </header>

        <p className="mt-2">
          <b>Question.</b> What does the Marius Hills terrain model measure, and how does relief near known
          Earth features change when terrain grids are coarsened? These are candidate surface test sites;
          nothing here measures a subsurface void or establishes a lunar match.
        </p>

        <p className="mt-2">
          <b>Proposed test sites.</b>{" "}
          {earthSites.map((s, k) => {
            const lm = s.landmarks[0];
            const at =
              lm?.lat !== undefined && lm.lon !== undefined
                ? ` (${lm.name}, ${Math.abs(lm.lat).toFixed(5)}° ${lm.lat < 0 ? "S" : "N"}, ${Math.abs(lm.lon).toFixed(5)}° ${lm.lon < 0 ? "W" : "E"})`
                : "";
            return (
              <span key={s.id}>
                {s.name.split(",")[0]}:{" "}
                {k === 0 ? "investigate smaller surface clues" : "investigate larger collapse features"}
                {at}.{" "}
              </span>
            );
          })}
          Field access is not assessed. Both are previously known sites.
        </p>

        <div className="mt-2 grid grid-cols-2 gap-x-5">
          <Block title="Supported by the data" tone="border-emerald-600">
            {f.supported}
          </Block>
          <div>
            <Block title="Research hypotheses (not conclusions)" tone="border-sky-600">
              {f.hypotheses}
            </Block>
            <Block title="Recommended next field measurements" tone="border-zinc-900">
              {f.next}
            </Block>
          </div>
        </div>

        <h2 className="mt-3 text-[10.5pt] font-semibold">Resolution experiment (simulated coarsening)</h2>
        <div className="mt-1 grid grid-cols-2 gap-x-5">
          {earthSites.map((s) => (
            <ExperimentTable key={s.id} site={s} />
          ))}
        </div>

        <h2 className="mt-3 text-[10.5pt] font-semibold">Data products</h2>
        <table className="mt-1 w-full border-collapse text-[8pt]">
          <thead>
            <tr className="border-b border-zinc-400 text-left">
              <Th>Site</Th>
              <Th>Product</Th>
              <Th>Native grid</Th>
              <Th>Reference</Th>
              <Th>Licence</Th>
            </tr>
          </thead>
          <tbody>
            {index.sites.map((s) => (
              <tr key={s.id} className="border-b border-zinc-200 align-top">
                <Td>{s.name}</Td>
                <Td>
                  <a href={s.provenance.landing_page} className="underline">
                    {s.provenance.product_id}
                  </a>
                  {s.provenance.doi && <> · doi:{s.provenance.doi}</>}
                </Td>
                <Td>{s.variants.find((v) => v.observed)?.resolution_m} m</Td>
                <Td>
                  {s.crs}; {s.vertical}
                </Td>
                <Td>
                  {s.provenance.license}
                  {s.provenance.credit && <> · {s.provenance.credit}</>}
                </Td>
              </tr>
            ))}
            {earthSites
              .filter((s) => s.nasa_reference)
              .map((s) => (
                <tr key={`${s.id}-nasa`} className="border-b border-zinc-200 align-top">
                  <Td>{s.name} (independent check)</Td>
                  <Td>
                    <a href={s.nasa_reference?.landing_page} className="underline">
                      {s.nasa_reference?.product_id}
                    </a>
                  </Td>
                  <Td>{s.nasa_reference?.resolution_m} m</Td>
                  <Td>{s.nasa_reference?.vertical}</Td>
                  <Td>{s.nasa_reference?.license}</Td>
                </tr>
              ))}
            {index.candidates
              .filter((c) => c.status !== "validated")
              .map((c) => (
                <tr key={c.id} className="border-b border-zinc-200 align-top text-zinc-500">
                  <Td>{c.site}</Td>
                  <Td>{c.elevation_product}</Td>
                  <Td colSpan={3}>NOT VERIFIED: {c.note}</Td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-2 gap-x-5">
          <Block title="Source limitations" tone="border-amber-600">
            {f.limits}
          </Block>
          <div>
            <p className="border-l-2 border-zinc-400 pl-2 text-[8.5pt] font-semibold uppercase tracking-wide">
              Citations
            </p>
            <ul className="mt-1 space-y-0.5 pl-2 text-[7.5pt] text-zinc-700">
              {index.sites
                .flatMap((s) => s.provenance.citations ?? [s.provenance.citation])
                .map((c) => (
                  <li key={c}>{c}</li>
                ))}
              {earthSites[0]?.nasa_reference && <li>{earthSites[0].nasa_reference.citation}</li>}
              {[...new Set(earthSites.map((s) => s.climate?.source).filter(Boolean))].map((c) => (
                <li key={c}>{c}, power.larc.nasa.gov</li>
              ))}
              <li>{SLDEM2015.citation}</li>
              {Object.values(CITATIONS)
                .filter((c) => !c.startsWith("NASA POWER"))
                .map((c) => (
                  <li key={c}>{c}</li>
                ))}
              {index.landmark_sources?.map((l) => (
                <li key={l.site}>
                  Landmarks: {l.source}. {l.url}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="mt-3 border-t border-zinc-300 pt-1 text-[7pt] text-zinc-500">
          Coarsened grids are simulations derived from the observed terrain models; they are not LROC or other
          observations. Gazetteer points are approximate. Reproduce: scientific/ → uv run fetch-sources,
          fetch-landmarks, fetch-landmarks-es, phase-a, phase-d, phase-e, export-web.
        </footer>
      </article>
    </div>
  );
}

function Block({ title, tone, children }: { title: string; tone: string; children: string[] }) {
  return (
    <section className="mt-1.5">
      <p className={`border-l-2 pl-2 text-[8.5pt] font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-6">
        {children.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

function ExperimentTable({ site }: { site: Site }) {
  const exp = site.experiment;
  if (!exp) return null;
  return (
    <div>
      <p className="text-[8.5pt] font-semibold">
        {site.name} · {exp.landmark_count} named points
      </p>
      <table className="mt-0.5 w-full border-collapse text-[8pt]">
        <thead>
          <tr className="border-b border-zinc-400 text-left">
            <Th>Grid</Th>
            <Th>Landmarks (median)</Th>
            <Th>Background (median)</Th>
          </tr>
        </thead>
        <tbody>
          {exp.levels.map((l) => (
            <tr key={l.resolution_m} className="border-b border-zinc-200">
              <Td>
                {l.resolution_m} m {l.observed ? "(observed)" : "(simulated)"}
              </Td>
              <Td>
                {l.landmark_relief_median_m === null ? "n/m" : `${l.landmark_relief_median_m.toFixed(1)} m`}
              </Td>
              <Td>
                {l.background_relief_median_m === null
                  ? "n/m"
                  : `${l.background_relief_median_m.toFixed(1)} m`}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-0.5 text-[7pt] text-zinc-500">
        Relief = {exp.measure}. {exp.background_note}. n/m = not measurable at this grid.
      </p>
    </div>
  );
}

const Th = ({ children }: { children: ReactNode }) => (
  <th className="py-0.5 pr-2 font-semibold">{children}</th>
);
const Td = ({ children, colSpan }: { children: ReactNode; colSpan?: number }) => (
  <td className="py-0.5 pr-2" colSpan={colSpan}>
    {children}
  </td>
);
