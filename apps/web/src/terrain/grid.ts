/**
 * Pure terrain-mesh construction from a regular height grid.
 *
 * Scene axes: X east, Y up, Z south, origin at the ROI centre. Grid row 0 is
 * the northern edge. Vertices sit at cell centres, so vertex (r, c) is at
 * x = (c + 0.5) * cell - extent / 2, z = (r + 0.5) * cell - extent / 2.
 *
 * Nodata (NaN) is never filled: any triangle touching a NaN vertex is dropped,
 * leaving a visible hole.
 */

export interface Grid {
  heights: Float32Array;
  rows: number;
  cols: number;
  cell: number;
}

export interface MeshArrays {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export function gridExtent(g: Grid): { width: number; depth: number } {
  return { width: g.cols * g.cell, depth: g.rows * g.cell };
}

export function vertexX(g: Grid, c: number): number {
  return (c + 0.5) * g.cell - gridExtent(g).width / 2;
}

export function vertexZ(g: Grid, r: number): number {
  return (r + 0.5) * g.cell - gridExtent(g).depth / 2;
}

/** Top surface. Heights are offset by ``datum`` so the scene stays near y = 0. */
export function buildSurface(g: Grid, datum: number): MeshArrays {
  const { rows, cols, heights } = g;
  const { width, depth } = gridExtent(g);
  const n = rows * cols;
  const positions = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const h = heights[i] as number;
      const x = vertexX(g, c);
      const z = vertexZ(g, r);
      positions[i * 3] = x;
      positions[i * 3 + 1] = Number.isFinite(h) ? h - datum : 0;
      positions[i * 3 + 2] = z;
      // texture row 0 is north; three.js flips images so v = 1 is the top row
      uvs[i * 2] = (x + width / 2) / width;
      uvs[i * 2 + 1] = 1 - (z + depth / 2) / depth;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      const fa = Number.isFinite(heights[a]);
      const fb = Number.isFinite(heights[b]);
      const fd = Number.isFinite(heights[d]);
      const fe = Number.isFinite(heights[e]);
      // counter-clockwise seen from +Y
      if (fa && fd && fb) idx.push(a, d, b);
      if (fb && fd && fe) idx.push(b, d, e);
    }
  }
  return { positions, uvs, indices: new Uint32Array(idx) };
}

/** Vertical walls from the outer edge of the surface down to ``baseY``. */
export function buildSkirts(g: Grid, datum: number, baseY: number): MeshArrays {
  const { rows, cols, heights } = g;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  type P = [number, number, number];
  // Walls stand on the outermost vertex lines (half a cell inside the ROI frame)
  // so they meet the surface exactly. Each edge is walked so quads face outward.
  const zN = vertexZ(g, 0);
  const zS = vertexZ(g, rows - 1);
  const xW = vertexX(g, 0);
  const xE = vertexX(g, cols - 1);
  const north: P[] = [];
  const south: P[] = [];
  const west: P[] = [];
  const east: P[] = [];
  for (let c = cols - 1; c >= 0; c--) north.push([vertexX(g, c), heights[c] as number, zN]);
  for (let c = 0; c < cols; c++) south.push([vertexX(g, c), heights[(rows - 1) * cols + c] as number, zS]);
  for (let r = 0; r < rows; r++) west.push([xW, heights[r * cols] as number, vertexZ(g, r)]);
  for (let r = rows - 1; r >= 0; r--) east.push([xE, heights[r * cols + cols - 1] as number, vertexZ(g, r)]);
  for (const pts of [north, east, south, west]) {
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k] as P;
      const q = pts[k + 1] as P;
      if (!Number.isFinite(p[1]) || !Number.isFinite(q[1])) continue;
      const base = pos.length / 3;
      pos.push(p[0], p[1] - datum, p[2], q[0], q[1] - datum, q[2], q[0], baseY, q[2], p[0], baseY, p[2]);
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    }
  }
  return { positions: new Float32Array(pos), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}

/**
 * Surface profile along the east-west line at scene z = ``zCut``, linearly
 * interpolated between the two neighbouring grid rows. NaN where either row is
 * nodata (the gap is reported, not bridged).
 */
export function profileAtZ(g: Grid, zCut: number): { xs: Float32Array; hs: Float32Array } {
  const { rows, cols, heights } = g;
  const rf = (zCut + gridExtent(g).depth / 2) / g.cell - 0.5;
  const r0 = Math.min(Math.max(Math.floor(rf), 0), rows - 1);
  const r1 = Math.min(r0 + 1, rows - 1);
  const t = Math.min(Math.max(rf - r0, 0), 1);
  const xs = new Float32Array(cols);
  const hs = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    xs[c] = vertexX(g, c);
    const a = heights[r0 * cols + c] as number;
    const b = heights[r1 * cols + c] as number;
    hs[c] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * t : Number.NaN;
  }
  return { xs, hs };
}

/** Cross-section cap at z = zCut from the measured surface down to baseY, facing +Z. */
export function buildCap(
  g: Grid,
  datum: number,
  baseY: number,
  zCut: number,
): MeshArrays & {
  line: Float32Array[];
  gapCount: number;
  /** Quads that close nodata gaps in the section, up to the higher neighbouring edge. Not a surface. */
  gaps: MeshArrays;
} {
  const { xs, hs } = profileAtZ(g, zCut);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const line: Float32Array[] = [];
  let run: number[] = [];
  let gapCount = 0;
  const { width } = gridExtent(g);
  const flush = () => {
    if (run.length >= 6) line.push(new Float32Array(run));
    run = [];
  };
  for (let c = 0; c < xs.length; c++) {
    const h = hs[c] as number;
    if (!Number.isFinite(h)) {
      if (c > 0 && Number.isFinite(hs[c - 1])) gapCount++;
      flush();
      continue;
    }
    run.push(xs[c] as number, h - datum, zCut);
    const n = hs[c + 1];
    if (c + 1 < xs.length && n !== undefined && Number.isFinite(n)) {
      const x0 = xs[c] as number;
      const x1 = xs[c + 1] as number;
      const base = pos.length / 3;
      pos.push(x0, h - datum, zCut, x1, n - datum, zCut, x1, baseY, zCut, x0, baseY, zCut);
      // world-scaled UVs (metres / 20) so the "not measured" hatch has constant density
      const u0 = (x0 + width / 2) / 20;
      const u1 = (x1 + width / 2) / 20;
      uv.push(u0, (h - datum - baseY) / 20, u1, (n - datum - baseY) / 20, u1, 0, u0, 0);
      idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    }
  }
  flush();
  // Gap fill: from the last valid post before a gap to the first valid post after it.
  const gp: number[] = [];
  const gu: number[] = [];
  const gi: number[] = [];
  let k = 0;
  while (k < xs.length) {
    if (Number.isFinite(hs[k])) {
      k++;
      continue;
    }
    const a = k - 1;
    let b = k;
    while (b < xs.length && !Number.isFinite(hs[b])) b++;
    const x0 = a >= 0 ? (xs[a] as number) : (xs[0] as number);
    const x1 = b < xs.length ? (xs[b] as number) : (xs[xs.length - 1] as number);
    const tops = [a >= 0 ? hs[a] : undefined, b < xs.length ? hs[b] : undefined].filter(
      (v): v is number => v !== undefined && Number.isFinite(v),
    );
    if (tops.length) {
      // Magenta band: between the highest and lowest measured posts bounding the gap, i.e.
      // where the surface height itself is unknown. Below it, the ordinary "not measured"
      // hatch continues (appended to the cap), so no-data never claims the whole column.
      const top = Math.max(...tops) - datum;
      const bot = Math.min(...tops) - datum;
      const u1 = (x1 - x0) / 20;
      if (top > bot) {
        const base = gp.length / 3;
        gp.push(x0, top, zCut, x1, top, zCut, x1, bot, zCut, x0, bot, zCut);
        gu.push(0, (top - bot) / 20, u1, (top - bot) / 20, u1, 0, 0, 0);
        gi.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
      }
      const base = pos.length / 3;
      const ua = (x0 + width / 2) / 20;
      const ub = (x1 + width / 2) / 20;
      pos.push(x0, bot, zCut, x1, bot, zCut, x1, baseY, zCut, x0, baseY, zCut);
      uv.push(ua, (bot - baseY) / 20, ub, (bot - baseY) / 20, ub, 0, ua, 0);
      idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    }
    k = b;
  }
  return {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
    line,
    gapCount,
    gaps: { positions: new Float32Array(gp), uvs: new Float32Array(gu), indices: new Uint32Array(gi) },
  };
}

/** Bilinear height at scene (x, z); NaN if any neighbour is nodata. */
export function sampleHeight(g: Grid, x: number, z: number): number {
  const { width, depth } = gridExtent(g);
  const cf = (x + width / 2) / g.cell - 0.5;
  const rf = (z + depth / 2) / g.cell - 0.5;
  const c0 = Math.min(Math.max(Math.floor(cf), 0), g.cols - 2);
  const r0 = Math.min(Math.max(Math.floor(rf), 0), g.rows - 2);
  const tc = Math.min(Math.max(cf - c0, 0), 1);
  const tr = Math.min(Math.max(rf - r0, 0), 1);
  const at = (r: number, c: number) => g.heights[r * g.cols + c] as number;
  const top = at(r0, c0) * (1 - tc) + at(r0, c0 + 1) * tc;
  const bot = at(r0 + 1, c0) * (1 - tc) + at(r0 + 1, c0 + 1) * tc;
  return top * (1 - tr) + bot * tr;
}

/**
 * Outline of the nodata region on the surface: grid lines separating a cell
 * whose four posts are all valid from a cell that touches a NaN post. Returned
 * as flat segment pairs (x0,y0,z0,x1,y1,z1,...) on the measured posts, so the
 * line marks exactly where measured elevation stops. Empty if there is no gap.
 */
export function noDataOutline(g: Grid, datum: number, lift = 0): Float32Array {
  const { rows, cols, heights } = g;
  const ok = (r: number, c: number) => Number.isFinite(heights[r * cols + c]);
  const cellOk = (r: number, c: number) =>
    r >= 0 &&
    c >= 0 &&
    r < rows - 1 &&
    c < cols - 1 &&
    ok(r, c) &&
    ok(r + 1, c) &&
    ok(r, c + 1) &&
    ok(r + 1, c + 1);
  const cellBad = (r: number, c: number) => r >= 0 && c >= 0 && r < rows - 1 && c < cols - 1 && !cellOk(r, c);
  const out: number[] = [];
  const p = (r: number, c: number) => {
    out.push(vertexX(g, c), (heights[r * cols + c] as number) - datum + lift, vertexZ(g, r));
  };
  const seg = (r0: number, c0: number, r1: number, c1: number) => {
    p(r0, c0);
    p(r1, c1);
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (!cellOk(r, c)) continue;
      if (cellBad(r, c + 1)) seg(r, c + 1, r + 1, c + 1);
      if (cellBad(r, c - 1)) seg(r, c, r + 1, c);
      if (cellBad(r + 1, c)) seg(r + 1, c, r + 1, c + 1);
      if (cellBad(r - 1, c)) seg(r, c, r, c + 1);
    }
  }
  return new Float32Array(out);
}
