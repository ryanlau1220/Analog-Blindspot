import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Site, Variant } from "../data/types";
import { TerrainBlock } from "../terrain/TerrainBlock";
import { useVariantAssets } from "../terrain/useVariantAssets";
import { CameraRig } from "./CameraRig";
import { type LabelRegistry, LandmarkLabels, Landmarks } from "./Landmarks";
import { cameraPreset, poseKey, type SceneState, siteDatum } from "./state";

const SURFACE = { moon: "#b9b4aa", earth: "#a99b86" } as const;

export function cutZ(site: Site, position: number): number {
  return -site.extent_m / 2 + position * site.extent_m;
}

export function Viewer({
  site,
  variant,
  state,
  selected,
  onSelect,
}: {
  site: Site;
  variant: Variant;
  state: SceneState;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { assets, loading, error } = useVariantAssets(site, variant);
  const [labels] = useState<LabelRegistry>(() => new Map());
  const datum = siteDatum(site);
  const depth = site.extent_m * 0.12;
  const z = cutZ(site, state.cutaway.position);
  // Only render assets that belong to the current site (the previous variant of
  // the same site may stay on screen while the next one streams in).
  const shown = assets?.key.startsWith(`${site.id}/`) ? assets : null;

  return (
    <>
      <Canvas
        className="absolute inset-0"
        dpr={[1, 2]}
        gl={{ antialias: true, localClippingEnabled: true }}
        camera={{ fov: 40, position: [0, 500, 1000] }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={[site.id === "moon" ? "#050507" : "#0b0d10"]} />
        {/* fixed sun: azimuth 315 deg, altitude 35 deg (matches the reference hillshades' direction) */}
        <directionalLight position={[-0.58, 0.57, -0.58]} intensity={site.id === "moon" ? 3.2 : 2.6} />
        <hemisphereLight args={["#cfd8e6", "#20201c", site.id === "moon" ? 0.25 : 0.6]} />
        {shown && (
          <TerrainBlock
            assets={shown}
            datum={datum}
            depth={depth}
            exaggeration={state.exaggeration}
            drape={state.drape === "orthophoto"}
            cut={{ enabled: state.cutaway.enabled, z }}
            surfaceColor={SURFACE[site.id]}
          />
        )}
        <Landmarks
          site={site}
          datum={datum}
          exaggeration={state.exaggeration}
          cutZ={state.cutaway.enabled ? z : null}
          selected={selected}
          labels={labels}
        />
        <CameraRig pose={cameraPreset(site, state)} poseKey={poseKey(state)} far={site.extent_m * 20} />
        <ReadySignal readyKey={shown && !loading ? shown.key : null} />
      </Canvas>
      <LandmarkLabels site={site} selected={selected} onSelect={onSelect} labels={labels} />
      {(loading || error) && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-zinc-300">
          {error ? `Failed to load ${variant.id}: ${error}` : `Loading ${variant.label.split(".")[0]}…`}
        </div>
      )}
    </>
  );
}

/** Publishes the rendered variant to the perf smoke test after two drawn frames. */
function ReadySignal({ readyKey }: { readyKey: string | null }) {
  const frames = useRef(0);
  const last = useRef<string | null>(null);
  useFrame(({ gl, camera }) => {
    if (!window.__ab) return;
    window.__ab.render = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    window.__ab.camera = camera.position.toArray().map((v) => Math.round(v)) as [number, number, number];
    if (readyKey !== last.current) {
      last.current = readyKey;
      frames.current = 0;
      window.__ab.readyKey = null;
    }
    if (readyKey && ++frames.current === 2) window.__ab.readyKey = readyKey;
  });
  return null;
}
