import { describe, expect, it } from "vitest";
import { zernikeBasis, zernikeCount } from "../src/math/zernike";
import { InsufficientRaysError } from "../src/metrics/defocus";
import { fitZernike, zernikeWavefront } from "../src/wavefront/fit";
import type { OpdMap } from "../src/wavefront/opd";

function syntheticMap(coeffs: number[], gridN = 40, R = 2): OpdMap {
  const xs: number[] = [];
  const ys: number[] = [];
  const w: number[] = [];
  const idx: number[] = [];
  let order = 0;
  while (zernikeCount(order) < coeffs.length) order++;
  const z = new Float64Array(zernikeCount(order));
  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      const x = -R + (2 * R * j) / (gridN - 1);
      const y = -R + (2 * R * i) / (gridN - 1);
      if (Math.hypot(x, y) > R) continue;
      zernikeBasis(order, Math.hypot(x, y) / R, Math.atan2(y, x), z);
      xs.push(x);
      ys.push(y);
      idx.push(i * gridN + j);
      w.push(coeffs.reduce((s, c, k) => s + c * (z[k] ?? 0), 0));
    }
  }
  return {
    gridN,
    pupilRadiusMm: R,
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    opdMicrons: Float64Array.from(w),
    valid: new Uint8Array(xs.length).fill(1),
    gridIndex: Uint32Array.from(idx),
    imagePoint: [0, 0, 0],
    validFraction: 1,
    wavelengthNm: 555,
  };
}

describe("fitZernike", () => {
  it("fits a pure defocus map to a single C(2,0), others below 1e-9 (spec §5.6)", () => {
    const coeffs = new Array(15).fill(0);
    coeffs[4] = 0.7;
    const fit = fitZernike(syntheticMap(coeffs));
    expect(fit.coeffsMicrons).toHaveLength(45);
    fit.coeffsMicrons.forEach((c, j) => expect(Math.abs(c - (j === 4 ? 0.7 : 0)), `j=${j}`).toBeLessThan(1e-9));
  });

  it("recovers random coefficients up to order 6", () => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
    const coeffs = Array.from({ length: zernikeCount(6) }, () => rnd());
    const fit = fitZernike(syntheticMap(coeffs, 48), 6);
    fit.coeffsMicrons.forEach((c, j) => expect(Math.abs(c - (coeffs[j] ?? 0)), `j=${j}`).toBeLessThan(1e-9));
    const rms = Math.sqrt(fit.coeffsMicrons.slice(3).reduce((a, c) => a + c * c, 0));
    expect(fit.rmsMicrons).toBeCloseTo(rms, 12);
    expect(fit.hoRmsMicrons).toBeCloseTo(Math.sqrt(fit.coeffsMicrons.slice(6).reduce((a, c) => a + c * c, 0)), 12);
    expect(fit.residualRmsMicrons).toBeLessThan(1e-9);
    expect(zernikeWavefront(fit.coeffsMicrons, 0.5, -0.3, 2)).toBeCloseTo(zernikeWavefront(coeffs, 0.5, -0.3, 2), 9);
  });

  it("throws InsufficientRaysError when fewer than 60% of the samples are valid", () => {
    const map = syntheticMap([0, 0, 0, 0, 1]);
    for (let i = 0; i < map.valid.length; i += 2) map.valid[i] = 0;
    expect(() => fitZernike(map)).toThrow(InsufficientRaysError);
  });
});
