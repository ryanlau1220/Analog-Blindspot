/** Shapes of public/data/sites.json, written by `uv run export-web`. */

export type SiteId = "moon" | "earth";

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
}

export interface Landmark {
  id: string;
  name: string;
  kind: "pit" | "natural_bridge";
  /** metres east of the ROI north-west corner */
  x_m: number;
  /** metres south of the ROI north-west corner */
  y_m: number;
  surface_elev_m: number;
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
  landmarks: Landmark[];
  subsurface: "not measured";
  facts?: MoonFacts;
  experiment?: Experiment;
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
}

export interface Candidate {
  id: string;
  site: string;
  status: "validated" | "not_verified";
  elevation_product: string;
  note: string;
  url: string;
}

export interface SitesIndex {
  asset_version: string;
  manifest_generated_utc: string;
  manifest_sha256: string;
  axes: string;
  sites: Site[];
  candidates: Candidate[];
}
