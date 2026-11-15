import type { Candidate, Site, SiteId, SitesIndex } from "../data/types";
import { WORLD_LAND_PATH } from "./worldLand";

/** Candidate id -> rendered site id, for the validated Earth destinations. */
export const CANDIDATE_SITE: Record<string, SiteId> = { lava_beds: "earth", lanzarote: "lanzarote" };

export interface LocatorPoint {
  id: string;
  name: string;
  lat: number;
  /** Earth: -180..180; Moon and Mars: east 0-360 */
  lon: number;
  body: "Earth" | "Moon" | "Mars";
  validated: boolean;
  site?: SiteId;
  source?: string;
}

const hemi = (v: number, pos: string, neg: string, d: number) =>
  `${Math.abs(v).toFixed(d)}° ${v < 0 ? neg : pos}`;

/** Earth: `41.70850° N, 121.51417° W`; Moon and Mars (lon east 0-360): `5.532° S, 241.396° E`. */
export function formatLatLon(p: Pick<LocatorPoint, "lat" | "lon" | "body">): string {
  if (p.body === "Earth") return `${hemi(p.lat, "N", "S", 5)}, ${hemi(p.lon, "E", "W", 5)}`;
  return `${hemi(p.lat, "N", "S", 3)}, ${(((p.lon % 360) + 360) % 360).toFixed(3)}° E`;
}

/** Representative point of a candidate, from data only (undefined when coordinates are missing). */
export function candidatePoint(c: Candidate, site: Site | undefined): LocatorPoint | undefined {
  const body = c.body ?? "Earth";
  const validated = c.status === "validated" && !!site;
  const lm = validated ? site?.landmarks[0] : undefined;
  if (lm && lm.lat !== undefined && lm.lon !== undefined)
    return {
      id: c.id,
      name: lm.name,
      lat: lm.lat,
      lon: lm.lon,
      body,
      validated,
      site: site?.id,
      source: lm.source,
    };
  if (c.lat === undefined || c.lon === undefined) return undefined;
  return {
    id: c.id,
    name: c.point_label ?? c.site.split(",")[0] ?? c.site,
    lat: c.lat,
    lon: c.lon,
    body,
    validated,
    site: validated ? site?.id : undefined,
    source: c.point_source,
  };
}

export function locatorPoints(index: SitesIndex): LocatorPoint[] {
  const pts: LocatorPoint[] = [];
  for (const c of index.candidates) {
    const sid = CANDIDATE_SITE[c.id];
    const p = candidatePoint(c, sid ? index.sites.find((s) => s.id === sid) : undefined);
    if (p) pts.push(p);
  }
  const moon = index.sites.find((s) => s.id === "moon");
  if (moon?.facts)
    pts.push({
      id: "moon",
      name: moon.landmarks[0]?.name ?? "Marius Hills Pit",
      lat: moon.facts.pit_lat,
      lon: moon.facts.pit_lon_east,
      body: "Moon",
      validated: true,
      site: "moon",
    });
  return pts;
}

// Graticule lines, equirectangular 360 x 180.
const RECT_GRID = [
  ...[30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((x) => `M${x} 0V180`),
  ...[30, 60, 90, 120, 150].map((y) => `M0 ${y}H360`),
].join("");

// Orthographic nearside graticule (unit disk, centre 0,0), 30 deg spacing.
const RAD = Math.PI / 180;
const ORTHO_GRID = (() => {
  const d: string[] = [];
  for (const lat of [-60, -30, 0, 30, 60]) {
    const y = -Math.sin(lat * RAD);
    const w = Math.cos(lat * RAD);
    d.push(`M${(-w).toFixed(3)} ${y.toFixed(3)}H${w.toFixed(3)}`);
  }
  for (const lon of [-60, -30, 0, 30, 60]) {
    const seg: string[] = [];
    for (let lat = -90; lat <= 90; lat += 10)
      seg.push(
        `${(Math.cos(lat * RAD) * Math.sin(lon * RAD)).toFixed(3)} ${(-Math.sin(lat * RAD)).toFixed(3)}`,
      );
    d.push(`M${seg.join("L")}`);
  }
  return d.join("");
})();

function Marker({
  p,
  x,
  y,
  r,
  current,
  onGo,
}: {
  p: LocatorPoint;
  x: number;
  y: number;
  r: number;
  current: SiteId;
  onGo: (site: SiteId) => void;
}) {
  const active = p.site !== undefined && p.site === current;
  const clickable = p.validated && p.body === "Earth" && p.site !== undefined;
  const label = `${p.name}, ${formatLatLon(p)}${p.validated ? "" : " (unverified candidate)"}${
    active ? " (current site)" : ""
  }`;
  const shapes = (
    <>
      <title>{label}</title>
      {clickable && <circle cx={x} cy={y} r={r * 2.6} fill="transparent" />}
      {active && (
        <circle cx={x} cy={y} r={r * 2} fill="none" stroke="#ffffff" strokeWidth={r * 0.45} opacity={0.9} />
      )}
      {p.validated ? (
        <circle cx={x} cy={y} r={r} fill="#5eead4" stroke="#090d16" strokeWidth={r * 0.3} />
      ) : (
        <>
          <circle
            cx={x}
            cy={y}
            r={r * 1.9}
            fill="none"
            stroke="#fcd34d"
            strokeWidth={r * 0.35}
            strokeDasharray={`${r * 0.7} ${r * 0.5}`}
          />
          <circle cx={x} cy={y} r={r * 0.8} fill="#fcd34d" />
        </>
      )}
    </>
  );
  if (!clickable || !p.site) return <g>{shapes}</g>;
  const site = p.site;
  return (
    // biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>; keyboard handled below
    <g
      role="button"
      tabIndex={0}
      aria-label={`Go to ${label}`}
      aria-pressed={active}
      className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-sky-300"
      onClick={() => onGo(site)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onGo(site);
        }
      }}
    >
      {shapes}
    </g>
  );
}

const panel = "rounded-md border border-white/10 bg-[#090d16] p-1.5";
const heading = "mb-1 text-[10px] tracking-widest text-zinc-400";

/** Compact "where these sites are" locator: Earth, Moon nearside and Mars. Outline only, not analysis data. */
export function LocatorMap({
  index,
  current,
  onGo,
}: {
  index: SitesIndex;
  current: SiteId;
  onGo: (site: SiteId) => void;
}) {
  const pts = locatorPoints(index);
  const earth = pts.filter((p) => p.body === "Earth");
  const moon = pts.filter((p) => p.body === "Moon");
  const mars = pts.filter((p) => p.body === "Mars");
  const svgCls = "mx-auto block h-auto max-h-[84px] w-full";

  return (
    <figure data-testid="locator-map" className="mb-2 rounded-lg border border-white/10 bg-[#0c111c] p-2">
      <figcaption className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 text-[11px] text-zinc-300">
        <span>Where these sites are</span>
        <span className="flex items-center gap-3 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
            validated
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border border-dashed border-amber-300" />
            unverified candidate
          </span>
        </span>
      </figcaption>
      <div className="grid grid-cols-[2fr_1fr_2fr] gap-1.5">
        <div className={panel}>
          <p className={heading}>EARTH</p>
          <svg viewBox="0 0 360 180" className={svgCls}>
            <title>Earth locator map</title>
            <rect width="360" height="180" fill="#0c111c" />
            <path d={RECT_GRID} fill="none" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={0.6} />
            {WORLD_LAND_PATH && (
              <path
                d={WORLD_LAND_PATH}
                fill="#3f3f46"
                fillOpacity={0.55}
                stroke="#71717a"
                strokeWidth={0.4}
              />
            )}
            {earth.map((p) => (
              <Marker key={p.id} p={p} x={p.lon + 180} y={90 - p.lat} r={4} current={current} onGo={onGo} />
            ))}
          </svg>
        </div>
        <div className={panel}>
          <p className={heading}>MOON · NEARSIDE</p>
          <svg viewBox="-1.1 -1.1 2.2 2.2" className={svgCls}>
            <title>Moon nearside locator</title>
            <circle r={1} fill="#18181b" stroke="#71717a" strokeWidth={0.015} />
            <path d={ORTHO_GRID} fill="none" stroke="#ffffff" strokeOpacity={0.1} strokeWidth={0.01} />
            {moon.map((p) => {
              const lon = ((((p.lon + 180) % 360) + 360) % 360) - 180;
              const lat = p.lat * RAD;
              if (Math.cos(lat) * Math.cos(lon * RAD) <= 0) return null;
              return (
                <Marker
                  key={p.id}
                  p={p}
                  x={Math.cos(lat) * Math.sin(lon * RAD)}
                  y={-Math.sin(lat)}
                  r={0.05}
                  current={current}
                  onGo={onGo}
                />
              );
            })}
          </svg>
        </div>
        <div className={panel}>
          <p className={heading}>MARS · LON 0–360° E</p>
          <svg viewBox="0 0 360 180" className={svgCls}>
            <title>Mars locator map</title>
            <rect width="360" height="180" fill="#1a1311" />
            <path d={RECT_GRID} fill="none" stroke="#ffffff" strokeOpacity={0.1} strokeWidth={0.6} />
            {mars.map((p) => (
              <Marker
                key={p.id}
                p={p}
                x={((p.lon % 360) + 360) % 360}
                y={90 - p.lat}
                r={4}
                current={current}
                onGo={onGo}
              />
            ))}
          </svg>
        </div>
      </div>
      <p className="mt-1 text-[9px] text-zinc-500">
        Land: Natural Earth (public domain). Points: gazetteers and cited sources.
      </p>
    </figure>
  );
}
