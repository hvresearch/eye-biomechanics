import type { ClinicalPrescription, EyeParameters } from "@eye/eye-model";
import type { Refraction, Surface, Vec3 } from "@eye/optics";

/** A spectacle lens in clinical terms: minus-cylinder back-vertex powers, axis TABO, and its design. */
export interface ClinicalLens extends ClinicalPrescription {
  vertexMm: number;
  baseCurveD: number;
  index: number;
  centerThicknessMm: number;
}

/** What the wave-optics pipeline computes for an eye (the right eye in the viewer). */
export interface WaveRequest {
  /** Pupil grid across the diameter (64). */
  gridN: number;
  /** PSF grid (256). */
  psfN: number;
  /** Five wavelengths weighted by V(λ) instead of 555 nm alone. */
  polychromatic: boolean;
  /** Height of the Snellen E in the retinal image, arcmin (5 is 20/20). */
  letterArcmin: number;
  /** Also run auto-prescribe (slow; on demand only). */
  autoPrescribe: boolean;
}

/** One eye's optics job: the document and how far it is accommodated (from the main thread). */
export interface EyeOpticsRequest {
  side: "left" | "right";
  params: EyeParameters;
  /** Accommodation response (static controller or dynamics), diopters. */
  accommodationD: number;
  /** This eye's distance to the target, meters (Infinity for a distant target). */
  objectDistanceM: number;
  pupilSemiDiamMm: number;
  /** Rays in the drawn sagittal fan (odd numbers include the chief ray; 0 draws none). */
  fanRays: number;
  /** The eye's spectacle lens, if any. */
  spectacles?: ClinicalLens | null;
  /** Whether the lens is worn: it then drives the defocus, far point, and drawn fan. */
  corrected?: boolean;
  wave?: WaveRequest | null;
}

export interface OpticsRequest {
  id: number;
  eyes: EyeOpticsRequest[];
}

/** Wave optics of one configuration (eye alone, or eye plus spectacles). */
export interface WaveResult {
  /** Minimum-RMS refraction at the pupil plane, clinical (TABO axis). */
  refraction: Refraction;
  coeffsMicrons: number[];
  rmsMicrons: number;
  hoRmsMicrons: number;
  strehl: number;
  /** PSF intensity (n × n, diffraction-limited peak 1). */
  psf: Float32Array;
  psfN: number;
  pixelArcmin: number;
  fieldArcmin: number;
  aliased: boolean;
  mtf: { freqCpd: Float32Array; radial: Float32Array; diffraction: Float32Array };
  /** Retinal image of the Snellen E (psfN × psfN, 0 dark … 1 bright). */
  retinal: Float32Array;
  /** OPD over the pupil grid (gridN × gridN, µm) without piston and tilt, NaN outside the pupil or where vignetted. */
  opdGrid: Float32Array;
  gridN: number;
  pupilRadiusMm: number;
  validFraction: number;
}

export interface EyeWave {
  uncorrected: WaveResult;
  corrected: WaveResult | null;
  autoRx: (ClinicalLens & { residualRmsMicrons: number }) | null;
}

export interface EyeOptics {
  side: "left" | "right";
  /** Accommodated eye surfaces, retina last (spectacle surfaces are not included). */
  surfaces: Surface[];
  /** The spectacle lens surfaces when the eye wears them, else empty. */
  lensSurfaces: Surface[];
  /** Lens model parameter solved so the paraxial far point moves by `accommodationD`. */
  lensParameterA: number;
  /** Paraxial power of the accommodated eye alone. */
  paraxialPowerD: number;
  /** Far point of the relaxed eye (with its spectacles when worn), clinical sign. */
  farPointD: number;
  defocusD: number;
  bestFocusZMm: number;
  retinaZMm: number;
  rmsSpotMm: number;
  /** One polyline per fan ray: launch point then one vertex per surface hit, mm. */
  fan: Vec3[][];
  vignettedRays: number;
  wave: EyeWave | null;
}

export interface OpticsResponse {
  id: number;
  eyes: EyeOptics[];
  elapsedMs: number;
}

export interface OpticsFailure {
  id: number;
  error: string;
}

export type OpticsWorkerMessage = OpticsResponse | OpticsFailure;

export function isFailure(m: OpticsWorkerMessage): m is OpticsFailure {
  return "error" in m;
}

/** The typed-array buffers of a response, to transfer rather than copy. */
export function transferables(res: OpticsResponse): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const e of res.eyes) {
    for (const w of [e.wave?.uncorrected, e.wave?.corrected]) {
      if (!w) continue;
      for (const a of [w.psf, w.retinal, w.opdGrid, w.mtf.freqCpd, w.mtf.radial, w.mtf.diffraction]) out.push(a.buffer as ArrayBuffer);
    }
  }
  return out;
}
