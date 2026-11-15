import type { HeightsAsset, SiteId, SitesIndex } from "./types";

export const DATA_ROOT = `${import.meta.env.BASE_URL}data`;

export function variantDir(site: SiteId, variantId: string): string {
  return site === "moon" ? `${DATA_ROOT}/moon` : `${DATA_ROOT}/${site}/${variantId}`;
}

export function validateIndex(raw: unknown): SitesIndex {
  const idx = raw as SitesIndex;
  if (!idx || !Array.isArray(idx.sites) || idx.sites.length === 0) {
    throw new Error("sites.json: no sites");
  }
  for (const s of idx.sites) {
    if (s.subsurface !== "not measured") throw new Error(`${s.id}: unexpected subsurface claim`);
    if (!s.variants.some((v) => v.observed)) throw new Error(`${s.id}: no observed variant`);
    const ref = s.nasa_reference?.variant;
    if (
      ref &&
      (!ref.reference || ref.observed || ref.label.includes("SIMULATED") || !ref.label.includes("NASA"))
    ) {
      throw new Error(
        `${s.id}/${ref.id}: reference grid must be labelled as an independent NASA observation`,
      );
    }
    for (const v of [...s.variants, ...(ref ? [ref] : [])]) {
      if (!v.observed && !v.reference && !v.label.includes("SIMULATED")) {
        throw new Error(`${s.id}/${v.id}: simulated variant is not labelled SIMULATED`);
      }
      if (v.heights.rows * v.heights.cols * 4 !== v.heights.bytes) {
        throw new Error(`${s.id}/${v.id}: heights byte size mismatch`);
      }
    }
  }
  return idx;
}

export async function loadIndex(): Promise<SitesIndex> {
  const res = await fetch(`${DATA_ROOT}/sites.json`);
  if (!res.ok) throw new Error(`sites.json: HTTP ${res.status}`);
  return validateIndex(await res.json());
}

/** Decode a little-endian float32 grid; NaN marks nodata. */
export function parseHeights(buf: ArrayBuffer, meta: HeightsAsset): Float32Array {
  if (buf.byteLength !== meta.rows * meta.cols * 4) {
    throw new Error(`${meta.file}: expected ${meta.rows * meta.cols * 4} bytes, got ${buf.byteLength}`);
  }
  const view = new DataView(buf);
  const out = new Float32Array(meta.rows * meta.cols);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export async function loadHeights(url: string, meta: HeightsAsset): Promise<Float32Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseHeights(await res.arrayBuffer(), meta);
}
