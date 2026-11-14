import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import gsap from "gsap";
import { type ComponentRef, useEffect, useRef } from "react";

import type { CameraPose } from "./state";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Moves the camera to ``pose`` whenever ``poseKey`` changes. A new request (or
 * the user grabbing the controls) kills the running tween, and the next tween
 * starts from wherever the camera actually is, so states can be visited in any
 * order without a stale or broken camera.
 */
export function CameraRig({ pose, poseKey, far }: { pose: CameraPose; poseKey: string; far: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const tween = useRef<gsap.core.Timeline | null>(null);
  const first = useRef(true);

  useEffect(() => {
    camera.far = far;
    camera.near = far / 20000;
    camera.updateProjectionMatrix();
  }, [camera, far]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tween only when the pose key changes
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    tween.current?.kill();
    if (first.current || reducedMotion()) {
      first.current = false;
      camera.position.set(...pose.position);
      c.target.set(...pose.target);
      c.update();
      return;
    }
    const tl = gsap.timeline({ onUpdate: () => c.update() });
    tl.to(
      camera.position,
      { x: pose.position[0], y: pose.position[1], z: pose.position[2], duration: 1.6, ease: "power2.inOut" },
      0,
    );
    tl.to(
      c.target,
      { x: pose.target[0], y: pose.target[1], z: pose.target[2], duration: 1.6, ease: "power2.inOut" },
      0,
    );
    tween.current = tl;
    return () => {
      tl.kill();
    };
  }, [poseKey]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => tween.current?.kill();
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, []);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={far / 400}
      maxDistance={far / 2}
    />
  );
}
