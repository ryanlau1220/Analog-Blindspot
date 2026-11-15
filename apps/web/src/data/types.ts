/** Shapes of public/data/sites.json, written by `uv run export-web`. */

export type SiteId = "moon" | "earth" | "lanzarote";

export interface HeightsAsset {
  file: string;
  dtype: "float32-le";
  rows: number;
  cols: number;
  nodata: "NaN";
  bytes: number;
  sha256: string;
}

export interface NormalMapAsset {
  file: string;
  px: number;
  m_per_px: number;
  bytes: number;
  filter: "linear" | "nearest";
  basis: string;
}

export interface Variant {
  id: string;
  resolution_m: number;
  observed: boolean;
  label: string;
  display: { grid: number; cell_m: number; geometry: string };
  heights: HeightsAsset;
  elevation: { min_m: number; max_m: number; nan_count: number };
  normal_map: NormalMapAsset;
  derived_from: { path: string; sha256: string };
  /**
   * An independent observation by a different instrument (NASA NASADEM), shown
   * for comparison only. It is neither the site's observed grid nor a simulation,
   * and it is never part of the coarsening scrubber.
   */
  reference?: boolean;
}

/** Independent NASA elevation product over the same ROI, compared with the simulated grid. */
export interface NasaReference {
  variant_id: string;
  /** the NASADEM grid on the site's display grid (``reference: true``) */
  variant: Variant;
  title: string;
  product_id: string;
  tiles: string[];
  landing_page: string;
  license: string;
  citation: string;
  resolution_m: number;
  vertical: string;
  comparison: {
    /** id of the simulated variant compared against */
    against_variant_id: string;
    rmse_m: number;
    /** mean of (NASADEM - simulated), metres; includes the datum difference */
    bias_m: number;
    /** RMSE after removing the mean offset */
    rmse_detrended_m: number;
    pearson_r: number;
    cells: number;
    note: string;
  };
}

/** NASA POWER climatology at the site (2 m air temperature extremes). */
export interface SurfaceClimate {
  source: string;
  url: string;
  lat: number;
  lon: number;
  /** highest 2 m air temperature in the POWER climatology, deg C */
  t2m_max_c: number;
  /** lowest 2 m air temperature in the POWER climatology, deg C */
  t2m_min_c: number;
  period: string;
  note: string;
}

export interface AnomalyCandidate {
  x_m: number;
  y_m: number;
  relief_m: number;
  /** lattice cells in this connected anomaly cluster */
  cells: number;
}

export interface AnomalySearchLevel {
  resolution_m: number;
  observed: boolean;
  /** relief threshold (the lattice percentile), null when not measurable */
  threshold_m: number | null;
  lattice_points: number;
  flagged_points: number;
  /** gazetteer points within match_radius_m of a flagged lattice point */
  landmarks_recovered: number;
  landmark_count: number;
  /** same test for the seeded random background points (chance level) */
  random_recovered_fraction: number | null;
  /** clusters not near any gazetteer point, highest relief first (unverified) */
  candidates: AnomalyCandidate[];
}

/** Systematic search: relief on a regular lattice across the whole ROI, not only at named points. */
export interface AnomalySearch {
  spacing_m: number;
  radius_m: number;
  percentile: number;
  match_radius_m: number;
  note: string;
  levels: AnomalySearchLevel[];
}

export interface Landmark {
  id: string;
  name: string;
  kind: "pit" | "natural_bridge" | "jameo";
  /** metres east of the ROI north-west corner */
  x_m: number;
  /** metres south of the ROI north-west corner */
  y_m: number;
  surface_elev_m: number;
  /** geographic position from the gazetteer (degrees; Moon: planetocentric, lon east 0-360) */
  lat?: number;
  lon?: number;
  source: string;
  notes: string[];
}

export interface Provenance {
  dataset_id: string;
  title: string;
  product_id: string;
  doi: string | null;
  landing_page: string;
  license: string;
  credit: string | null;
  citation: string;
  citations?: string[];
}

export interface Site {
  id: SiteId;
  body: "Moon" | "Earth";
  name: string;
  extent_m: number;
  crs: string;
  vertical: string;
  provenance: Provenance;
  variants: Variant[];
  drape: { file: string; px: number; m_per_px: number; label: string } | null;
  /** preview hillshade of the observed grid (Earth sites) */
  thumb?: { file: string; px: number; basis: string };
  landmarks: Landmark[];
  subsurface: "not measured";
  facts?: MoonFacts;
  experiment?: Experiment;
  /** Earth sites: independent NASA elevation observation over the same ROI */
  nasa_reference?: NasaReference;
  /** Earth sites: NASA POWER air-temperature climatology */
  climate?: SurfaceClimate;
}

export interface MoonFacts {
  pit_lat: number;
  pit_lon_east: number;
  atlas_funnel_diameter_m: [number, number];
  atlas_inner_diameter_m: [number, number];
  atlas_depth_m: number;
  gap_extent_ew_m: number;
  gap_extent_ns_m: number;
  gap_equivalent_diameter_m: number;
  gap_posts: number;
  depression_lower_bound_m: number;
  rim_annulus_m: [number, number];
  lola_tie_rms_m: number;
  socet_precision_m: number;
  product_valid_fraction: number;
  effective_resolution_note: string;
}

export interface ExperimentLevel {
  resolution_m: number;
  observed: boolean;
  landmark_relief_median_m: number | null;
  background_relief_median_m: number | null;
  landmark_relief_m: Record<string, number | null>;
  background_relief_samples_m: number[];
  background_seed_medians_m: number[];
  slope_deg_p95: number;
}

export interface Experiment {
  measure: string;
  radius_m: number;
  landmark_count: number;
  background_points: number;
  background_note: string;
  method: string;
  levels: ExperimentLevel[];
  caveat: string;
  search?: AnomalySearch;
}

export interface Candidate {
  id: string;
  site: string;
  body?: "Earth" | "Mars";
  status: "validated" | "not_verified";
  elevation_product: string;
  note: string;
  url: string;
  /** representative point (degrees; Mars: lon east 0-360) */
  lat?: number;
  lon?: number;
  /** what the point is, e.g. "Garden Bridges (USGS GNIS)" */
  point_label?: string;
  /** source of the point coordinates */
  point_source?: string;
}

export interface SitesIndex {
  asset_version: string;
  manifest_generated_utc: string;
  manifest_sha256: string;
  axes: string;
  sites: Site[];
  candidates: Candidate[];
  landmark_sources?: Array<{ site: SiteId; source: string; url: string }>;
}
