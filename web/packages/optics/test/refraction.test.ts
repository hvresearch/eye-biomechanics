import { describe, expect, it } from "vitest";
import { paraxialPower } from "../src/paraxial/abcd";
import { analyzeWavefront } from "../src/wavefront/analyze";
import { powerVectors, refractionFromZernike, sphereCylFromPowerVectors, wrapAxisDeg } from "../src/wavefront/refraction";
import { toricNavarro } from "./helpers/eyes";
import { navarroSurfaces } from "./helpers/navarro";
import { onAxisView } from "./helpers/systems";

function coeffs(entries: Record<number, number>): number[] {
  const c = new Array(45).fill(0);
  for (const [j, v] of Object.entries(entries)) c[Number(j)] = v;
  return c;
}

describe("power vectors", () => {
  it("round-trip (S, C, axis) for 50 random prescriptions, including axes near 0 and 180", () => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const cases = Array.from({ length: 48 }, () => [rnd() * 16 - 8, -rnd() * 6 - 0.01, 0.01 + rnd() * 179.98] as const);
    cases.push([1, -2, 0.5], [-3, -0.75, 179.5]);
    for (const [S, C, ax] of cases) {
      const pv = powerVectors(S, C, ax);
      const back = sphereCylFromPowerVectors(pv.M, pv.J0, pv.J45);
      expect(Math.abs(back.sphereD - S)).toBeLessThan(1e-9);
      expect(Math.abs(back.cylinderD - C)).toBeLessThan(1e-9);
      expect(Math.abs(back.axisDeg - ax)).toBeLessThan(1e-6);
    }
  });

  it("keeps axes in (0, 180]", () => {
    expect(wrapAxisDeg(0)).toBe(180);
    expect(wrapAxisDeg(180)).toBe(180);
    expect(wrapAxisDeg(-30)).toBeCloseTo(150, 12);
    expect(wrapAxisDeg(200)).toBeCloseTo(20, 12);
    expect(sphereCylFromPowerVectors(1, 0, 0)).toEqual({ sphereD: 1, cylinderD: -0, axisDeg: 180 });
  });
});

describe("refractionFromZernike", () => {
  it("converts pure defocus with M = −4√3 c/r²", () => {
    const r = refractionFromZernike(coeffs({ 4: 1 }), 2);
    expect(r.M).toBeCloseTo(-Math.sqrt(3), 12);
    expect(r.sphereD).toBeCloseTo(-Math.sqrt(3), 12);
    expect(r.cylinderD).toBeCloseTo(0, 12);
  });

  it("puts c(2,2) astigmatism at 90 or 180 and c(2,−2) at 45 or 135", () => {
    expect(refractionFromZernike(coeffs({ 5: 0.5 }), 2).axisDeg).toBeCloseTo(90, 9);
    expect(refractionFromZernike(coeffs({ 5: -0.5 }), 2).axisDeg).toBeCloseTo(180, 9);
    expect(refractionFromZernike(coeffs({ 3: 0.5 }), 2).axisDeg).toBeCloseTo(135, 9);
    expect(refractionFromZernike(coeffs({ 3: -0.5 }), 2).axisDeg).toBeCloseTo(45, 9);
    const r = refractionFromZernike(coeffs({ 5: 0.5 }), 2);
    expect(r.cylinderD).toBeCloseTo(-2 * ((2 * Math.sqrt(6) * 0.5) / 4), 12);
    expect(r.J0).toBeCloseTo((-2 * Math.sqrt(6) * 0.5) / 4, 12);
  });

  it("adds +12√5 c(4,0)/r² to M in the paraxial method only", () => {
    const c = coeffs({ 12: 0.1 });
    expect(refractionFromZernike(c, 2).M).toBeCloseTo(0, 15);
    expect(refractionFromZernike(c, 2, "paraxial").M).toBeCloseTo((12 * Math.sqrt(5) * 0.1) / 4, 12);
  });

  it("finds −1.5 D of cylinder at axis 180 for a Navarro eye with a 1.5 D with-the-rule toric cornea", () => {
    const eye = toricNavarro(1.5);
    const a = analyzeWavefront(eye, onAxisView(1.5), { gridN: 48 });
    expect(a.refraction.cylinderD).toBeGreaterThan(-1.6);
    expect(a.refraction.cylinderD).toBeLessThan(-1.4);
    expect(Math.min(Math.abs(a.refraction.axisDeg - 180), a.refraction.axisDeg)).toBeLessThan(2);
  });

  it("matches the paraxial far point of a lengthened eye with the paraxial method", () => {
    const s = navarroSurfaces();
    const retina = s[s.length - 1]!;
    const long = [...s.slice(0, -1), { ...retina, vertexZMm: retina.vertexZMm + 1 }];
    const far = paraxialPower(long).farPointD;
    const a = analyzeWavefront(long, onAxisView(1.5), { gridN: 48, refractionMethod: "paraxial" });
    expect(Math.abs(a.refraction.M - far)).toBeLessThan(0.05);
  });
});
