import type { ReactNode } from "react";
import type { SitesIndex } from "../data/types";
import { lastVisibleResolution, lossResolution } from "../story/scenes";

function Section({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <p className={`text-[10px] uppercase tracking-widest ${tone}`}>{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-snug text-zinc-300">{children}</ul>
    </div>
  );
}

/** Conclusions are kept separate from hypotheses; every number comes from sites.json. */
export function DecisionCard({ index }: { index: SitesIndex }) {
  const moon = index.sites.find((s) => s.id === "moon");
  const earth = index.sites.find((s) => s.id === "earth");
  const f = moon?.facts;
  const exp = earth?.experiment;
  if (!f || !exp) return null;
  const loss = lossResolution(exp);
  const kept = lastVisibleResolution(exp);
  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2.5" data-testid="decision">
      <Section title="Supported by the data" tone="text-emerald-300">
        <li>
          The LROC 4 m terrain model resolves the funnel of Marius Hills Pit: wall posts reach at least{" "}
          {f.depression_lower_bound_m.toFixed(1)} m below the rim.
        </li>
        <li>
          It has no elevation for the pit interior ({f.gap_posts} posts). The atlas depth of {f.atlas_depth_m}{" "}
          m comes from separate stereo modelling.
        </li>
        {kept !== null && loss !== null && (
          <li>
            At Lava Beds, relief around {exp.landmark_count} named bridge points exceeds relief at random
            points from 0.5 m to {kept} m and not from {loss} m on (simulated coarsening).
          </li>
        )}
      </Section>
      <Section title="Hypothesis, not tested here" tone="text-sky-300">
        <li>
          Surface clues at the scale of the Lava Beds bridges would be hard to recognise in a lunar terrain
          model with 4 m posts. This assumes block averaging mimics a stereo DTM, which it does not exactly.
        </li>
      </Section>
      <Section title="Limits" tone="text-amber-300">
        <li>{f.effective_resolution_note}</li>
        <li>{exp.caveat} GNIS positions are approximate.</li>
        <li>Neither dataset measures the subsurface. No void or cave geometry is shown as fact.</li>
      </Section>
      <Section title="Next measurements that would close the gap" tone="text-zinc-400">
        <li>Elevation data for the pit floor and overhangs, rather than a single depth estimate.</li>
        <li>
          Mapped outlines of the Lava Beds collapses and bridges, so feature loss can be scored instead of
          compared at points.
        </li>
        <li>
          A direct subsurface measurement at a known Lava Beds tube to test what surface relief predicts.
        </li>
      </Section>
    </div>
  );
}
