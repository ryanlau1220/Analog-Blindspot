import type { ReactNode } from "react";
import type { SitesIndex } from "../data/types";
import { lastVisibleResolution, lossResolution } from "../story/scenes";

/**
 * Chapter 5: the scientific decision as four short, visually distinct steps.
 * No scores or rankings: each Earth site is matched to the question its data
 * can address. Full wording (findings.ts) is in the evidence drawer and brief.
 */
export function DecisionView({ index }: { index: SitesIndex }) {
  const f = index.sites.find((s) => s.id === "moon")?.facts;
  const earth = index.sites.find((s) => s.id === "earth");
  const lanz = index.sites.find((s) => s.id === "lanzarote");
  if (!f || !earth?.experiment) return null;
  const median = (e: NonNullable<typeof earth.experiment>) =>
    e.levels.find((l) => l.observed)?.landmark_relief_median_m?.toFixed(1);
  const ek = lastVisibleResolution(earth.experiment);
  const el = lossResolution(earth.experiment);
  const lk = lanz?.experiment ? lastVisibleResolution(lanz.experiment) : null;

  return (
    <ol data-testid="decision-view" className="grid items-start gap-2 sm:grid-cols-2">
      <Tile n="1" title="Established" tone="border-teal-300/70 text-teal-200">
        The pit's rim and walls are measured, at least {f.depression_lower_bound_m.toFixed(1)} m deep. Its
        interior ({f.gap_posts} posts) has no elevation.
      </Tile>
      <Tile n="2" title="Where each Earth site helps" tone="border-teal-300/70 text-teal-200">
        <span className="block">
          <b className="font-medium text-white">Lava Beds:</b> start here to test smaller surface clues.
          Native median relief {median(earth.experiment)} m; the point median exceeds background through {ek}{" "}
          m{el !== null ? `, but not at ${el} m` : ""}.
        </span>
        {lanz?.experiment && lk !== null && (
          <span className="mt-1 block">
            <b className="font-medium text-white">Lanzarote:</b> investigate larger collapse features. Native
            median {median(lanz.experiment)} m; its point median exceeds background at {lk} m.
          </span>
        )}
      </Tile>
      <Tile n="3" title="Still uncertain (hypothesis)" tone="border-amber-300/70 text-amber-200">
        Whether such surface clues would be recognisable at lunar 4 m posts, and what lies below the pit
        floor.
      </Tile>
      <Tile n="4" title="Observation that would resolve it" tone="border-zinc-300/60 text-zinc-200">
        Map the surface features and survey a known tube interior. Verify field access before planning a
        visit; access has not been assessed. Neither site is a verified lunar subsurface match.
      </Tile>
    </ol>
  );
}

function Tile({ n, title, tone, children }: { n: string; title: string; tone: string; children: ReactNode }) {
  return (
    <li className={`rounded-lg border-l-2 bg-[#0c111c]/80 p-3 backdrop-blur ${tone.split(" ")[0]}`}>
      <p className={`text-[10px] uppercase tracking-widest ${tone.split(" ")[1]}`}>
        {n} · {title}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-zinc-200">{children}</p>
    </li>
  );
}
