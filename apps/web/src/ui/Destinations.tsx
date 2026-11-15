import { ArrowUpRight } from "lucide-react";
import { DATA_ROOT } from "../data/load";
import type { SiteId, SitesIndex } from "../data/types";
import { CANDIDATE_SITE, candidatePoint, formatLatLon, LocatorMap, type LocatorPoint } from "./LocatorMap";

/** Descriptive text only. Coordinates come from sites.json (gazetteers and cited sources). */
const PLACES: Record<string, { region: string; feature: string; purpose?: string }> = {
  lava_beds: {
    region: "California, USA",
    feature: "Natural bridges over a collapsed lava tube",
    purpose: "Investigate smaller surface clues",
  },
  lanzarote: {
    region: "Canary Islands, Spain",
    feature: "Jameos: collapse openings into one long tube",
    purpose: "Investigate larger collapse features",
  },
  harrat_khaybar: {
    region: "Saudi Arabia",
    feature: "Umm Jirsan lava tube",
  },
  mars_arsia_skylight: {
    region: "Arsia Mons, Mars",
    feature: "Candidate cave skylight imaged by HiRISE",
  },
};

/** OpenStreetMap link for Earth points only, built from the data coordinates. */
function osmUrl(p: LocatorPoint): string | undefined {
  if (p.body !== "Earth") return undefined;
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=13/${p.lat}/${p.lon}`;
}

/**
 * Chapter 3: Earth sites as destinations, not dashboard rows. Verified sites
 * show a hillshade preview of their own observed grid and fly the camera
 * there; unverified candidates are shown without any measurement.
 */
export function Destinations({
  index,
  current,
  onGo,
}: {
  index: SitesIndex;
  current: SiteId;
  onGo: (site: SiteId) => void;
}) {
  return (
    <div>
      <LocatorMap index={index} current={current} onGo={onGo} />
      <ul data-testid="destinations" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {index.candidates.map((c) => {
          const place = PLACES[c.id];
          const sid = CANDIDATE_SITE[c.id];
          const site = sid ? index.sites.find((s) => s.id === sid) : undefined;
          const ok = c.status === "validated" && site;
          const active = site?.id === current;
          const obs = site?.variants.find((v) => v.observed);
          const point = candidatePoint(c, ok ? site : undefined);
          const location = point ? `${point.name} · ${formatLatLon(point)}` : undefined;
          const map = point ? osmUrl(point) : undefined;
          const mars = c.body === "Mars";
          if (!ok) {
            return (
              <li
                key={c.id}
                className="rounded-lg border border-dashed border-amber-300/40 bg-[#0c111c]/95 px-2.5 py-2 text-[11px] text-zinc-400 sm:col-span-2"
              >
                <p>
                  <span className="text-[12px] text-zinc-200">{c.site.split(",")[0]}</span> · {place?.region}
                  {place?.feature && <> · {place.feature}</>}
                </p>
                {location && (
                  <p className="text-zinc-400" title={point?.source ? `Point: ${point.source}` : undefined}>
                    {location}
                  </p>
                )}
                <p className="text-amber-200/90">
                  {mars
                    ? "Our terrain analysis is unverified. No measurements are shown."
                    : "Our terrain analysis and field access are unverified. No measurements are shown."}
                </p>
                <p className="flex gap-3">
                  {c.url && (
                    <a className="text-sky-300 underline" href={c.url} target="_blank" rel="noreferrer">
                      {mars ? "HiRISE observation" : "Source"}{" "}
                      <ArrowUpRight size={13} aria-hidden="true" className="inline" />
                    </a>
                  )}
                  {map && (
                    <a className="text-sky-300 underline" href={map} target="_blank" rel="noreferrer">
                      Open locator map <ArrowUpRight size={13} aria-hidden="true" className="inline" />
                    </a>
                  )}
                </p>
              </li>
            );
          }
          return (
            <li key={c.id}>
              <button
                type="button"
                data-testid={`dest-${site.id}`}
                aria-pressed={active}
                onClick={() => onGo(site.id)}
                className={`group flex h-full w-full flex-col overflow-hidden rounded-lg border text-left transition ${
                  active
                    ? "border-teal-300/80 bg-teal-950/40"
                    : "border-white/15 bg-[#0c111c]/90 hover:border-white/40"
                }`}
              >
                {site.thumb && (
                  <img
                    src={`${DATA_ROOT}/${site.id}/${site.thumb.file}`}
                    alt={`Shaded relief of the observed ${obs?.resolution_m} m terrain at ${site.name}`}
                    className="h-12 w-full object-cover opacity-80 group-hover:opacity-100"
                  />
                )}
                <span className="p-2.5 text-[11px] text-zinc-300">
                  <span className="block text-[13px] text-white">{site.name.split(",")[0]}</span>
                  <span className="block">{place?.region}</span>
                  <span className="mt-1 block text-zinc-400">{place?.feature}</span>
                  <span className="mt-1 block text-teal-200">{place?.purpose}</span>
                  {location && <span className="mt-1 block text-zinc-400">{location}</span>}
                  <span className="mt-1 block text-zinc-400">Field access not assessed.</span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-teal-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
                    {obs?.resolution_m} m LiDAR · {site.landmarks.length} named features
                  </span>
                </span>
              </button>
              {map && (
                <a
                  className="mt-1 inline-block px-1 text-[11px] text-sky-300 underline"
                  href={map}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open locator map <ArrowUpRight size={13} aria-hidden="true" className="inline" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
