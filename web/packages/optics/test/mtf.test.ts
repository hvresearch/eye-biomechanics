import { describe, expect, it } from "vitest";
import { diffractionMtf, mtf } from "../src/image/mtf";
import { psf } from "../src/image/psf";

describe("mtf", () => {
  it("is 1 at zero frequency and matches the analytic diffraction limit for a perfect pupil", () => {
    const p = psf({ coeffsMicrons: new Array(15).fill(0), pupilRadiusMm: 2, wavelengthNm: 555 });
    const m = mtf(p);
    expect(m.radial[0]).toBeCloseTo(1, 9);
    expect(m.diffraction[0]).toBeCloseTo(1, 12);
    const cutoff = ((4 / 555e-6) * Math.PI) / 180;
    for (let b = 1; b < m.freqCpd.length; b++) {
      if (m.freqCpd[b]! > 0.8 * cutoff) break;
      expect(Math.abs(m.radial[b]! - diffractionMtf(2, 555, m.freqCpd[b]!)), `bin ${b}`).toBeLessThan(0.02);
    }
  });

  it("falls below the diffraction limit with defocus", () => {
    const c = new Array(15).fill(0);
    c[4] = 0.3;
    const m = mtf(psf({ coeffsMicrons: c, pupilRadiusMm: 2, wavelengthNm: 555 }));
    const b = m.freqCpd.findIndex((f) => f >= 15);
    expect(m.radial[b]!).toBeLessThan(m.diffraction[b]! - 0.1);
  });

  it("reaches zero at the cutoff D/λ", () => {
    expect(diffractionMtf(2, 555, ((4 / 555e-6) * Math.PI) / 180)).toBeCloseTo(0, 12);
    expect(diffractionMtf(2, 555, ((8 / 555e-6) * Math.PI) / 180)).toBe(0);
    expect(diffractionMtf(2, 555, 0)).toBe(1);
  });
});
