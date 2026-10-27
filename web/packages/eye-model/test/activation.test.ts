import { describe, expect, it } from "vitest";
import { ACTIVATION_TABLE, activations } from "../src/eom/activation";
import { MUSCLE_NAMES, defaultMuscles } from "../src/eom/geometry";
import { musclePath } from "../src/eom/path";
import { gazeQuaternion } from "../src/gaze/listing";
import { QUAT_IDENTITY } from "../src/math/quat";

const muscles = defaultMuscles();
const rest = muscles.map((m) => musclePath(m, QUAT_IDENTITY).lengthMm);
const at = (xDeg: number, yDeg: number) =>
  activations(
    muscles.map((m) => musclePath(m, gazeQuaternion({ xDeg, yDeg })).lengthMm),
    rest,
  );
const idx = (n: (typeof MUSCLE_NAMES)[number]) => MUSCLE_NAMES.indexOf(n);
const pairs: Array<[number, number]> = [
  [idx("lateralRectus"), idx("medialRectus")],
  [idx("superiorRectus"), idx("inferiorRectus")],
  [idx("superiorOblique"), idx("inferiorOblique")],
];

describe("length-proxy activation", () => {
  it("is labeled an approximation in its data file", () => {
    expect(ACTIVATION_TABLE.verified).toBe(false);
    expect(ACTIVATION_TABLE.citation).toMatch(/approximation/);
  });

  it("gives every muscle the baseline in primary position", () => {
    for (const a of at(0, 0)) expect(a).toBeCloseTo(ACTIVATION_TABLE.baseline, 12);
  });

  it("raises the medial rectus above the lateral rectus in 20 degrees of adduction", () => {
    const a = at(-20, 0); // right eye local frame: negative azimuth is nasal
    expect(a[idx("medialRectus")]!).toBeGreaterThan(ACTIVATION_TABLE.baseline);
    expect(a[idx("lateralRectus")]!).toBeLessThan(ACTIVATION_TABLE.baseline);
  });

  it("raises the superior rectus in elevation and the inferior rectus in depression", () => {
    expect(at(0, 20)[idx("superiorRectus")]!).toBeGreaterThan(ACTIVATION_TABLE.baseline);
    expect(at(0, -20)[idx("inferiorRectus")]!).toBeGreaterThan(ACTIVATION_TABLE.baseline);
  });

  it("stays in [0, 1] and keeps reciprocity over gaze within ±50 degrees", () => {
    const b = ACTIVATION_TABLE.baseline;
    for (let x = -50; x <= 50; x += 10) {
      for (let y = -50; y <= 50; y += 10) {
        const a = at(x, y);
        for (const v of a) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        for (const [i, j] of pairs) {
          if (a[i]! > b + 1e-12) expect(a[j]!).toBeLessThanOrEqual(b + 1e-12);
          if (a[j]! > b + 1e-12) expect(a[i]!).toBeLessThanOrEqual(b + 1e-12);
        }
      }
    }
  });

  it("does not saturate the horizontal recti within ±40 degrees", () => {
    for (const x of [-40, 40]) {
      const a = at(x, 0);
      expect(Math.max(a[idx("lateralRectus")]!, a[idx("medialRectus")]!)).toBeLessThan(1);
    }
  });

  it("rejects mismatched arrays", () => {
    expect(() => activations([1, 2, 3], rest)).toThrow(RangeError);
  });
});
