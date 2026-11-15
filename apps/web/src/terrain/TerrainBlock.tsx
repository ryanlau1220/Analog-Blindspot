import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildCap, buildSkirts, buildSurface, gridExtent, type MeshArrays, noDataOutline } from "./grid";
import { noDataTexture, unmeasuredTexture } from "./hatch";
import type { VariantAssets } from "./useVariantAssets";

/** Scientific colour semantics shared with the UI (see docs/storytelling.md). */
export const COLORS = {
  measured: "#5eead4", // observed surface profile (cyan)
  nodata: "#e040c8", // no elevation data (magenta)
} as const;

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
  /** extra clipping planes (split-screen comparison); mutated in place by the caller */
  clip?: THREE.Plane[];
  /** draw the outline where measured elevation stops */
  outline?: boolean;
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

const toPoints = (pts: Float32Array, dz = 0) =>
  Array.from(
    { length: pts.length / 3 },
    (_, k) =>
      [pts[k * 3] as number, pts[k * 3 + 1] as number, (pts[k * 3 + 2] as number) + dz] as [
        number,
        number,
        number,
      ],
  );

export function TerrainBlock({
  assets,
  datum,
  depth,
  exaggeration,
  drape,
  cut,
  surfaceColor,
  clip,
  outline = true,
}: TerrainBlockProps) {
  const { grid } = assets;
  const baseY = -depth;

  // Geometry depends only on the grid (cached per variant); disposed when replaced.
  const surface = useMemo(() => toGeometry(buildSurface(grid, datum), false), [grid, datum]);
  const skirts = useMemo(() => toGeometry(buildSkirts(grid, datum, baseY), true), [grid, datum, baseY]);
  const holes = useMemo(() => noDataOutline(grid, datum, 0.3), [grid, datum]);
  const cap = useMemo(
    () => (cut.enabled ? buildCap(grid, datum, baseY, cut.z) : null),
    [grid, datum, baseY, cut.enabled, cut.z],
  );
  const capGeom = useMemo(() => (cap ? toGeometry(cap, true) : null), [cap]);
  const gapGeom = useMemo(() => (cap?.gaps.indices.length ? toGeometry(cap.gaps, false) : null), [cap]);

  // Keep everything north of the cut (z <= zCut); the cap closes the face.
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), []);
  plane.constant = cut.z;
  const planes = useMemo(
    () => [...(cut.enabled ? [plane] : []), ...(clip ?? [])],
    [cut.enabled, plane, clip],
  );

  // Materials are owned by this block. Shared textures (cached assets, hatch) are never disposed here.
  const surfaceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 1,
        metalness: 0,
        normalMapType: THREE.ObjectSpaceNormalMap,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const wallMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: unmeasuredTexture(), side: THREE.DoubleSide }),
    [],
  );
  const capMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: unmeasuredTexture(), side: THREE.DoubleSide }),
    [],
  );
  const gapMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: noDataTexture(), side: THREE.DoubleSide }),
    [],
  );

  // Recompile only when the set of maps/planes actually changes.
  const map = drape ? assets.drape : null;
  useEffect(() => {
    surfaceMat.normalMap = assets.normalMap;
    surfaceMat.map = map;
    surfaceMat.color.set(map ? "#ffffff" : surfaceColor);
    for (const m of [surfaceMat, wallMat, capMat, gapMat]) {
      m.clippingPlanes = planes;
      m.needsUpdate = true;
    }
  }, [surfaceMat, wallMat, capMat, gapMat, assets.normalMap, map, surfaceColor, planes]);
  // Apply synchronously too, so the first frame after a variant switch is correct.
  surfaceMat.normalMap = assets.normalMap;
  surfaceMat.map = map;

  useEffect(() => () => surface.dispose(), [surface]);
  useEffect(() => () => skirts.dispose(), [skirts]);
  useEffect(() => () => capGeom?.dispose(), [capGeom]);
  useEffect(() => () => gapGeom?.dispose(), [gapGeom]);
  useEffect(
    () => () => {
      for (const m of [surfaceMat, wallMat, capMat, gapMat]) m.dispose();
    },
    [surfaceMat, wallMat, capMat, gapMat],
  );

  const { width } = gridExtent(grid);
  return (
    <group scale={[1, exaggeration, 1]}>
      <mesh geometry={surface} material={surfaceMat} name="terrain-surface" />
      {cut.enabled && (
        <mesh geometry={surface} name="display-grid">
          <meshBasicMaterial
            wireframe
            color="#5eead4"
            transparent
            opacity={0.16}
            depthWrite={false}
            clippingPlanes={planes}
          />
        </mesh>
      )}
      <mesh geometry={skirts} material={wallMat} name="terrain-skirts" />
      {capGeom && <mesh geometry={capGeom} material={capMat} name="terrain-cap" />}
      {gapGeom && <mesh geometry={gapGeom} material={gapMat} name="terrain-cap-nodata" />}
      {outline && holes.length > 0 && !clip?.length && (
        <Line points={toPoints(holes)} segments color={COLORS.nodata} lineWidth={2} />
      )}
      {cap?.line.map((pts, i) => (
        <Line
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          key={i}
          points={toPoints(pts, 0.05)}
          color={COLORS.measured}
          lineWidth={2.5}
        />
      ))}
      {/* floor of the display block */}
      <mesh position={[0, baseY - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={wallMat}>
        <planeGeometry args={[width, width]} />
      </mesh>
    </group>
  );
}
