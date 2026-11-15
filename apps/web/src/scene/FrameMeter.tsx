import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

/**
 * Opt-in frame-rate meter (`?fps=1`) so frame rate can be checked on any
 * device's own GPU. It reports what this browser renders; it writes into a DOM
 * node directly and never triggers React renders.
 */
export const showFrameMeter = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fps");

export function FrameMeter({ target }: { target: React.RefObject<HTMLDivElement | null> }) {
  const acc = useRef({ frames: 0, start: 0, worst: 0, last: 0 });
  useFrame(({ gl }) => {
    const now = performance.now();
    const a = acc.current;
    if (!a.start) a.start = a.last = now;
    a.worst = Math.max(a.worst, now - a.last);
    a.last = now;
    a.frames++;
    if (now - a.start >= 1000 && target.current) {
      const fps = (a.frames * 1000) / (now - a.start);
      const r = gl.getContext() as WebGLRenderingContext;
      const ext = r.getExtension("WEBGL_debug_renderer_info");
      const gpu = ext ? String(r.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "renderer hidden";
      target.current.textContent = `${fps.toFixed(0)} fps · worst frame ${a.worst.toFixed(0)} ms · ${gl.info.render.triangles.toLocaleString()} tris · ${gpu}`;
      a.frames = 0;
      a.start = now;
      a.worst = 0;
    }
  });
  return null;
}
