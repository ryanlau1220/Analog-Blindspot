import type { ReactNode } from "react";
import type { SitesIndex } from "../data/types";
import { buildFindings } from "../story/findings";

function Section({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <p className={`text-[10px] uppercase tracking-widest ${tone}`}>{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-snug text-zinc-300">{children}</ul>
    </div>
  );
}

const list = (items: string[]) => items.map((t) => <li key={t}>{t}</li>);

/** Conclusions are kept separate from hypotheses; every number comes from sites.json. */
export function DecisionCard({ index }: { index: SitesIndex }) {
  const f = buildFindings(index);
  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2.5" data-testid="decision">
      <Section title="Supported by the data" tone="text-emerald-300">
        {list(f.supported)}
      </Section>
      <Section title="Hypothesis, not tested here" tone="text-sky-300">
        {list(f.hypotheses)}
      </Section>
      <Section title="Limits" tone="text-amber-300">
        {list(f.limits)}
      </Section>
      <Section title="Next measurements that would close the gap" tone="text-zinc-400">
        {list(f.next)}
      </Section>
      <a
        href="#brief"
        className="mt-3 inline-block rounded border border-amber-300/40 px-2 py-1 text-xs text-amber-100 hover:bg-amber-300/10"
      >
        Open the printable field validation brief →
      </a>
    </div>
  );
}
