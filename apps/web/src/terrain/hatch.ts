import * as THREE from "three";

let hatch: THREE.CanvasTexture | null = null;

/** Diagonal hatch used for every below-surface face: "not measured". */
export function unmeasuredTexture(): THREE.CanvasTexture {
  if (hatch) return hatch;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "#0d121c";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#1f2838";
  ctx.lineWidth = 7;
  for (let k = -size; k <= size * 2; k += size / 2) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k - size, size);
    ctx.stroke();
  }
  hatch = new THREE.CanvasTexture(canvas);
  hatch.wrapS = THREE.RepeatWrapping;
  hatch.wrapT = THREE.RepeatWrapping;
  hatch.colorSpace = THREE.SRGBColorSpace;
  hatch.anisotropy = 8;
  return hatch;
}

let nodata: THREE.CanvasTexture | null = null;

/** Magenta cross-hatch for "no elevation data" (matches the magenta used in the Phase A previews). */
export function noDataTexture(): THREE.CanvasTexture {
  if (nodata) return nodata;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "#3a0f36";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#e040c8";
  ctx.lineWidth = 6;
  for (let k = -size; k <= size * 2; k += size / 2) {
    for (const [y0, y1] of [
      [0, size],
      [size, 0],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(k, y0);
      ctx.lineTo(k - size, y1);
      ctx.stroke();
    }
  }
  nodata = new THREE.CanvasTexture(canvas);
  nodata.wrapS = THREE.RepeatWrapping;
  nodata.wrapT = THREE.RepeatWrapping;
  nodata.colorSpace = THREE.SRGBColorSpace;
  nodata.anisotropy = 8;
  return nodata;
}
