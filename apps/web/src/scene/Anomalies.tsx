import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { AnomalyCandidate, Site } from "../data/types";
import { type Grid, sampleHeight } from "../terrain/grid";

/**
 * Unverified relief anomalies from the lattice search: a dashed-looking amber
 * ring of the search radius at each cluster peak, draped at the height of the
 * grid on screen. They mark where to look, not features that were found.
 */
export function Anomalies({
  site,
  grid,
  datum,
  exaggeration,
  candidates,
  radius,
}: {
  site: Site;
  grid: Grid;
  datum: number;
  exaggeration: number;
  candidates: AnomalyCandidate[];
  radius: number;
}) {
  const half = site.extent_m / 2;
  const geom = useMemo(() => new THREE.RingGeometry(radius * 0.86, radius, 40, 1), [radius]);
  const near = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#86efac",
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    [],
  );
  useEffect(() => () => near.dispose(), [near]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#fbbf24",
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    [],
  );
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => () => mat.dispose(), [mat]);
  const pts = useMemo(
    () =>
      candidates
        .map((c, i) => {
          const x = c.x_m - half;
          const z = c.y_m - half;
          const h = sampleHeight(grid, x, z);
          const y = (h - datum) * exaggeration + site.extent_m * 0.004;
          return Number.isFinite(h) ? { i, x, z, y, near: !!c.near_holdout_entrance } : null;
        })
        .filter((p): p is { i: number; x: number; z: number; y: number; near: boolean } => p !== null),
    [candidates, grid, datum, exaggeration, half, site.extent_m],
  );
  return (
    <group name="anomaly-candidates" renderOrder={10}>
      {pts.map((p) => (
        <mesh
          key={p.i}
          geometry={geom}
          material={p.near ? near : mat}
          position={[p.x, p.y, p.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={10}
        />
      ))}
    </group>
  );
}
