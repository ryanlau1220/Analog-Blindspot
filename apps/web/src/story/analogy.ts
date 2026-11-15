import type { Site, SitesIndex } from "../data/types";

/**
 * Where each Earth site is (and is not) an analog for the Marius Hills Pit.
 * Values measured in this app come from sites.json; the rest are published
 * values with their citation. No row is scored or ranked.
 */
export type AnalogyStatus = "holds" | "breaks" | "measured" | "unknown";

export interface AnalogyRow {
  dimension: string;
  moon: string;
  earth: string;
  status: AnalogyStatus;
  /** citation keys from CITATIONS */
  cites: (keyof typeof CITATIONS)[];
}

export const CITATIONS = {
  haruyama2009:
    "Haruyama, J. et al. (2009). Possible lunar lava tube skylight observed by SELENE cameras. Geophys. Res. Lett. 36, L21206. doi:10.1029/2009GL040635",
  horvath2022:
    "Horvath, T., Hayne, P. O., Paige, D. A. (2022). Thermal and illumination environments of lunar pits and caves: models and observations from the Diviner Lunar Radiometer Experiment. Geophys. Res. Lett. 49, e2022GL099710. doi:10.1029/2022GL099710",
  williams2017:
    "Williams, J.-P. et al. (2017). The global surface temperatures of the Moon as measured by the Diviner Lunar Radiometer Experiment. Icarus 283, 300–325. doi:10.1016/j.icarus.2016.08.012",
  braille:
    "Blank, J. G. and the NASA BRAILLE Team (2023). Highlights of the NASA BRAILLE project: a Mars analog astrobiology study focused on volcanic caves at Lava Beds National Monument. 4th Intl. Planetary Caves Conf., abstract 1072",
  pangaea:
    "ESA PANGAEA: astronaut geology training in the La Corona lava tube and volcanic terrain of Lanzarote (esa.int)",
  power: "NASA POWER climatology API (MERRA-2), power.larc.nasa.gov",
} as const;

/** Diviner equatorial surface range (Williams et al. 2017) and modelled shadowed-cave temperature (Horvath et al. 2022). */
export const LUNAR_THERMAL = {
  surface_day_k: [387, 397] as [number, number],
  surface_predawn_k: 95,
  shadowed_cave_k: 290,
} as const;

export const kToC = (k: number) => k - 273.15;
const c0 = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)} °C`;

const SITE_TUBE: Record<string, { tube: string; cite: (keyof typeof CITATIONS)[] }> = {
  earth: {
    tube: "Basaltic lava tubes with collapse trenches and natural bridges; NASA's BRAILLE cave-analog project works here",
    cite: ["braille"],
  },
  lanzarote: {
    tube: "Basaltic La Corona tube with jameos (collapse openings); ESA PANGAEA astronaut training site",
    cite: ["pangaea"],
  },
};

export function analogyRows(index: SitesIndex, site: Site): AnalogyRow[] {
  const moon = index.sites.find((s) => s.id === "moon");
  const f = moon?.facts;
  const obs = site.experiment?.levels.find((l) => l.observed);
  const clim = site.climate;
  const day = LUNAR_THERMAL.surface_day_k.map(kToC);
  const night = kToC(LUNAR_THERMAL.surface_predawn_k);
  const cave = kToC(LUNAR_THERMAL.shadowed_cave_k);
  const tube = SITE_TUBE[site.id];
  const caveInRange = clim ? cave >= clim.t2m_min_c && cave <= clim.t2m_max_c : null;
  return [
    {
      dimension: "Lava tube with collapse openings",
      moon: "Pit in a sinuous rille, a possible lava-tube skylight",
      earth: tube?.tube ?? "Not assessed",
      status: "holds",
      cites: ["haruyama2009", ...(tube?.cite ?? [])],
    },
    {
      dimension: "Relief at the openings (measured here)",
      moon: f
        ? `Walls reach at least ${f.depression_lower_bound_m.toFixed(1)} m below the rim (4 m DTM)`
        : "—",
      earth:
        obs?.landmark_relief_median_m != null && obs.background_relief_median_m != null
          ? `Median ${obs.landmark_relief_median_m.toFixed(1)} m at the named points vs ${obs.background_relief_median_m.toFixed(1)} m background (${obs.resolution_m} m)`
          : "—",
      status: "measured",
      cites: [],
    },
    {
      dimension: "Surface temperature swing",
      moon: `${c0(night)} before dawn to ${c0(day[0] ?? 0)}–${c0(day[1] ?? 0)} at noon (equatorial surface)`,
      earth: clim
        ? `${c0(clim.t2m_min_c)} to ${c0(clim.t2m_max_c)} air temperature (${clim.period})`
        : "Not measured",
      status: "breaks",
      cites: clim ? ["williams2017", "power"] : ["williams2017"],
    },
    {
      dimension: "Shadowed interior temperature",
      moon: `About ${c0(cave)}, nearly constant, where the Sun never reaches (modelled from Diviner)`,
      earth:
        caveInRange === null
          ? "Not measured"
          : caveInRange
            ? "Within this site's air-temperature range; cave interiors were not measured here"
            : "Outside this site's air-temperature range; cave interiors were not measured here",
      status: caveInRange ? "holds" : "unknown",
      cites: clim ? ["horvath2022", "power"] : ["horvath2022"],
    },
    {
      dimension: "Gravity",
      moon: "1.62 m/s² (about 1/6 g)",
      earth: "9.81 m/s²: rock strength, roof stability and dust behave differently",
      status: "breaks",
      cites: [],
    },
    {
      dimension: "Atmosphere and weathering",
      moon: "Near vacuum; no water or wind erosion",
      earth: "Air, rain, vegetation and soil soften and fill features over time",
      status: "breaks",
      cites: [],
    },
    {
      dimension: "Surface radiation",
      moon: "No magnetic field or atmosphere; cosmic and solar radiation reach the surface",
      earth: "Shielded by the magnetic field and atmosphere",
      status: "breaks",
      cites: [],
    },
    {
      dimension: "Subsurface geometry",
      moon: "Not measured: the DTM has no data inside the pit",
      earth: "Not measured: the LiDAR maps the surface only",
      status: "unknown",
      cites: [],
    },
  ];
}

export function analogySummary(rows: AnalogyRow[]): { holds: string[]; breaks: string[] } {
  return {
    holds: rows.filter((r) => r.status === "holds").map((r) => r.dimension.toLowerCase()),
    breaks: rows.filter((r) => r.status === "breaks").map((r) => r.dimension.toLowerCase()),
  };
}
