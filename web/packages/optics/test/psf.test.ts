import { describe, expect, it } from "vitest";
import { polychromaticPsf, psf } from "../src/image/psf";

const zeros = () => new Array(15).fill(0);
const RAD_TO_ARCMIN = (180 / Math.PI) * 60;

/** Defocus coefficient for a refractive error M (D) over radius r (mm): c(2,0) = −M r²/(4√3). */
const defocus = (M: number, r: number) => {
  const c = zeros();
  c[4] = (-M * r * r) / (4 * Math.sqrt(3));
  return c;
};

describe("psf", () => {
  it("has Strehl 1 for a zero wavefront and puts the Airy first zero at 1.22 λ/D", () => {
    const R = 2;
    const lambda = 555;
    const pixelArcmin = ((lambda * 1e-6) / (8 * 2 * R)) * RAD_TO_ARCMIN;
    const p = psf({ coeffsMicrons: zeros(), pupilRadiusMm: R, wavelengthNm: lambda }, { pixelArcmin });
    expect(Math.abs(p.strehl - 1)).toBeLessThan(1e-3);
    const n = p.n;
    const row = n / 2;
    const prof = Array.from({ length: n / 2 }, (_, k) => p.intensity[row * n + n / 2 + k] ?? 0);
    let k = 1;
    while (k < prof.length - 1 && !(prof[k]! <= prof[k - 1]! && prof[k]! <= prof[k + 1]!)) k++;
    // Parabolic refinement of the minimum.
    const [a, b, c] = [prof[k - 1]!, prof[k]!, prof[k + 1]!];
    const sub = k + (0.5 * (a - c)) / (a - 2 * b + c);
    const expected = ((1.22 * lambda * 1e-6) / (2 * R)) * RAD_TO_ARCMIN;
    expect(Math.abs(sub * p.pixelArcmin - expected) / expected).toBeLessThan(0.05);
  });

  it("drops Strehl below 0.2 for 0.5 D of defocus at a 4 mm pupil, 555 nm", () => {
    const p = psf({ coeffsMicrons: defocus(-0.5, 2), pupilRadiusMm: 2, wavelengthNm: 555 });
    expect(p.strehl).toBeLessThan(0.2);
    expect(p.aliased).toBe(false);
  });

  it("samples at λ/(2D) by default and reports its field", () => {
    const p = psf({ coeffsMicrons: zeros(), pupilRadiusMm: 2, wavelengthNm: 555 });
    expect(p.pixelArcmin).toBeCloseTo(((555e-6 / 8) * RAD_TO_ARCMIN), 12);
    expect(p.fieldArcmin).toBeCloseTo(p.n * p.pixelArcmin, 12);
    expect(p.n).toBe(256);
  });

  it("flags aliasing when the defocus blur exceeds half the field (3 D at an 8 mm pupil)", () => {
    expect(psf({ coeffsMicrons: defocus(-3, 4), pupilRadiusMm: 4, wavelengthNm: 555 }).aliased).toBe(true);
  });

  it("has polychromatic Strehl 1 for a zero wavefront and weights wavelengths", () => {
    const inputs = [450, 555, 650].map((wl, i) => ({ coeffsMicrons: zeros(), pupilRadiusMm: 2, wavelengthNm: wl, weight: [0.1, 1, 0.2][i] }));
    const p = polychromaticPsf(inputs);
    expect(Math.abs(p.strehl - 1)).toBeLessThan(1e-3);
    expect(p.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(p.pixelArcmin).toBeCloseTo(((450e-6 / 8) * RAD_TO_ARCMIN), 12);
    expect(() => polychromaticPsf([inputs[0]!, { ...inputs[1]!, pupilRadiusMm: 1 }])).toThrow();
  });
});

describe("psf orientation", () => {
  it("puts the image of a wavefront tilted up (phase advance at +y) above the center, row 0 at the top", () => {
    const c = new Array(15).fill(0);
    c[1] = 0.3; // Z(1,−1) = 2ρ sin θ: advance at +y
    const p = psf({ coeffsMicrons: c, pupilRadiusMm: 2, wavelengthNm: 555 });
    let best = 0;
    for (let i = 1; i < p.intensity.length; i++) if (p.intensity[i]! > p.intensity[best]!) best = i;
    const row = Math.floor(best / p.n);
    const col = best % p.n;
    expect(row).toBeLessThan(p.n / 2);
    expect(col).toBe(p.n / 2);
  });
});
