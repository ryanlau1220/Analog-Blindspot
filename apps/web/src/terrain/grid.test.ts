import { describe, expect, it } from "vitest";
import {
  buildCap,
  buildSkirts,
  buildSurface,
  type Grid,
  noDataOutline,
  profileAtZ,
  sampleHeight,
  vertexX,
  vertexZ,
} from "./grid";

function grid(rows: number, cols: number, f: (r: number, c: number) => number, cell = 2): Grid {
  const heights = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = f(r, c);
  return { heights, rows, cols, cell };
}

describe("buildSurface", () => {
  it("places vertices at cell centres around the ROI centre", () => {
    const g = grid(3, 3, () => 10);
    expect(vertexX(g, 0)).toBe(-2);
    expect(vertexX(g, 2)).toBe(2);
    expect(vertexZ(g, 0)).toBe(-2); // row 0 = north = -Z
    const m = buildSurface(g, 10);
    expect(m.positions.length).toBe(27);
    expect(m.indices.length).toBe(2 * 2 * 2 * 3);
    expect(Math.max(...m.positions.filter((_, i) => i % 3 === 1))).toBe(0);
  });

  it("drops every triangle touching nodata instead of filling it", () => {
    const g = grid(5, 5, (r, c) => (r === 2 && c === 2 ? Number.NaN : 1));
    const m = buildSurface(g, 0);
    const centre = 2 * 5 + 2;
    expect(Array.from(m.indices)).not.toContain(centre);
    // 32 triangles in a 5x5 grid; the centre vertex belongs to 6 of them
    expect(m.indices.length / 3).toBe(32 - 6);
  });

  it("winds triangles counter-clockwise seen from above (+Y normals)", () => {
    const g = grid(2, 2, () => 0);
    const m = buildSurface(g, 0);
    const xz = (k: number) => {
      const i = m.indices[k] ?? 0;
      return { x: m.positions[i * 3] ?? 0, z: m.positions[i * 3 + 2] ?? 0 };
    };
    const [a, b, c] = [xz(0), xz(1), xz(2)];
    // y component of (b-a) x (c-a)
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    expect(ny).toBeGreaterThan(0);
  });

  it("maps uv so the first row is the top of the texture", () => {
    const g = grid(4, 4, () => 0);
    const m = buildSurface(g, 0);
    expect(m.uvs[1]).toBeCloseTo(1 - 0.5 / 4);
    expect(m.uvs[0]).toBeCloseTo(0.5 / 4);
  });
});

describe("skirts and cap", () => {
  it("builds one wall quad per edge segment", () => {
    const g = grid(4, 5, () => 3);
    const m = buildSkirts(g, 0, -10);
    expect(m.indices.length / 6).toBe(2 * (5 - 1) + 2 * (4 - 1));
    const ys = m.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(-10);
    expect(Math.max(...ys)).toBe(3);
  });

  it("interpolates the profile between rows and reports nodata gaps", () => {
    const g = grid(3, 4, (r, c) => (r === 1 && c === 1 ? Number.NaN : r * 10 + (c === 2 ? 4 : 0)));
    const mid = (vertexZ(g, 0) + vertexZ(g, 1)) / 2;
    const { hs } = profileAtZ(g, mid);
    expect(hs[0]).toBeCloseTo(5);
    expect(hs[2]).toBeCloseTo(9);
    expect(Number.isNaN(hs[1])).toBe(true);
    const cap = buildCap(g, 0, -20, mid);
    expect(cap.gapCount).toBe(1);
    // columns 2-3 measured, plus one "not measured" quad below the gap
    expect(cap.indices.length / 6).toBe(2);
    expect(cap.line.length).toBe(1);
    // the no-data band spans only the unknown surface height: between the neighbouring posts (5 and 9)
    expect(cap.gaps.indices.length / 6).toBe(1);
    const gy = Array.from(cap.gaps.positions.filter((_, i) => i % 3 === 1));
    expect(Math.max(...gy)).toBeCloseTo(9);
    expect(Math.min(...gy)).toBeCloseTo(5);
  });

  it("samples heights bilinearly", () => {
    const g = grid(3, 3, (_r, c) => c * 2);
    expect(sampleHeight(g, 0, 0)).toBeCloseTo(2);
    expect(sampleHeight(g, 1, 0)).toBeCloseTo(3);
  });
});

describe("noDataOutline", () => {
  it("rings a nodata post with segments on measured posts only", () => {
    const g = grid(5, 5, (r, c) => (r === 2 && c === 2 ? Number.NaN : 1));
    const out = noDataOutline(g, 0);
    expect(out.length % 6).toBe(0);
    expect(out.length / 6).toBeGreaterThan(0);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });

  it("is empty when every post is measured", () => {
    expect(
      noDataOutline(
        grid(4, 4, () => 2),
        0,
      ).length,
    ).toBe(0);
  });
});
