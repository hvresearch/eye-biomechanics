import { applyRefractivePreset, buildSurfacesAt, eyeView, loadPreset } from "@eye/eye-model";
import { analyzeWavefront, fft2, zernikeWavefront, type WavefrontAnalysis } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { farPointOf } from "../src/worker/jobs";

/** Zero-padded FFT grid for the Strehl comparison (numerical: 4× the 64-sample pupil). */
const PAD_N = 256;
/** The plan's threshold for building the PSF from the raw OPD instead of the fit (numerical tolerance). */
const STREHL_TOLERANCE = 0.05;

/**
 * Strehl ratio of a wavefront sampled at the OPD map's valid cells: peak of |FFT(exp(i·2π·W/λ))|²
 * over the peak with W = 0, on the same samples.
 */
function strehl(a: WavefrontAnalysis, w: (i: number) => number): number {
  const { map } = a;
  const k = (2 * Math.PI) / (map.wavelengthNm * 1e-3);
  const peak = (phase: boolean) => {
    const re = new Float64Array(PAD_N * PAD_N);
    const im = new Float64Array(PAD_N * PAD_N);
    map.gridIndex.forEach((cell, i) => {
      if (!map.valid[i]) return;
      const r = Math.floor(cell / map.gridN);
      const c = cell % map.gridN;
      const idx = r * PAD_N + c;
      const ph = phase ? k * w(i) : 0;
      re[idx] = Math.cos(ph);
      im[idx] = Math.sin(ph);
    });
    fft2(re, im, PAD_N);
    let m = 0;
    for (let i = 0; i < re.length; i++) m = Math.max(m, re[i]! * re[i]! + im[i]! * im[i]!);
    return m;
  };
  return peak(true) / peak(false);
}

describe("PSF from the order-8 fit against the raw OPD (M3 follow-up)", () => {
  it("gives the astigmat's Strehl within 5% at a 7.5 mm pupil, so the PSF stays on the fit", () => {
    const eye = applyRefractivePreset(loadPreset("navarro-1985"), "astigmat-1.5-atr-corneal", farPointOf, "right");
    const a = analyzeWavefront(buildSurfacesAt(eye, 0), eyeView(eye, Number.POSITIVE_INFINITY, 7.5), { gridN: 64 });
    const R = a.map.pupilRadiusMm;
    const fit = (i: number, coeffs: readonly number[]) => zernikeWavefront(coeffs, a.map.xs[i]!, a.map.ys[i]!, R);
    // Uncorrected, and with the sphere and cylinder removed (a perfect spectacle correction),
    // where the higher orders the fit truncates matter most.
    const second = a.fit.coeffsMicrons.map((c, j) => (j >= 3 && j <= 5 ? c : 0));
    const cases = {
      uncorrected: { raw: (i: number) => a.map.opdMicrons[i]!, fitted: (i: number) => fit(i, a.fit.coeffsMicrons) },
      corrected: { raw: (i: number) => a.map.opdMicrons[i]! - fit(i, second), fitted: (i: number) => fit(i, a.fit.coeffsMicrons) - fit(i, second) },
    };
    for (const [name, c] of Object.entries(cases)) {
      const sRaw = strehl(a, c.raw);
      const sFit = strehl(a, c.fitted);
      process.stdout.write(
        `Strehl at 7.5 mm, ${name}: raw OPD ${sRaw.toExponential(4)}, order-8 fit ${sFit.toExponential(4)} (${((100 * (sFit - sRaw)) / sRaw).toFixed(2)}%), fit residual ${a.fit.residualRmsMicrons.toExponential(2)} µm RMS\n`,
      );
      expect(Math.abs(sFit - sRaw) / sRaw).toBeLessThan(STREHL_TOLERANCE);
    }
  });
});
