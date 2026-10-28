import { describe, expect, it } from "vitest";
import { eyeDirections, targetPoint } from "../src/gaze/vergence";

const deg = (rad: number) => (rad * 180) / Math.PI;

describe("binocular target geometry", () => {
  it("gives the textbook vergence for a near target straight ahead", () => {
    const r = eyeDirections({ distanceM: 0.33333, directionDeg: { x: 0, y: 0 } }, 63);
    expect(r.vergenceDeg).toBeCloseTo(deg(2 * Math.atan(31.5 / 333.33)), 9);
    // Both eyes turn nasally (negative local azimuth) by half the vergence.
    expect(r.right.xDeg).toBeCloseTo(-r.vergenceDeg / 2, 9);
    expect(r.left.xDeg).toBeCloseTo(-r.vergenceDeg / 2, 9);
    expect(r.distanceMm.right).toBeCloseTo(Math.hypot(333.33, 31.5), 6);
  });

  it("gives parallel lines of sight and zero vergence at infinity", () => {
    const r = eyeDirections({ distanceM: Number.POSITIVE_INFINITY, directionDeg: { x: 10, y: -5 } }, 63);
    expect(r.vergenceDeg).toBe(0);
    expect(r.right).toEqual({ xDeg: 10, yDeg: -5 });
    expect(r.left).toEqual({ xDeg: -10, yDeg: -5 });
    expect(r.distanceMm.left).toBe(Number.POSITIVE_INFINITY);
  });

  it("turns the right eye temporally and the left eye nasally for a target to the right", () => {
    const r = eyeDirections({ distanceM: 6, directionDeg: { x: 20, y: 0 } }, 63);
    expect(r.right.xDeg).toBeGreaterThan(19);
    expect(r.left.xDeg).toBeLessThan(-19);
  });

  it("is mirror symmetric for a midline target", () => {
    const r = eyeDirections({ distanceM: 0.4, directionDeg: { x: 0, y: 15 } }, 63);
    expect(r.left.xDeg).toBeCloseTo(r.right.xDeg, 14);
    expect(r.left.yDeg).toBeCloseTo(r.right.yDeg, 14);
    expect(r.distanceMm.left).toBeCloseTo(r.distanceMm.right, 12);
  });

  it("places the target in front of the eyes (negative z) in the head frame", () => {
    const p = targetPoint(0.5, { x: 0, y: 0 });
    expect(p).not.toBeNull();
    expect(p![2]).toBeCloseTo(-500, 12);
    expect(targetPoint(Number.POSITIVE_INFINITY, { x: 0, y: 0 })).toBeNull();
  });

  it("never returns NaN for distances down to the controller's minimum", () => {
    const r = eyeDirections({ distanceM: 0.05, directionDeg: { x: 40, y: 40 } }, 63);
    for (const v of [r.vergenceDeg, r.left.xDeg, r.left.yDeg, r.right.xDeg, r.right.yDeg]) expect(Number.isFinite(v)).toBe(true);
  });
});
