import { describe, expect, it } from "vitest";
import { fickTorsionDeg, gazeDirection, gazeFromDirection, gazeQuaternion } from "../src/gaze/listing";
import { QUAT_IDENTITY, quatRotate } from "../src/math/quat";

const grid: Array<{ xDeg: number; yDeg: number }> = [];
for (let x = -40; x <= 40; x += 10) for (let y = -40; y <= 40; y += 10) grid.push({ xDeg: x, yDeg: y });

describe("Listing's law gaze", () => {
  it("is the identity in primary position", () => {
    const q = gazeQuaternion({ xDeg: 0, yDeg: 0 });
    for (let i = 0; i < 4; i++) expect(q[i]).toBeCloseTo(QUAT_IDENTITY[i]!, 15);
  });

  it("rotates the primary line of sight onto the gaze direction about an axis in Listing's plane", () => {
    for (const g of grid) {
      const q = gazeQuaternion(g);
      expect(Math.hypot(...q)).toBeCloseTo(1, 12);
      expect(Math.abs(q[2])).toBeLessThan(1e-12); // no component along the primary line of sight
      const d = quatRotate(q, [0, 0, -1]);
      const want = gazeDirection(g);
      for (let i = 0; i < 3; i++) expect(d[i]).toBeCloseTo(want[i]!, 12);
    }
  });

  it("round-trips gaze angles through a direction", () => {
    for (const g of grid) {
      const back = gazeFromDirection(gazeDirection(g));
      expect(back.xDeg).toBeCloseTo(g.xDeg, 10);
      expect(back.yDeg).toBeCloseTo(g.yDeg, 10);
    }
  });

  it("points a temporal gaze toward +x and an upward gaze toward +y", () => {
    expect(gazeDirection({ xDeg: 20, yDeg: 0 })[0]).toBeGreaterThan(0);
    expect(gazeDirection({ xDeg: 0, yDeg: 20 })[1]).toBeGreaterThan(0);
    expect(gazeDirection({ xDeg: 0, yDeg: 0 })).toEqual([0, 0, -1]);
  });

  it("has zero Fick torsion for purely horizontal or vertical gaze", () => {
    expect(fickTorsionDeg(gazeQuaternion({ xDeg: 20, yDeg: 0 }))).toBeCloseTo(0, 10);
    expect(fickTorsionDeg(gazeQuaternion({ xDeg: -30, yDeg: 0 }))).toBeCloseTo(0, 10);
    expect(fickTorsionDeg(gazeQuaternion({ xDeg: 0, yDeg: 25 }))).toBeCloseTo(0, 10);
  });

  it("shows the false torsion of Listing's law in Fick coordinates for oblique gaze", () => {
    // Listing's law implies a Fick torsion of -2 atan(tan(x/2) tan(y/2)) (sign per frame);
    // checking only its magnitude keeps the test independent of the sign convention.
    const x = 30;
    const y = 30;
    const want = (2 * Math.atan(Math.tan((x * Math.PI) / 360) * Math.tan((y * Math.PI) / 360)) * 180) / Math.PI;
    expect(Math.abs(fickTorsionDeg(gazeQuaternion({ xDeg: x, yDeg: y })))).toBeCloseTo(want, 8);
  });
});
