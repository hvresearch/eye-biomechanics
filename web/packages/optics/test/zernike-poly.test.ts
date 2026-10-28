import { describe, expect, it } from "vitest";
import {
  zernikeBasis,
  zernikeCount,
  zernikeIndex,
  zernikeJ,
  zernikeRho2Coefficient,
  zernikeValue,
} from "../src/math/zernike";
import { gaussLegendre01 } from "./helpers/quadrature";

describe("OSA Zernike indexing", () => {
  it("round-trips j ↔ (n, m) for j < 45", () => {
    for (let j = 0; j < 45; j++) {
      const { n, m } = zernikeIndex(j);
      expect(Math.abs(m)).toBeLessThanOrEqual(n);
      expect((n - Math.abs(m)) % 2).toBe(0);
      expect(zernikeJ(n, m)).toBe(j);
    }
    expect(zernikeIndex(4)).toEqual({ n: 2, m: 0 });
    expect(zernikeIndex(3)).toEqual({ n: 2, m: -2 });
    expect(zernikeIndex(5)).toEqual({ n: 2, m: 2 });
    expect(zernikeIndex(12)).toEqual({ n: 4, m: 0 });
    expect(zernikeCount(8)).toBe(45);
  });

  it("rejects impossible (n, m)", () => {
    expect(() => zernikeJ(2, 1)).toThrow();
    expect(() => zernikeJ(1, 3)).toThrow();
  });
});

describe("Zernike polynomials", () => {
  it("defocus is √3(2ρ² − 1) and astigmatism √6 ρ² cos/sin 2θ", () => {
    for (const rho of [0, 0.3, 0.7, 1]) {
      expect(zernikeValue(4, rho, 0.4)).toBeCloseTo(Math.sqrt(3) * (2 * rho * rho - 1), 12);
      expect(zernikeValue(5, rho, 0.4)).toBeCloseTo(Math.sqrt(6) * rho * rho * Math.cos(0.8), 12);
      expect(zernikeValue(3, rho, 0.4)).toBeCloseTo(Math.sqrt(6) * rho * rho * Math.sin(0.8), 12);
    }
  });

  it("are orthonormal on the unit disk up to order 4 (numerical integration)", () => {
    const { x, w } = gaussLegendre01(16);
    const nTheta = 64;
    const count = zernikeCount(4);
    const gram = Array.from({ length: count }, () => new Float64Array(count));
    const z = new Float64Array(count);
    for (let a = 0; a < x.length; a++) {
      const rho = x[a] ?? 0;
      for (let b = 0; b < nTheta; b++) {
        const theta = (2 * Math.PI * b) / nTheta;
        zernikeBasis(4, rho, theta, z);
        const wt = ((w[a] ?? 0) * rho * (2 * Math.PI)) / nTheta / Math.PI;
        for (let i = 0; i < count; i++) for (let k = 0; k < count; k++) gram[i]![k]! += wt * z[i]! * z[k]!;
      }
    }
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < count; k++) expect(Math.abs(gram[i]![k]! - (i === k ? 1 : 0)), `${i},${k}`).toBeLessThan(1e-3);
    }
  });

  it("zernikeBasis agrees with zernikeValue", () => {
    const out = new Float64Array(zernikeCount(8));
    zernikeBasis(8, 0.63, 1.1, out);
    for (let j = 0; j < out.length; j++) expect(out[j]).toBeCloseTo(zernikeValue(j, 0.63, 1.1), 12);
  });

  it("gives the ρ² coefficients used for paraxial curvature", () => {
    expect(zernikeRho2Coefficient(4)).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(zernikeRho2Coefficient(12)).toBeCloseTo(-6 * Math.sqrt(5), 12);
    expect(zernikeRho2Coefficient(5)).toBeCloseTo(Math.sqrt(6), 12);
    expect(zernikeRho2Coefficient(7)).toBe(0);
    expect(zernikeRho2Coefficient(0)).toBe(0);
  });
});
