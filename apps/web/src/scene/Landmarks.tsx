import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Landmark, Site } from "../data/types";

/** DOM elements of the label overlay, keyed by landmark id (filled by LandmarkLabels). */
export type LabelRegistry = Map<string, HTMLElement>;

/**
 * Evidence markers. Heights come from the exported landmark record (pit: rim
 * median, because the pit itself has no elevation data), not from the variant
 * on screen, so a marker never moves when a coarsened surface is shown.
 *
 * Labels are plain DOM buttons positioned every frame by projecting the marker
 * (no React re-render, no per-label React roots).
 */
export function Landmarks({
  site,
  datum,
  exaggeration,
  cutZ,
  selected,
  labels,
}: {
  site: Site;
  datum: number;
  exaggeration: number;
  cutZ: number | null;
  selected: string | null;
  labels: LabelRegistry;
}) {
  const half = site.extent_m / 2;
  const lift = site.extent_m * 0.02;
  const anchors = useMemo(
    () =>
      site.landmarks.map((lm) => ({
        lm,
        base: new THREE.Vector3(lm.x_m - half, (lm.surface_elev_m - datum) * exaggeration, lm.y_m - half),
      })),
    [site, half, datum, exaggeration],
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    for (const { lm, base } of anchors) {
      const el = labels.get(lm.id);
      if (!el) continue;
      const hidden = cutZ !== null && base.z > cutZ;
      tmp.set(base.x, base.y + lift, base.z).project(camera);
      if (hidden || tmp.z > 1 || tmp.z < -1) {
        el.style.visibility = "hidden";
        continue;
      }
      const x = (tmp.x * 0.5 + 0.5) * size.width;
      const y = (-tmp.y * 0.5 + 0.5) * size.height;
      el.style.visibility = "visible";
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  });

  return (
    <group>
      {anchors.map(({ lm, base }: { lm: Landmark; base: THREE.Vector3 }) =>
        cutZ !== null && base.z > cutZ ? null : (
          <mesh key={lm.id} position={[base.x, base.y + lift / 2, base.z]}>
            <cylinderGeometry args={[site.extent_m * 0.0012, site.extent_m * 0.0012, lift, 6]} />
            <meshBasicMaterial color={selected === lm.id ? "#ffe08a" : "#f5b942"} />
          </mesh>
        ),
      )}
    </group>
  );
}

export function LandmarkLabels({
  site,
  selected,
  onSelect,
  labels,
}: {
  site: Site;
  selected: string | null;
  onSelect: (id: string | null) => void;
  labels: LabelRegistry;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {site.landmarks.map((lm) => {
        const active = selected === lm.id;
        return (
          <button
            key={lm.id}
            type="button"
            data-landmark={lm.id}
            ref={(el) => {
              if (el) labels.set(lm.id, el);
              else labels.delete(lm.id);
            }}
            onClick={() => onSelect(active ? null : lm.id)}
            style={{ visibility: "hidden" }}
            className={`pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] backdrop-blur transition-colors ${
              active
                ? "border-amber-200 bg-amber-300/90 text-black"
                : "border-amber-300/50 bg-black/60 text-amber-100 hover:bg-black/80"
            }`}
          >
            {lm.name}
          </button>
        );
      })}
    </div>
  );
}
