import type { Site, SiteId, SitesIndex, Variant } from "../data/types";

/**
 * Camera framing. "overview" frames the whole block; "landmark" frames the
 * site's first landmark (the pit) or the centroid of all landmarks; "section"
 * looks north at the cutaway face.
 */
export const VIEWS = ["overview", "hero", "landmark", "section", "anomaly"] as const;
export type View = (typeof VIEWS)[number];

/** Discrete, serialisable scene state. Every field is valid for every site. */
export interface SceneState {
  site: SiteId;
  variantId: string;
  exaggeration: Exaggeration;
  cutaway: { enabled: boolean /** 0 = north edge, 1 = south edge */; position: number };
  drape: "relief" | "orthophoto";
  view: View;
  /** split-screen comparison of the shown variant against the site's observed grid */
  compare: boolean;
  /** show the unverified relief anomalies of the lattice search for the shown grid */
  search: boolean;
}

export const EXAGGERATIONS = [1, 2, 4] as const;
export type Exaggeration = (typeof EXAGGERATIONS)[number];

export type SceneAction =
  | { type: "selectSite"; site: SiteId }
  | { type: "selectVariant"; variantId: string }
  | { type: "setExaggeration"; value: Exaggeration }
  | { type: "toggleCutaway" }
  | { type: "setCutaway"; enabled: boolean }
  | { type: "setCutPosition"; position: number }
  | { type: "setDrape"; drape: SceneState["drape"] }
  | { type: "setView"; view: View }
  | { type: "setCompare"; enabled: boolean }
  | { type: "setSearch"; enabled: boolean }
  | { type: "applyPreset"; preset: ScenePreset };

/** A partial target state, e.g. one story step. Applied field by field through the reducer. */
export interface ScenePreset {
  site?: SiteId;
  variantId?: string;
  exaggeration?: Exaggeration;
  cutaway?: boolean;
  /** "landmark" = row of the site's first landmark */
  cutPosition?: number | "landmark";
  drape?: SceneState["drape"];
  view?: View;
  compare?: boolean;
  search?: boolean;
}

export function findSite(index: SitesIndex, id: SiteId): Site {
  const s = index.sites.find((x) => x.id === id);
  if (!s) throw new Error(`unknown site ${id}`);
  return s;
}

/** Every grid that can be shown for a site: its observed/simulated series plus an optional NASA reference. */
export function siteVariants(site: Site): Variant[] {
  const ref = site.nasa_reference?.variant;
  return ref ? [...site.variants, ref] : site.variants;
}

export function observedVariantId(site: Site): string {
  const v = site.variants.find((x) => x.observed);
  if (!v) throw new Error(`${site.id} has no observed variant`);
  return v.id;
}

/** Elevation mapped to scene y = 0; shared by all variants of a site. */
export function siteDatum(site: Site): number {
  const obs = site.variants.find((v) => v.observed);
  return obs ? obs.elevation.min_m : 0;
}

export function initialState(index: SitesIndex, site: SiteId = "moon"): SceneState {
  return {
    site,
    variantId: observedVariantId(findSite(index, site)),
    exaggeration: 1,
    cutaway: { enabled: false, position: 0.5 },
    drape: "relief",
    view: "overview",
    compare: false,
    search: false,
  };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0.5);

function presetActions(index: SitesIndex, state: SceneState, p: ScenePreset): SceneAction[] {
  const out: SceneAction[] = [];
  if (p.site) out.push({ type: "selectSite", site: p.site });
  const siteId = p.site ?? state.site;
  if (p.variantId) out.push({ type: "selectVariant", variantId: p.variantId });
  if (p.exaggeration) out.push({ type: "setExaggeration", value: p.exaggeration });
  if (p.cutaway !== undefined) out.push({ type: "setCutaway", enabled: p.cutaway });
  if (p.cutPosition !== undefined) {
    const site = findSite(index, siteId);
    const lm = site.landmarks[0];
    const pos = p.cutPosition === "landmark" ? (lm ? lm.y_m / site.extent_m : 0.5) : p.cutPosition;
    out.push({ type: "setCutPosition", position: pos });
  }
  if (p.drape) out.push({ type: "setDrape", drape: p.drape });
  if (p.view) out.push({ type: "setView", view: p.view });
  if (p.compare !== undefined) out.push({ type: "setCompare", enabled: p.compare });
  if (p.search !== undefined) out.push({ type: "setSearch", enabled: p.search });
  return out;
}

/**
 * Reducer that can be driven in any order. Invalid requests (unknown variant,
 * orthophoto on a site without one) leave the state unchanged instead of
 * producing a half-valid scene.
 */
export function reduce(index: SitesIndex, state: SceneState, action: SceneAction): SceneState {
  switch (action.type) {
    case "selectSite": {
      if (action.site === state.site) return state;
      const site = findSite(index, action.site);
      return {
        ...state,
        site: action.site,
        variantId: observedVariantId(site),
        drape: site.drape ? state.drape : "relief",
      };
    }
    case "selectVariant": {
      const site = findSite(index, state.site);
      if (!siteVariants(site).some((v) => v.id === action.variantId)) return state;
      return { ...state, variantId: action.variantId };
    }
    case "setExaggeration":
      return (EXAGGERATIONS as readonly number[]).includes(action.value)
        ? { ...state, exaggeration: action.value }
        : state;
    case "toggleCutaway":
      return { ...state, cutaway: { ...state.cutaway, enabled: !state.cutaway.enabled } };
    case "setCutaway":
      return state.cutaway.enabled === action.enabled
        ? state
        : { ...state, cutaway: { ...state.cutaway, enabled: action.enabled } };
    case "setCutPosition":
      return { ...state, cutaway: { ...state.cutaway, position: clamp01(action.position) } };
    case "setDrape":
      if (action.drape === "orthophoto" && !findSite(index, state.site).drape) return state;
      return { ...state, drape: action.drape };
    case "setView":
      return (VIEWS as readonly string[]).includes(action.view) ? { ...state, view: action.view } : state;
    case "setCompare":
      return state.compare === action.enabled ? state : { ...state, compare: action.enabled };
    case "setSearch":
      return state.search === action.enabled ? state : { ...state, search: action.enabled };
    case "applyPreset":
      return presetActions(index, state, action.preset).reduce((s, a) => reduce(index, s, a), state);
  }
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * Camera pose for a state. Positions scale with the site extent. ``wide`` (landscape
 * screens) shifts the subject right of centre so the headline on the left never
 * covers it; on narrow screens the subject stays centred.
 */
export function cameraPreset(
  site: Site,
  state: Pick<SceneState, "exaggeration" | "view" | "cutaway">,
  wide = true,
): CameraPose {
  const e = site.extent_m;
  const ex = state.exaggeration;
  const datum = siteDatum(site);
  const v = site.variants[0];
  const relief = v ? (v.elevation.max_m - v.elevation.min_m) * ex : 0;
  const half = e / 2;
  const lms = site.landmarks;
  const focus = (() => {
    if (lms.length === 0) return { x: 0, y: 0, z: 0 };
    const pick = site.id === "moon" ? [lms[0] as (typeof lms)[number]] : lms;
    const n = pick.length;
    return {
      x: pick.reduce((a, l) => a + l.x_m - half, 0) / n,
      y: pick.reduce((a, l) => a + (l.surface_elev_m - datum) * ex, 0) / n,
      z: pick.reduce((a, l) => a + l.y_m - half, 0) / n,
    };
  })();
  // Screen-right for a camera looking from the south-east is roughly (+x, -z).
  const shift = (k: number): [number, number] => (wide ? [-k * 0.82 * e, k * 0.57 * e] : [0, 0]);
  switch (state.view) {
    case "anomaly": {
      const candidate = site.experiment?.search?.levels.find((l) => l.observed)?.candidates[2];
      if (!candidate)
        return { position: [0.62 * e, 0.42 * e + relief, 0.78 * e], target: [0, relief * 0.25, 0] };
      const x = candidate.x_m - half;
      const z = candidate.y_m - half;
      return {
        position: [x + 0.12 * e, focus.y + 0.14 * e, z + 0.18 * e],
        target: [x, focus.y, z],
      };
    }
    case "hero": {
      // Close oblique look at the focus (the pit): ~0.28 extent away, ~28 deg above the horizon.
      const [sx, sz] = shift(0.07);
      return {
        position: [focus.x + 0.14 * e + sx, focus.y + 0.13 * e, focus.z + 0.2 * e + sz],
        target: [focus.x + sx, focus.y, focus.z + sz],
      };
    }
    case "landmark": {
      const [sx, sz] = shift(0.08);
      return {
        // Aim slightly below the subject so it sits in the upper half, clear of the panels.
        position: [focus.x + 0.2 * e + sx, focus.y + 0.16 * e, focus.z + 0.3 * e + sz],
        target: [focus.x + sx, focus.y - 0.05 * e, focus.z + sz],
      };
    }
    case "section": {
      // Face the cut from the south, close enough that the section dominates the frame.
      const zc = -half + state.cutaway.position * e;
      const sx = wide ? -0.09 * e : 0;
      return {
        position: [focus.x + 0.06 * e + sx, focus.y + 0.07 * e, zc + 0.3 * e],
        target: [focus.x + sx, focus.y - 0.035 * e, zc],
      };
    }
    default:
      return { position: [0.62 * e, 0.42 * e + relief, 0.78 * e], target: [0, relief * 0.25, 0] };
  }
}

export function poseKey(state: SceneState, wide = true): string {
  const cut = state.view === "section" ? state.cutaway.position.toFixed(3) : "";
  return `${state.site}:${state.exaggeration}:${state.view}:${cut}:${wide ? "w" : "n"}`;
}
