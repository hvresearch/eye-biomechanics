import { describe, expect, it } from "vitest";
import { pupilBundle } from "../src/trace/aim";
import { traceRay } from "../src/trace/sequential";
import { opdMap } from "../src/wavefront/opd";
import { onAxisView, stigmaticEllipsoid, thinSpectacle } from "./helpers/systems";

function crossings(rays: ReturnType<typeof pupilBundle>["rays"], front: Parameters<typeof traceRay>[1], zp: number) {
  return rays.map((ray) => {
    const r = front.length > 0 ? traceRay(ray, front, 1) : null;
    const last = r?.hits[r.hits.length - 1];
    const p = last?.point ?? ray.origin;
    const d = last?.dirAfter ?? ray.dir;
    const t = (zp - p[2]) / d[2];
    return [p[0] + t * d[0], p[1] + t * d[1]] as const;
  });
}

describe("pupilBundle", () => {
  it("fills the pupil disk on a grid and passes each ray through its sample", () => {
    for (const d of [Number.POSITIVE_INFINITY, 0.5]) {
      const b = pupilBundle({ ...onAxisView(2, d), pupilCenterMm: { x: 0.3, y: -0.1 } }, 9, 555);
      expect(b.rays.length).toBeGreaterThan(40);
      const c = crossings(b.rays, [], -1);
      c.forEach(([x, y], i) => {
        expect(x - 0.3).toBeCloseTo(b.pupilXYMm[2 * i] ?? Number.NaN, 12);
        expect(y + 0.1).toBeCloseTo(b.pupilXYMm[2 * i + 1] ?? Number.NaN, 12);
        expect(Math.hypot(b.pupilXYMm[2 * i] ?? 0, b.pupilXYMm[2 * i + 1] ?? 0)).toBeLessThanOrEqual(2 + 1e-12);
      });
      expect(b.collimated).toBe(!Number.isFinite(d));
    }
  });

  it("aims rays through a spectacle lens so they still cross the pupil plane at their samples", () => {
    const front = thinSpectacle(-3);
    for (const d of [Number.POSITIVE_INFINITY, 0.4]) {
      const b = pupilBundle(onAxisView(2.5, d), 11, 555, front);
      expect(b.unaimed).toBe(0);
      crossings(b.rays, front, -1).forEach(([x, y], i) => {
        expect(Math.abs(x - (b.pupilXYMm[2 * i] ?? 0))).toBeLessThan(1e-6);
        expect(Math.abs(y - (b.pupilXYMm[2 * i + 1] ?? 0))).toBeLessThan(1e-6);
      });
    }
  });

  it("starts collimated rays on a plane perpendicular to the beam", () => {
    const b = pupilBundle({ ...onAxisView(2), fieldDeg: { x: 8, y: -3 } }, 7, 555);
    const d = b.chief.dir;
    const ref = b.chief.origin[0] * d[0] + b.chief.origin[1] * d[1] + b.chief.origin[2] * d[2];
    for (const r of b.rays) expect(r.origin[0] * d[0] + r.origin[1] * d[1] + r.origin[2] * d[2]).toBeCloseTo(ref, 10);
  });

  it("uses the axis as the chief ray of an on-axis view", () => {
    const b = pupilBundle(onAxisView(2, 2), 5, 555);
    expect(b.chief.dir[0]).toBeCloseTo(0, 15);
    expect(b.chief.dir[1]).toBeCloseTo(0, 15);
    expect(b.chief.origin[2]).toBeCloseTo(-2000, 9);
  });

  it("flags rays whose aiming failed and keeps them out of the OPD map", () => {
    // A +20 D lens 13 mm before the pupil: a ray reaching the pupil edge (2.5 mm) enters the
    // lens about 3.4 mm off axis, beyond the 3 mm aperture, so aiming fails for the outer
    // samples. Launched unaimed at their samples they would pass the lens and land elsewhere.
    const front = thinSpectacle(20).map((s) => ({ ...s, apertureSemiDiamMm: 3 }));
    const b = pupilBundle(onAxisView(2.5), 15, 555, front);
    expect(b.unaimed).toBeGreaterThan(0);
    expect(b.converged.length).toBe(b.rays.length);
    const failed = Array.from(b.converged).filter((c) => c === 0).length;
    expect(failed).toBe(b.unaimed);
    b.converged.forEach((c, i) => {
      const r = Math.hypot(b.pupilXYMm[2 * i] ?? 0, b.pupilXYMm[2 * i + 1] ?? 0);
      if (r < 2) expect(c).toBe(1);
    });
    const eye = stigmaticEllipsoid();
    const map = opdMap([...front, ...eye], b);
    b.converged.forEach((c, i) => {
      if (c === 0) expect(map.valid[i]).toBe(0);
    });
    expect(map.validFraction).toBeLessThanOrEqual(1 - failed / b.rays.length + 1e-12);
  });

  it("marks every ray converged without front surfaces", () => {
    const b = pupilBundle(onAxisView(2), 9, 555);
    expect(Array.from(b.converged).every((c) => c === 1)).toBe(true);
    expect(b.chiefConverged).toBe(true);
  });
});
