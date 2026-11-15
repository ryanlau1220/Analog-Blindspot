import { Canvas, useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Site, Variant } from "../data/types";
import { TerrainBlock } from "../terrain/TerrainBlock";
import { useVariantAssets } from "../terrain/useVariantAssets";
import { CameraRig } from "./CameraRig";
import { type LabelRegistry, LandmarkLabels, Landmarks } from "./Landmarks";
import { cameraPreset, poseKey, type SceneState, siteDatum } from "./state";

const SURFACE: Record<Site["id"], string> = { moon: "#bdb6ab", earth: "#a99b86", lanzarote: "#948c84" };
export const BG = "#090d16";

export function cutZ(site: Site, position: number): number {
  return -site.extent_m / 2 + position * site.extent_m;
}

/** Landscape screens frame the subject right of centre; portrait keeps it centred. */
export function useWideLayout(): boolean {
  const q = "(min-width: 760px) and (min-aspect-ratio: 1/1)";
  const [wide, setWide] = useState(() => window.matchMedia?.(q).matches ?? true);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function Viewer({
  site,
  variant,
  compareVariant,
  state,
  selected,
  onSelect,
  intro,
  navigationLocked = false,
  focusLab = false,
}: {
  site: Site;
  variant: Variant;
  /** observed variant shown on the left of a draggable split (comparison mode) */
  compareVariant?: Variant | null;
  state: SceneState;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** establishing dolly on first load */
  intro?: boolean;
  navigationLocked?: boolean;
  focusLab?: boolean;
}) {
  const wide = useWideLayout();
  const { assets, loading, error } = useVariantAssets(site, variant);
  const cmpVariant = compareVariant ?? variant;
  const cmp = useVariantAssets(site, cmpVariant);
  const [labels] = useState<LabelRegistry>(() => new Map());
  const [split, setSplit] = useState(0.5);
  const sweep = useRef<gsap.core.Tween | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const stopSweep = useCallback(() => {
    sweep.current?.kill();
    sweep.current = null;
    setSweeping(false);
  }, []);
  // Cancel stale reveals when the selected dataset or comparison changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataset identity controls cleanup
  useEffect(() => {
    stopSweep();
    setSplit(0.5);
    return () => {
      sweep.current?.kill();
    };
  }, [site.id, variant.id, compareVariant?.id]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopSweep();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopSweep]);
  const reveal = () => {
    stopSweep();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSplit(0.5);
      return;
    }
    const cursor = { value: 0.92 };
    setSplit(cursor.value);
    setSweeping(true);
    sweep.current = gsap.to(cursor, {
      value: 0.08,
      duration: 3.6,
      ease: "power2.inOut",
      onUpdate: () => setSplit(cursor.value),
      onComplete: () => {
        setSweeping(false);
        sweep.current = null;
      },
    });
  };
  const datum = siteDatum(site);
  const depth = site.extent_m * 0.12;
  const z = cutZ(site, state.cutaway.position);
  const shown = assets?.key.startsWith(`${site.id}/`) ? assets : null;
  const comparing = !!compareVariant && compareVariant.id !== variant.id;
  const cmpShown = comparing && cmp.assets?.key === `${site.id}/${compareVariant.id}` ? cmp.assets : null;
  const planes = useMemo(() => ({ left: new THREE.Plane(), right: new THREE.Plane() }), []);
  const leftClip = useMemo(() => [planes.left], [planes]);
  const rightClip = useMemo(() => [planes.right], [planes]);
  const moon = site.id === "moon";
  const ready = shown && !loading && (!comparing || cmpShown) ? shown.key : null;

  return (
    <>
      <Canvas
        className="absolute inset-0"
        dpr={[1, 2]}
        gl={{ antialias: true, localClippingEnabled: true }}
        camera={{ fov: 38, position: [0, 500, 1000] }}
        onPointerMissed={() => onSelect(null)}
        fallback={<WebGLMissing />}
      >
        <color attach="background" args={[BG]} />
        {/* Moon: low sun from the west-north-west (~20 deg) so the funnel rim casts shadow.
            Earth: 315 deg azimuth, ~35 deg, matching the reference hillshades. */}
        <directionalLight
          position={moon ? [-0.85, 0.33, -0.42] : [-0.58, 0.57, -0.58]}
          intensity={moon ? 3.6 : 2.6}
        />
        <hemisphereLight args={["#cfd8e6", "#141820", moon ? 0.14 : 0.55]} />
        {shown && (
          <TerrainBlock
            assets={shown}
            datum={datum}
            depth={depth}
            exaggeration={state.exaggeration}
            drape={state.drape === "orthophoto"}
            cut={{ enabled: state.cutaway.enabled, z }}
            surfaceColor={SURFACE[site.id]}
            clip={cmpShown ? rightClip : undefined}
          />
        )}
        {cmpShown && (
          <TerrainBlock
            assets={cmpShown}
            datum={datum}
            depth={depth}
            exaggeration={state.exaggeration}
            drape={state.drape === "orthophoto"}
            cut={{ enabled: state.cutaway.enabled, z }}
            surfaceColor={SURFACE[site.id]}
            clip={leftClip}
          />
        )}
        {cmpShown && <SplitPlanes split={split} left={planes.left} right={planes.right} />}
        <Landmarks
          site={site}
          datum={datum}
          exaggeration={state.exaggeration}
          cutZ={state.cutaway.enabled ? z : null}
          selected={selected}
          labels={labels}
        />
        <CameraRig
          pose={cameraPreset(site, state, wide)}
          poseKey={poseKey(state, wide)}
          far={site.extent_m * 20}
          intro={intro}
          navigationLocked={navigationLocked || sweeping}
        />
        <ReadySignal readyKey={ready} />
      </Canvas>
      {/* Compositional depth: darken the frame edges so the block's rectangle recedes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 75% 70% at ${wide ? "62%" : "50%"} 48%, transparent 45%, ${BG}cc 85%, ${BG} 100%)`,
        }}
      />
      <LandmarkLabels site={site} selected={selected} onSelect={onSelect} labels={labels} />
      {cmpShown && compareVariant && (
        <>
          <SplitHandle
            split={split}
            onSplit={(value) => {
              stopSweep();
              setSplit(value);
            }}
            left={compareVariant}
            right={variant}
          />
          <div className={`ab-reveal-controls ${focusLab ? "is-focused" : ""}`}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-teal-200">
              Same ground · different grid
            </p>
            <button
              type="button"
              data-testid="reveal-sweep"
              onClick={sweeping ? stopSweep : reveal}
              className="ab-small-button mt-2"
            >
              {sweeping ? "Stop reveal" : "Reveal the difference"}
            </button>
            <p className="mt-1 text-[10px] text-zinc-400">
              Left: observed {compareVariant.resolution_m} m / right: simulated {variant.resolution_m} m
            </p>
          </div>
        </>
      )}
      <div
        key={site.id}
        aria-hidden
        className="ab-site-fade pointer-events-none absolute inset-0 bg-[#090d16]"
      />
      {(loading || error) && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-zinc-300">
          {error ? `Failed to load ${variant.id}: ${error}` : `Loading ${variant.label.split(".")[0]}…`}
        </div>
      )}
    </>
  );
}

function WebGLMissing() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-300">
      This experience needs WebGL. Your browser or device has it disabled; the printable brief (#brief) still
      works.
    </div>
  );
}

/**
 * Screen-space vertical split: a plane through the camera and the screen line
 * x = split. The observed grid keeps the left side, the simulated grid the
 * right. Planes are updated in place every frame (no material recompiles).
 */
function SplitPlanes({ split, left, right }: { split: number; left: THREE.Plane; right: THREE.Plane }) {
  const v = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: new THREE.Vector3() }), []);
  useFrame(({ camera }) => {
    const x = split * 2 - 1;
    const c = camera.position;
    v.a.set(x, 1, 0.5).unproject(camera).sub(c);
    v.b.set(x, -1, 0.5).unproject(camera).sub(c);
    const n = v.a.clone().cross(v.b).normalize();
    right.setFromNormalAndCoplanarPoint(n, c);
    v.r.set(Math.min(x + 0.2, 1), 0, 0.5).unproject(camera);
    if (right.distanceToPoint(v.r) < 0) right.negate();
    left.copy(right).negate();
  });
  return null;
}

function SplitHandle({
  split,
  onSplit,
  left,
  right,
}: {
  split: number;
  onSplit: (v: number) => void;
  left: Variant;
  right: Variant;
}) {
  const box = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) onSplit(Math.min(Math.max((e.clientX - r.left) / r.width, 0.05), 0.95));
  };
  return (
    <div ref={box} className="pointer-events-none absolute inset-0">
      <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${split * 100}%` }}>
        <button
          type="button"
          role="slider"
          aria-label={`Comparison split, observed ${left.resolution_m} m left and simulated ${right.resolution_m} m right`}
          aria-valuemin={5}
          aria-valuemax={95}
          aria-valuenow={Math.round(split * 100)}
          data-testid="split-handle"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => e.buttons && move(e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              e.stopPropagation();
            }
            if (e.key === "ArrowLeft") onSplit(Math.max(split - 0.05, 0.05));
            if (e.key === "ArrowRight") onSplit(Math.min(split + 0.05, 0.95));
          }}
          className="pointer-events-auto absolute top-1/2 -left-4 flex h-8 w-8 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-white/80 bg-black/70 text-xs text-white"
        >
          ⇆
        </button>
      </div>
    </div>
  );
}

/** Publishes the rendered variant to the test hooks after two drawn frames. */
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
