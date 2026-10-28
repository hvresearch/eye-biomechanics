import { describe, expect, it } from "vitest";
import { dragToTarget } from "../src/scene/dragTarget";
import { PALETTE, activationColor } from "../src/scene/palette";
import { taperedRadius } from "../src/scene/tube";

describe("taperedRadius", () => {
  it("is the tendon radius over the tendon and at the origin, and the belly maximum in the belly", () => {
    expect(taperedRadius(1, 2.4, 0.5, 0.2)).toBe(0.5);
    expect(taperedRadius(0.85, 2.4, 0.5, 0.2)).toBe(0.5);
    expect(taperedRadius(0, 2.4, 0.5, 0.2)).toBeCloseTo(0.5, 12);
    expect(taperedRadius(0.4, 2.4, 0.5, 0.2)).toBeCloseTo(2.4, 12);
    for (let u = 0; u <= 1; u += 0.05) {
      const r = taperedRadius(u, 2.4, 0.5, 0.2);
      expect(r).toBeGreaterThanOrEqual(0.5 - 1e-12);
      expect(r).toBeLessThanOrEqual(2.4 + 1e-12);
    }
  });
});

describe("activationColor", () => {
  it("runs from the resting muscle tone to the hot token", () => {
    expect(activationColor(0)).toBe(PALETTE.muscleRest);
    expect(activationColor(1)).toBe(PALETTE.hot);
    expect(activationColor(2)).toBe(PALETTE.hot);
    expect(activationColor(Number.NaN)).toBe(PALETTE.muscleRest);
  });
});

describe("dragToTarget", () => {
  it("maps a straight-ahead ray onto the target plane", () => {
    const t = dragToTarget([0, 0, 100], [0, 0, -1], -333);
    expect(t!.distanceM).toBeCloseTo(0.333, 12);
    expect(t!.directionDeg.x).toBeCloseTo(0, 12);
    expect(t!.directionDeg.y).toBeCloseTo(0, 12);
  });

  it("gives a 20 degree rightward direction for a ray through a point 20 degrees right", () => {
    const z = -400;
    const x = -z * Math.tan((20 * Math.PI) / 180);
    const t = dragToTarget([0, 50, 0], [x, -50, z], z);
    expect(t!.directionDeg.x).toBeCloseTo(20, 9);
    expect(t!.directionDeg.y).toBeCloseTo(0, 9);
  });

  it("returns null for a ray parallel to or pointing away from the plane", () => {
    expect(dragToTarget([0, 0, 0], [1, 0, 0], -300)).toBeNull();
    expect(dragToTarget([0, 0, 0], [0, 0, 1], -300)).toBeNull();
  });
});
