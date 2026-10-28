import { psf } from "../image/psf";
import type { Surface } from "../surfaces/types";
import type { ViewSpec } from "../trace/aim";
import { analyzeWavefront } from "../wavefront/analyze";
import { powerVectors, sphereCylFromPowerVectors } from "../wavefront/refraction";
import { nelderMead } from "./nelderMead";
import { SPECTACLE_DEFAULTS, lensSurfaces, type Prescription } from "./prescription";

export interface AutoPrescribeOptions {
  /** "rms": minimize the RMS wavefront error excluding piston and tilt (default); "strehl": maximize Strehl. */
  metric?: "rms" | "strehl";
  vertexMm?: number;
  baseCurveD?: number;
  index?: number;
  centerThicknessMm?: number;
  /** Pupil grid while searching (24) and for the reported residual (64). */
  searchGridN?: number;
  gridN?: number;
  wavelengthNm?: number;
}

export interface AutoPrescribeResult {
  prescription: Prescription;
  /** RMS wavefront error of the corrected eye at `gridN`, excluding piston and tilt, µm. */
  residualRmsMicrons: number;
  strehl: number;
  evaluations: number;
  /** The paraxial seed: the uncorrected refraction moved to the lens plane per principal meridian. */
  seed: Prescription;
}

/** Search controls (numerical): simplex step in diopters, stopping tolerance, evaluation cap, PSF grid for "strehl". */
const STEP_D = 0.25;
const TOLERANCE = 1e-6;
const MAX_EVALUATIONS = 240;
const STREHL_GRID = 128;

/**
 * Spectacle prescription for an eye (`eyeSurfaces`, image surface last, cornea at
 * `view.referenceZMm`) viewing `view`'s object. The seed is the uncorrected minimum-RMS
 * refraction at the pupil plane, vertex-shifted to the lens in each principal meridian
 * (F = R/(1 + d·R)); Nelder–Mead then searches the lens's power vector (M, J0, J45), which
 * has no axis wrap-around, minimizing the RMS wavefront error (or maximizing Strehl).
 */
export function autoPrescribe(eyeSurfaces: readonly Surface[], view: ViewSpec, opts: AutoPrescribeOptions = {}): AutoPrescribeResult {
  const design = {
    vertexMm: opts.vertexMm ?? SPECTACLE_DEFAULTS.vertexMm,
    baseCurveD: opts.baseCurveD ?? SPECTACLE_DEFAULTS.baseCurveD,
    index: opts.index ?? SPECTACLE_DEFAULTS.index,
    centerThicknessMm: opts.centerThicknessMm ?? SPECTACLE_DEFAULTS.centerThicknessMm,
  };
  const wl = opts.wavelengthNm ?? 555;
  const searchGrid = opts.searchGridN ?? 24;
  const uncorrected = analyzeWavefront(eyeSurfaces, view, { gridN: searchGrid, wavelengthNm: wl }).refraction;
  const d = (view.pupilPlaneZMm - (view.referenceZMm - design.vertexMm)) / 1000;
  const shift = (R: number) => R / (1 + d * R);
  const fa = shift(uncorrected.sphereD);
  const fb = shift(uncorrected.sphereD + uncorrected.cylinderD);
  const seed: Prescription = { ...design, sphereD: fa, cylinderD: fb - fa, axisDeg: uncorrected.axisDeg };

  const fromVector = (x: readonly number[]): Prescription => ({
    ...design,
    ...sphereCylFromPowerVectors(x[0] ?? 0, x[1] ?? 0, x[2] ?? 0),
  });
  const corrected = (p: Prescription, gridN: number) =>
    analyzeWavefront([...lensSurfaces(p, view.referenceZMm), ...eyeSurfaces], view, { gridN, wavelengthNm: wl });
  const strehlOf = (coeffs: number[]) => psf({ coeffsMicrons: coeffs, pupilRadiusMm: view.pupilRadiusMm, wavelengthNm: wl }, { gridN: STREHL_GRID }).strehl;
  const objective = (x: number[]) => {
    const fit = corrected(fromVector(x), searchGrid).fit;
    return opts.metric === "strehl" ? -strehlOf(fit.coeffsMicrons) : fit.rmsMicrons;
  };
  const pv = powerVectors(seed.sphereD, seed.cylinderD, seed.axisDeg);
  const best = nelderMead(objective, [pv.M, pv.J0, pv.J45], {
    step: [STEP_D, STEP_D, STEP_D],
    tolerance: TOLERANCE,
    maxEvaluations: MAX_EVALUATIONS,
  });
  const prescription = fromVector(best.x);
  const final = corrected(prescription, opts.gridN ?? 64);
  return {
    prescription,
    residualRmsMicrons: final.fit.rmsMicrons,
    strehl: strehlOf(final.fit.coeffsMicrons),
    evaluations: best.evaluations,
    seed,
  };
}
