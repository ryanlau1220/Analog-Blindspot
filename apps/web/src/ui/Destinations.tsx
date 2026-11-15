import { DATA_ROOT } from "../data/load";
import type { SiteId, SitesIndex } from "../data/types";

/** Qualitative context only; every number on the card comes from sites.json. */
const PLACES: Record<string, { region: string; feature: string; site?: SiteId }> = {
  lava_beds: {
    region: "California, USA",
    feature: "Natural bridges over a collapsed lava tube",
    site: "earth",
  },
  lanzarote: {
    region: "Canary Islands, Spain",
    feature: "Jameos: collapse openings into one long tube",
    site: "lanzarote",
  },
  harrat_khaybar: { region: "Saudi Arabia", feature: "Large lava-tube field" },
};

/**
 * Chapter 3: Earth sites as destinations, not dashboard rows. Verified sites
 * show a hillshade preview of their own observed grid and fly the camera
 * there; the unverified candidate is shown without any measurement.
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
    <ul data-testid="destinations" className="grid grid-cols-3 gap-2">
      {index.candidates.map((c) => {
        const place = PLACES[c.id];
        const site = place?.site ? index.sites.find((s) => s.id === place.site) : undefined;
        const ok = c.status === "validated" && site;
        const active = site?.id === current;
        const obs = site?.variants.find((v) => v.observed);
        if (!ok) {
          return (
            <li
              key={c.id}
              className="flex flex-col justify-between rounded-lg border border-dashed border-amber-300/40 p-2.5 text-[11px] text-zinc-400"
            >
              <div>
                <p className="text-[13px] text-zinc-200">{c.site.split(",")[0]}</p>
                <p>{place?.region}</p>
              </div>
              <p className="mt-2 text-amber-200/90">
                Not verified. No checked high-resolution terrain, so no measurements are shown.
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
                  : "border-white/15 bg-black/40 hover:border-white/40"
              }`}
            >
              {site.thumb && (
                <img
                  src={`${DATA_ROOT}/${site.id}/${site.thumb.file}`}
                  alt={`Shaded relief of the observed ${obs?.resolution_m} m terrain at ${site.name}`}
                  className="h-16 w-full object-cover opacity-80 group-hover:opacity-100"
                />
              )}
              <span className="p-2.5 text-[11px] text-zinc-300">
                <span className="block text-[13px] text-white">{site.name.split(",")[0]}</span>
                <span className="block">{place?.region}</span>
                <span className="mt-1 block text-zinc-400">{place?.feature}</span>
                <span className="mt-1.5 flex items-center gap-1.5 text-teal-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
                  {obs?.resolution_m} m LiDAR · {site.landmarks.length} named features
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
