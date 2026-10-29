import { describe, expect, it } from "vitest";
import { ACTIVATION_TABLE } from "../src/eom/activation";
import { FORCE_TABLE, maxForceN, muscleForces } from "../src/eom/forces";
import { MUSCLE_NAMES, defaultMuscles } from "../src/eom/geometry";
import { gazeQuaternion } from "../src/gaze/listing";
import { QUAT_IDENTITY } from "../src/math/quat";
import { dot, norm, type Vec3 } from "../src/math/vec";

const unit = (v: Vec3): Vec3 => {
  const n = norm(v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

describe("muscle insertion forces", () => {
  it("converts the tabled gram-force capacities to newtons", () => {
    expect(maxForceN("medialRectus")).toBeCloseTo(74.8 * 0.00980665, 12);
    for (const name of MUSCLE_NAMES) expect(maxForceN(name)).toBeGreaterThan(0);
  });

  it("gives every muscle the baseline force in primary position", () => {
    const forces = muscleForces(QUAT_IDENTITY);
    expect(forces.map((f) => f.name)).toEqual([...MUSCLE_NAMES]);
    for (const f of forces) {
      expect(f.activation).toBeCloseTo(ACTIVATION_TABLE.baseline, 12);
      expect(f.forceN).toBeCloseTo(ACTIVATION_TABLE.baseline * maxForceN(f.name), 12);
    }
  });

  it("pulls along unit directions that leave the globe at the tangent point", () => {
    for (const g of [{ xDeg: 0, yDeg: 0 }, { xDeg: 25, yDeg: -10 }, { xDeg: -30, yDeg: 20 }]) {
      for (const f of muscleForces(gazeQuaternion(g))) {
        expect(norm(f.pullDir)).toBeCloseTo(1, 12);
        expect(dot(f.pullDir, unit(f.tangentPointMm))).toBeGreaterThanOrEqual(-1e-9);
        expect(norm(f.insertionDir)).toBeCloseTo(1, 12);
      }
    }
  });

  it("acts at the insertion along the globe's surface when the muscle wraps", () => {
    for (const f of muscleForces(QUAT_IDENTITY)) {
      if (f.arcOfContactMm > 0) {
        // Tangent to the sphere at the insertion, heading toward the tangent point.
        expect(Math.abs(dot(f.insertionDir, unit(f.insertionMm)))).toBeLessThan(1e-12);
        const toward: Vec3 = [f.tangentPointMm[0] - f.insertionMm[0], f.tangentPointMm[1] - f.insertionMm[1], f.tangentPointMm[2] - f.insertionMm[2]];
        expect(dot(f.insertionDir, toward)).toBeGreaterThan(0);
      } else {
        expect(f.insertionDir).toEqual(f.pullDir);
      }
    }
  });

  it("raises the lateral rectus force and lowers the medial in abduction", () => {
    const primary = muscleForces(QUAT_IDENTITY);
    const abducted = muscleForces(gazeQuaternion({ xDeg: 20, yDeg: 0 }));
    const lr = MUSCLE_NAMES.indexOf("lateralRectus");
    const mr = MUSCLE_NAMES.indexOf("medialRectus");
    expect(abducted[lr]!.forceN).toBeGreaterThan(primary[lr]!.forceN);
    expect(abducted[mr]!.forceN).toBeLessThan(primary[mr]!.forceN);
  });

  it("reports the tendon elongation as force over stiffness and rejects a non-positive stiffness", () => {
    const muscles = defaultMuscles();
    for (const [i, f] of muscleForces(QUAT_IDENTITY, muscles).entries()) {
      expect(f.tendonElongationMm).toBeCloseTo(f.forceN / muscles[i]!.tendon.stiffnessNPerMm, 12);
      expect(f.insertionWidthMm).toBe(muscles[i]!.insertionWidthMm);
    }
    const broken = defaultMuscles().map((m, i) => (i === 2 ? { ...m, tendon: { ...m.tendon, stiffnessNPerMm: 0 } } : m));
    expect(() => muscleForces(QUAT_IDENTITY, broken)).toThrow(/superiorRectus.*stiffness/);
  });

  it("carries the footprint length from the table", () => {
    expect(FORCE_TABLE.insertionFootprintLengthMm.value).toBeGreaterThan(0);
  });
});
