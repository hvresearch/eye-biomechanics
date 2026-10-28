import { describe, expect, it } from "vitest";
import { pupilBundle } from "../src/trace/aim";
import { traceRay } from "../src/trace/sequential";
import { onAxisView, thinSpectacle } from "./helpers/systems";

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
        expect(Math.abs(x - (b.pupilXYMm[2 * i] ?? 0))).toBeLessThan(1e-7);
        expect(Math.abs(y - (b.pupilXYMm[2 * i + 1] ?? 0))).toBeLessThan(1e-7);
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
});
