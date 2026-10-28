import { describe, expect, it } from "vitest";
import { lensGeometry } from "../src/accommodation/lens";
import { loadPreset } from "../src/presets/load";

const navarro = () => loadPreset("navarro-1985");

describe("lensGeometry (navarro1985 form)", () => {
  it("returns the relaxed table at A = 0", () => {
    const g = lensGeometry(navarro(), 0);
    expect(g).toEqual({
      anteriorRadiusMm: 10.2,
      posteriorRadiusMm: -6.0,
      thicknessMm: 4.0,
      anteriorConic: -3.1316,
      posteriorConic: -1.0,
      index555: 1.42,
      anteriorChamberDepthMm: 3.05,
    });
  });

  it("follows Table 4 at A = 4 D", () => {
    const L = Math.log(5);
    const g = lensGeometry(navarro(), 4);
    expect(g.anteriorRadiusMm).toBeCloseTo(10.2 - 1.75 * L, 12);
    expect(g.posteriorRadiusMm).toBeCloseTo(-6.0 + 0.2294 * L, 12);
    expect(g.thicknessMm).toBeCloseTo(4.0 + 0.1 * L, 12);
    expect(g.anteriorChamberDepthMm).toBeCloseTo(3.05 - 0.05 * L, 12);
    expect(g.index555).toBeCloseTo(1.42 + 9e-5 * (40 + 16), 12);
  });

  it("steepens the anterior surface and thickens the lens monotonically with A", () => {
    let prev = lensGeometry(navarro(), 0);
    for (let a = 0.5; a <= 10; a += 0.5) {
      const g = lensGeometry(navarro(), a);
      expect(g.anteriorRadiusMm).toBeLessThan(prev.anteriorRadiusMm);
      expect(Math.abs(g.posteriorRadiusMm)).toBeLessThan(Math.abs(prev.posteriorRadiusMm));
      expect(g.thicknessMm).toBeGreaterThan(prev.thicknessMm);
      prev = g;
    }
  });

  it("rejects negative accommodation", () => {
    expect(() => lensGeometry(navarro(), -0.1)).toThrow(RangeError);
  });

  it("holds the relaxed geometry at any A when no accommodation model is present", () => {
    const { lensAccommodationModel: _m, ...fixed } = navarro();
    expect(lensGeometry(fixed, 3)).toEqual(lensGeometry(fixed, 0));
  });

  it("throws on an unknown model form", () => {
    const eye = navarro();
    eye.lensAccommodationModel = { form: "mystery", coefficients: {} };
    expect(() => lensGeometry(eye, 1)).toThrow(/mystery/);
  });

  it("throws when the document lacks the four named surfaces", () => {
    const eye = navarro();
    eye.surfaces = eye.surfaces.slice(0, 2);
    expect(() => lensGeometry(eye, 0)).toThrow(/lens.anterior/);
  });
});
