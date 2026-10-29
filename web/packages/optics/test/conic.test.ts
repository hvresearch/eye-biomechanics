import { describe, expect, it } from "vitest";
import { add, cross, dot, norm, normalize, scale, sub } from "../src/math/vec3";
import { intersect, normalAt, sag } from "../src/surfaces/geometry";
import { surfacesFromSequential } from "../src/surfaces/sequential";
import type { ConicSurface } from "../src/surfaces/types";

const air = { name: "air", index555: 1 };

function conic(over: Partial<ConicSurface>): ConicSurface {
  return {
    name: "s",
    kind: "conic",
    radiusMm: 10,
    conic: 0,
    apertureSemiDiamMm: 5,
    vertexZMm: 0,
    tilt: { xDeg: 0, yDeg: 0 },
    decenter: { xMm: 0, yMm: 0 },
    mediumAfter: air,
    ...over,
  };
}

describe("vec3", () => {
  it("does basic arithmetic", () => {
    expect(add([1, 2, 3], [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(norm([3, 4, 0])).toBe(5);
    expect(normalize([0, 0, 2])).toEqual([0, 0, 1]);
  });
  it("refuses to normalize the zero vector", () => {
    expect(() => normalize([0, 0, 0])).toThrow();
  });
});

describe("conic sag", () => {
  it("sphere R=10 at r=1", () => {
    expect(sag(conic({ radiusMm: 10 }), 1, 0)).toBeCloseTo(10 - Math.sqrt(99), 12);
    expect(sag(conic({ radiusMm: 10 }), 0, 1)).toBeCloseTo(10 - Math.sqrt(99), 12);
  });
  it("paraboloid conic -1, R=8 at r=2 equals r^2/(2R)", () => {
    expect(sag(conic({ radiusMm: 8, conic: -1 }), 2, 0)).toBeCloseTo(0.25, 12);
  });
  it("flat surface (infinite radius) has zero sag everywhere", () => {
    expect(sag(conic({ radiusMm: Infinity }), 3, 4)).toBe(0);
  });
  it("negative radius curves the other way", () => {
    expect(sag(conic({ radiusMm: -10 }), 1, 0)).toBeCloseTo(-(10 - Math.sqrt(99)), 12);
  });
  it("is measured from the decentered vertex", () => {
    const s = conic({ radiusMm: 10, decenter: { xMm: 1, yMm: 0 } });
    expect(sag(s, 1, 0)).toBe(0);
  });
});

describe("conic normal", () => {
  it("points toward -z at the vertex", () => {
    expect(normalAt(conic({}), 0, 0)).toEqual([0, 0, -1]);
  });
  it("is a unit vector tilted toward the axis on a convex sphere", () => {
    const n = normalAt(conic({ radiusMm: 10 }), 3, 0);
    expect(norm(n)).toBeCloseTo(1, 12);
    // On a sphere centered at (0, 0, R) the normal at (x, z) is ±(x, z − R)/R; ours faces −z.
    expect(n[0]).toBeCloseTo(3 / 10, 12);
    expect(n[2]).toBeCloseTo(-Math.sqrt(1 - 0.09), 12);
  });
});

describe("conic intersect", () => {
  it("axial ray hits at the vertex with t equal to the distance", () => {
    const s = conic({ vertexZMm: 5 });
    const hit = intersect(s, [0, 0, -3], [0, 0, 1]);
    if (hit === null || hit === "miss") throw new Error("expected a hit");
    expect(hit?.point[0]).toBe(0);
    expect(hit?.point[1]).toBe(0);
    expect(hit?.point[2]).toBeCloseTo(5, 12);
    expect(hit?.t).toBeCloseTo(8, 12);
  });
  it("off-axis parallel ray lands on the sag", () => {
    const s = conic({ radiusMm: 10, vertexZMm: 2 });
    const hit = intersect(s, [1, 0, -3], [0, 0, 1]);
    if (hit === null || hit === "miss") throw new Error("expected a hit");
    expect(hit.point[2]).toBeCloseTo(2 + sag(s, 1, 0), 12);
  });
  it("returns null outside the aperture", () => {
    expect(intersect(conic({ apertureSemiDiamMm: 2 }), [3, 0, -3], [0, 0, 1])).toBeNull();
  });
  it("reports a miss when the surface is behind the ray", () => {
    expect(intersect(conic({ vertexZMm: -5 }), [0, 0, 0], [0, 0, 1])).toBe("miss");
  });
  it("hits a flat surface", () => {
    const hit = intersect(conic({ radiusMm: Infinity, vertexZMm: 4 }), [1, 1, 0], [0, 0, 1]);
    if (hit === null || hit === "miss") throw new Error("expected a hit");
    expect(hit.point).toEqual([1, 1, 4]);
  });
  it("applies decenter to the aperture and sag", () => {
    const s = conic({ radiusMm: 10, apertureSemiDiamMm: 2, decenter: { xMm: 3, yMm: 0 } });
    const hit = intersect(s, [3, 0, -1], [0, 0, 1]);
    if (hit === null || hit === "miss") throw new Error("expected a hit");
    expect(hit.point).toEqual([3, 0, 0]);
    expect(intersect(s, [0, 0, -1], [0, 0, 1])).toBeNull();
  });
  it("intersects tilted surfaces in their own frame (tilt.test.ts covers the geometry)", () => {
    const hit = intersect(conic({ tilt: { xDeg: 1, yDeg: 0 } }), [0, 0, -1], [0, 0, 1]);
    expect(hit === null || hit === "miss").toBe(false);
  });
});

describe("surfacesFromSequential", () => {
  it("accumulates vertex positions from thicknesses and defaults optional fields", () => {
    const out = surfacesFromSequential([
      { name: "a", radiusMm: 10, thicknessToNextMm: 2, mediumAfter: air, apertureSemiDiamMm: 5 },
      { name: "b", radiusMm: -10, conic: -1, thicknessToNextMm: 3, mediumAfter: air, apertureSemiDiamMm: 5 },
    ]);
    expect(out.map((s) => s.vertexZMm)).toEqual([0, 2]);
    const [a, b] = out;
    if (a?.kind !== "conic" || b?.kind !== "conic") throw new Error("expected conic surfaces");
    expect(a.conic).toBe(0);
    expect(a.tilt).toEqual({ xDeg: 0, yDeg: 0 });
    expect(b.conic).toBe(-1);
  });
  it("honours a start position", () => {
    const out = surfacesFromSequential(
      [{ name: "a", radiusMm: 10, thicknessToNextMm: 2, mediumAfter: air, apertureSemiDiamMm: 5 }],
      -12,
    );
    expect(out[0]?.vertexZMm).toBe(-12);
  });
});
