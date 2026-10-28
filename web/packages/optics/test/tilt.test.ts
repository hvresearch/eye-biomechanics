import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../src/math/vec3";
import { intersect, normalAt } from "../src/surfaces/geometry";
import { dirToGlobal, dirToLocal, surfaceFrame, toGlobal, toLocal } from "../src/surfaces/tilt";
import type { ConicSurface, Surface, ToricSurface } from "../src/surfaces/types";
import { traceRay, traceToEnd } from "../src/trace/sequential";
import { navarroSurfaces } from "./helpers/navarro";

const deg = (d: number) => (d * Math.PI) / 180;

function conic(over: Partial<ConicSurface> = {}): ConicSurface {
  return {
    kind: "conic",
    name: "s",
    radiusMm: 20,
    conic: 0,
    vertexZMm: 0,
    apertureSemiDiamMm: 8,
    tilt: { xDeg: 0, yDeg: 0 },
    decenter: { xMm: 0, yMm: 0 },
    mediumAfter: { name: "glass", index555: 1.5 },
    ...over,
  };
}

/** Deterministic pseudo-random numbers in [-1, 1) (numerical test input). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

describe("tilted surface frames", () => {
  it("is null for an untilted surface", () => {
    expect(surfaceFrame(conic())).toBeNull();
  });

  it("round-trips points and directions", () => {
    const rnd = lcg(7);
    for (let i = 0; i < 50; i++) {
      const f = surfaceFrame(conic({ tilt: { xDeg: 20 * rnd(), yDeg: 20 * rnd() }, decenter: { xMm: rnd(), yMm: rnd() }, vertexZMm: 3 * rnd() }));
      if (!f) throw new Error("expected a frame");
      const p: Vec3 = [5 * rnd(), 5 * rnd(), 5 * rnd()];
      const back = toGlobal(f, toLocal(f, p));
      const dback = dirToGlobal(f, dirToLocal(f, p));
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(back[k]! - p[k]!)).toBeLessThan(1e-12);
        expect(Math.abs(dback[k]! - p[k]!)).toBeLessThan(1e-12);
      }
    }
  });

  it("tilts a plane about +x by the right-hand rule: z = vertexZ + y tan(xDeg)", () => {
    const plane = conic({ radiusMm: Number.POSITIVE_INFINITY, vertexZMm: 2, apertureSemiDiamMm: 10, tilt: { xDeg: 10, yDeg: 0 } });
    const hit = intersect(plane, [0, 3, -5], [0, 0, 1]);
    if (hit === null || hit === "miss") throw new Error("expected a hit");
    expect(hit.point[2]).toBeCloseTo(2 + 3 * Math.tan(deg(10)), 12);
    const n = normalAt(plane, hit.point[0], hit.point[1], hit.point[2]);
    expect(n[1]).toBeCloseTo(Math.sin(deg(10)), 12);
    expect(n[2]).toBeCloseTo(-Math.cos(deg(10)), 12);
  });

  it("tilts about +y by the right-hand rule: z = vertexZ − x tan(yDeg)", () => {
    const plane = conic({ radiusMm: Number.POSITIVE_INFINITY, apertureSemiDiamMm: 10, tilt: { xDeg: 0, yDeg: 10 } });
    const hit = intersect(plane, [3, 0, -5], [0, 0, 1]);
    if (hit === null || hit === "miss") throw new Error("expected a hit");
    expect(hit.point[2]).toBeCloseTo(-3 * Math.tan(deg(10)), 12);
  });

  it("a sphere tilted about its vertex equals the sphere with its vertex moved on the circle", () => {
    const R = 20;
    const a = deg(4);
    const tilted = conic({ radiusMm: R, tilt: { xDeg: 4, yDeg: 0 } });
    // Center of curvature (0, 0, R) rotated about +x by a: (0, −R sin a, R cos a).
    const moved = conic({ radiusMm: R, apertureSemiDiamMm: 50, decenter: { xMm: 0, yMm: -R * Math.sin(a) }, vertexZMm: R * Math.cos(a) - R });
    const rnd = lcg(11);
    for (let i = 0; i < 20; i++) {
      const origin: Vec3 = [2.5 * rnd(), 2.5 * rnd(), -5];
      const tx = 0.05 * rnd();
      const ty = 0.05 * rnd();
      const dir: Vec3 = [tx, ty, Math.sqrt(1 - tx * tx - ty * ty)];
      const h1 = intersect(tilted, origin, dir);
      const h2 = intersect(moved, origin, dir);
      if (h1 === null || h1 === "miss" || h2 === null || h2 === "miss") throw new Error("expected hits");
      for (let k = 0; k < 3; k++) expect(Math.abs(h1.point[k]! - h2.point[k]!)).toBeLessThan(1e-9);
      const n1 = normalAt(tilted, ...h1.point);
      const n2 = normalAt(moved, ...h2.point);
      for (let k = 0; k < 3; k++) expect(Math.abs(n1[k]! - n2[k]!)).toBeLessThan(1e-9);
    }
  });

  it("clips by the local aperture, not the global radius", () => {
    // Tilted 60° about x, a 2 mm semi-diameter reaches y = ±1 globally but ±2 locally.
    const plane = conic({ radiusMm: Number.POSITIVE_INFINITY, apertureSemiDiamMm: 2, tilt: { xDeg: 60, yDeg: 0 } });
    const inside = intersect(plane, [0, 0.9, -5], [0, 0, 1]);
    expect(inside === null || inside === "miss").toBe(false);
    expect(intersect(plane, [0, 1.1, -5], [0, 0, 1])).toBeNull();
  });

  it("traces tilted torics the same way through traceRay and traceToEnd", () => {
    const toric: ToricSurface = {
      kind: "toric",
      name: "t",
      rxMm: 15,
      ryMm: 17,
      axisDeg: 30,
      conicX: -0.2,
      conicY: 0.1,
      vertexZMm: 0,
      apertureSemiDiamMm: 6,
      tilt: { xDeg: 3, yDeg: -2 },
      decenter: { xMm: 0.2, yMm: -0.1 },
      mediumAfter: { name: "glass", index555: 1.5 },
    };
    const image = conic({ name: "img", radiusMm: Number.POSITIVE_INFINITY, vertexZMm: 25, apertureSemiDiamMm: 50, image: true, mediumAfter: { name: "glass", index555: 1.5 } });
    const surfaces: Surface[] = [toric, image];
    const ray = { origin: [0.7, -0.4, -3] as Vec3, dir: [0, 0, 1] as Vec3, wavelengthNm: 555 };
    const full = traceRay(ray, surfaces);
    const end = traceToEnd(ray, surfaces);
    const last = full.hits[full.hits.length - 1]?.point;
    if (!end || !last) throw new Error("expected a trace");
    for (let k = 0; k < 3; k++) expect(Math.abs(end.point[k]! - last[k]!)).toBeLessThan(1e-9);
    expect(Math.abs(end.opticalPathMm - full.opticalPathMm)).toBeLessThan(1e-9);
  });
});

describe("zero tilt is unchanged", () => {
  interface Baseline {
    ray: { origin: Vec3; dir: Vec3 };
    hits: Vec3[];
    opl: number;
    end: { point: Vec3; dir: Vec3; opl: number } | null;
  }
  const baseline = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/navarro-zero-tilt.json"), "utf8")) as Baseline[];

  it("reproduces the pre-tilt Navarro traces bit for bit", () => {
    const surfaces = navarroSurfaces();
    expect(baseline).toHaveLength(10);
    for (const b of baseline) {
      const full = traceRay({ origin: b.ray.origin, dir: b.ray.dir, wavelengthNm: 555 }, surfaces, 1);
      expect(full.hits.map((h) => [...h.point])).toEqual(b.hits);
      expect(full.opticalPathMm).toBe(b.opl);
      const end = traceToEnd({ origin: b.ray.origin, dir: b.ray.dir, wavelengthNm: 555 }, surfaces, 1);
      expect(end && { point: [...end.point], dir: [...end.dir], opl: end.opticalPathMm }).toEqual(b.end);
    }
  });
});
