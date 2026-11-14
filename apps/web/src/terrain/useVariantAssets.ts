import { useEffect, useState } from "react";
import * as THREE from "three";
import { loadHeights, variantDir } from "../data/load";
import type { Site, Variant } from "../data/types";
import type { Grid } from "./grid";

export interface VariantAssets {
  key: string;
  grid: Grid;
  normalMap: THREE.Texture;
  drape: THREE.Texture | null;
}

const cache = new Map<string, Promise<VariantAssets>>();
const loader = new THREE.TextureLoader();

function configureNormal(tex: THREE.Texture, filter: Variant["normal_map"]["filter"]): THREE.Texture {
  tex.colorSpace = THREE.NoColorSpace; // vector data, not colour
  if (filter === "nearest") {
    // coarse variants: show cells as cells, no smoothing
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  } else {
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.anisotropy = 4;
  return tex;
}

export function assetKey(site: Site, variant: Variant): string {
  return `${site.id}/${variant.id}`;
}

export function loadVariantAssets(site: Site, variant: Variant): Promise<VariantAssets> {
  const key = assetKey(site, variant);
  let p = cache.get(key);
  if (!p) {
    const dir = variantDir(site.id, variant.id);
    p = Promise.all([
      loadHeights(`${dir}/${variant.heights.file}`, variant.heights),
      loader.loadAsync(`${dir}/${variant.normal_map.file}`),
      site.drape ? loader.loadAsync(`${dir}/${site.drape.file}`) : Promise.resolve(null),
    ]).then(([heights, normal, drape]) => {
      if (drape) drape.colorSpace = THREE.SRGBColorSpace;
      return {
        key,
        grid: {
          heights,
          rows: variant.heights.rows,
          cols: variant.heights.cols,
          cell: variant.display.cell_m,
        },
        normalMap: configureNormal(normal, variant.normal_map.filter),
        drape,
      };
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Lazy-load a variant; keeps showing the previous one until the new one is ready. */
export function useVariantAssets(
  site: Site,
  variant: Variant,
): {
  assets: VariantAssets | null;
  loading: boolean;
  error: string | null;
} {
  const [assets, setAssets] = useState<VariantAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = assetKey(site, variant);
  useEffect(() => {
    let live = true;
    setError(null);
    loadVariantAssets(site, variant).then(
      (a) => live && setAssets(a),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [site, variant]);
  return { assets, loading: assets?.key !== key && !error, error };
}
