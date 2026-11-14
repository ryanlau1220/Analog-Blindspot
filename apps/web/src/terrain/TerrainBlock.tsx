import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildCap, buildSkirts, buildSurface, gridExtent, type MeshArrays } from "./grid";
import { noDataTexture, unmeasuredTexture } from "./hatch";
import type { VariantAssets } from "./useVariantAssets";

export interface TerrainBlockProps {
  assets: VariantAssets;
  /** elevation (m) mapped to scene y = 0; shared by all variants of a site */
  datum: number;
  /** block floor depth below datum (m, display only) */
  depth: number;
  exaggeration: number;
  drape: boolean;
  cut: { enabled: boolean; z: number };
  surfaceColor: string;
}

function toGeometry(m: MeshArrays, computeNormals: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  if (computeNormals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function TerrainBlock({
  assets,
  datum,
  depth,
  exaggeration,
  drape,
  cut,
  surfaceColor,
}: TerrainBlockProps) {
  const { grid } = assets;
  const baseY = -depth;

  const surface = useMemo(() => toGeometry(buildSurface(grid, datum), false), [grid, datum]);
  const skirts = useMemo(() => toGeometry(buildSkirts(grid, datum, baseY), true), [grid, datum, baseY]);
  const cap = useMemo(
    () => (cut.enabled ? buildCap(grid, datum, baseY, cut.z) : null),
    [grid, datum, baseY, cut.enabled, cut.z],
  );
  const capGeom = useMemo(() => (cap ? toGeometry(cap, true) : null), [cap]);
  const gapGeom = useMemo(() => (cap?.gaps.indices.length ? toGeometry(cap.gaps, false) : null), [cap]);
  const gapMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: noDataTexture(), side: THREE.DoubleSide }),
    [],
  );

  // Keep everything north of the cut (z <= zCut); the cap closes the face.
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), []);
  plane.constant = cut.z;
  const planes = useMemo(() => (cut.enabled ? [plane] : []), [cut.enabled, plane]);

  const surfaceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: surfaceColor,
        roughness: 1,
        metalness: 0,
        normalMapType: THREE.ObjectSpaceNormalMap,
        side: THREE.DoubleSide,
      }),
    [surfaceColor],
  );
  surfaceMat.normalMap = assets.normalMap;
  surfaceMat.map = drape ? assets.drape : null;
  surfaceMat.color.set(drape && assets.drape ? "#ffffff" : surfaceColor);
  surfaceMat.clippingPlanes = planes;
  surfaceMat.needsUpdate = true;

  const wallMat = useMemo(() => {
    const t = unmeasuredTexture();
    return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
  }, []);
  wallMat.clippingPlanes = planes;

  const capMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: unmeasuredTexture(), side: THREE.DoubleSide }),
    [],
  );

  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => skirts.dispose(), [skirts]);
  useEffect(() => () => capGeom?.dispose(), [capGeom]);
  useEffect(() => () => gapGeom?.dispose(), [gapGeom]);
  useEffect(() => () => surfaceMat.dispose(), [surfaceMat]);

  const { width } = gridExtent(grid);
  return (
    <group scale={[1, exaggeration, 1]}>
      <mesh geometry={surface} material={surfaceMat} name="terrain-surface" />
      <mesh geometry={skirts} material={wallMat} name="terrain-skirts" />
      {capGeom && <mesh geometry={capGeom} material={capMat} name="terrain-cap" />}
      {gapGeom && <mesh geometry={gapGeom} material={gapMat} name="terrain-cap-nodata" />}
      {cap?.line.map((pts, i) => (
        <Line
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          key={i}
          points={Array.from(
            { length: pts.length / 3 },
            (_, k) =>
              [
                pts[k * 3] as number,
                (pts[k * 3 + 1] as number) + 0.05,
                (pts[k * 3 + 2] as number) + 0.05,
              ] as [number, number, number],
          )}
          color="#f5d36b"
          lineWidth={2}
        />
      ))}
      {/* floor of the display block */}
      <mesh position={[0, baseY - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={wallMat}>
        <planeGeometry args={[width, width]} />
      </mesh>
    </group>
  );
}
