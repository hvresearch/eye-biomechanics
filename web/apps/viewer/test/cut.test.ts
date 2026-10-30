import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { clampDepthMm, cutDepthLabel, cutPlane, type CutOrientation } from "../src/scene/cut";

const AXIAL = 24;
const AXIS: Record<CutOrientation, Vector3> = {
  sagittal: new Vector3(1, 0, 0),
  horizontal: new Vector3(0, 1, 0),
  frontal: new Vector3(0, 0, 1),
};

describe("cutPlane", () => {
  it("has a unit normal along the orientation's axis", () => {
    for (const o of ["sagittal", "horizontal", "frontal"] as const) {
      const p = cutPlane({ orientation: o, depthMm: 0, side: "right" }, AXIAL);
      expect(p.normal.length()).toBeCloseTo(1, 12);
      expect(Math.abs(p.normal.dot(AXIS[o]))).toBeCloseTo(1, 12);
    }
  });

  it("keeps the nasal, inferior, and posterior parts", () => {
    const keeps = (o: CutOrientation, pt: Vector3) => cutPlane({ orientation: o, depthMm: 0, side: "right" }, AXIAL).distanceToPoint(pt) >= 0;
    expect(keeps("sagittal", new Vector3(-3, 0, 0))).toBe(true);
    expect(keeps("sagittal", new Vector3(3, 0, 0))).toBe(false);
    expect(keeps("horizontal", new Vector3(0, -3, 0))).toBe(true);
    expect(keeps("horizontal", new Vector3(0, 3, 0))).toBe(false);
    expect(keeps("frontal", new Vector3(0, 0, 3))).toBe(true);
    expect(keeps("frontal", new Vector3(0, 0, -3))).toBe(false);
  });

  it("passes through the depth point", () => {
    for (const o of ["sagittal", "horizontal", "frontal"] as const) {
      for (const d of [-5, 0, 2.5, 7]) {
        const p = cutPlane({ orientation: o, depthMm: d, side: "left" }, AXIAL);
        expect(p.distanceToPoint(AXIS[o].clone().multiplyScalar(d))).toBeCloseTo(0, 12);
      }
    }
  });

  it("clamps the depth to half the axial length", () => {
    expect(clampDepthMm(30, AXIAL)).toBe(12);
    expect(clampDepthMm(-30, AXIAL)).toBe(-12);
    expect(clampDepthMm(Number.NaN, AXIAL)).toBe(0);
    const p = cutPlane({ orientation: "frontal", depthMm: 100, side: "right" }, AXIAL);
    expect(p.distanceToPoint(new Vector3(0, 0, 12))).toBeCloseTo(0, 12);
  });

  it("labels the plane's position with its anatomical direction", () => {
    expect(cutDepthLabel({ orientation: "horizontal", depthMm: 2, side: "right" }, AXIAL)).toBe("2.0 mm superior of the globe center");
    expect(cutDepthLabel({ orientation: "sagittal", depthMm: -1.25, side: "right" }, AXIAL)).toBe("1.3 mm nasal of the globe center");
    expect(cutDepthLabel({ orientation: "frontal", depthMm: 0, side: "right" }, AXIAL)).toBe("through the globe center");
  });
});
