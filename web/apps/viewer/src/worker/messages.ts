import type { ClinicalPrescription, EyeParameters } from "@eye/eye-model";
import type { Refraction, Surface, Vec3 } from "@eye/optics";
import type { EyesJob, EyesJobResult } from "./jobs";

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
  /**
   * Amplitude of accommodation, diopters. With it the wave optics analyze the configuration not
   * worn (eye alone, or eye plus lens) at the accommodation it would use; without it both
   * configurations share `accommodationD`.
   */
  amplitudeD?: number;
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
  /**
   * Compare this eye with a reference document (a biomechanics result against its unloaded
   * eye): both relaxed, on the visual axis, at 555 nm, by the paraxial-method refraction.
   */
  induced?: { reference: EyeParameters } | null;
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

/** Refraction of a loaded document and its reference, and their difference (clinical, TABO). */
export interface InducedRefraction {
  loaded: Refraction;
  reference: Refraction;
  /** Loaded minus reference: power vectors subtracted, then sphere, minus cylinder, axis. */
  delta: { M: number; J0: number; J45: number; sphereD: number; cylinderD: number; axisDeg: number };
  pupilDiameterMm: number;
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
  /** Far point of the relaxed eye (with its spectacles when worn), clinical sign: the minimum-RMS spherical equivalent at this pupil. */
  farPointD: number;
  defocusD: number;
  bestFocusZMm: number;
  retinaZMm: number;
  rmsSpotMm: number;
  /** One polyline per fan ray: launch point then one vertex per surface hit, mm. */
  fan: Vec3[][];
  vignettedRays: number;
  wave: EyeWave | null;
  /** Why the wave optics of this eye failed (no chief ray, too few rays), or null; `wave` is then null. */
  waveError: string | null;
  induced: InducedRefraction | null;
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

/** Preset solving and the decomposition, run in the worker beside the optics requests. */
export interface JobRequest {
  kind: "job";
  id: number;
  job: EyesJob;
}

export type JobMessage = { kind: "job"; id: number; result: EyesJobResult } | { kind: "job"; id: number; error: string };

/** What the main thread posts to the worker. */
export type WorkerRequest = OpticsRequest | JobRequest;

export type OpticsWorkerMessage = OpticsResponse | OpticsFailure | JobMessage;

export function isJobRequest(r: WorkerRequest): r is JobRequest {
  return "kind" in r && r.kind === "job";
}

export function isJobMessage(m: OpticsWorkerMessage): m is JobMessage {
  return "kind" in m && m.kind === "job";
}

export function isFailure(m: OpticsResponse | OpticsFailure): m is OpticsFailure {
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
