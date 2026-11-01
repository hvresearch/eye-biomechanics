import { cartesianRow, zernikeToCartesian } from "../math/zernike";
import { refractionFromZernike } from "../wavefront/refraction";
import { fft2, fftShift, scratchComplex } from "./fft";

const RAD_TO_ARCMIN = (180 / Math.PI) * 60;

/** A wavefront to image: Zernike coefficients (µm) over a pupil of the given radius, at one wavelength. */
export interface WavefrontInput {
  coeffsMicrons: readonly number[];
  pupilRadiusMm: number;
  wavelengthNm: number;
  /** Spectral weight in a polychromatic sum (V(λ)); 1 when absent. */
  weight?: number;
}

export interface Psf {
  /**
   * Row-major n × n intensity, centered at (n/2, n/2), row 0 at the top (+y up, as perceived and
   * as the targets are drawn), scaled so the diffraction-limited peak is 1 (its maximum is the
   * Strehl ratio).
   */
  intensity: Float32Array;
  n: number;
  pixelArcmin: number;
  fieldArcmin: number;
  strehl: number;
  wavelengthsNm: number[];
  /** Normalized spectral weights, one per wavelength. */
  weights: number[];
  pupilRadiusMm: number;
  /** The geometric blur (from the fit's sphere and cylinder) exceeds half the field: the PSF wraps around. */
  aliased: boolean;
}

export interface PsfOptions {
  /** Grid size (power of two); 256 by default. */
  gridN?: number;
  /** Angular pixel, arcmin; default `defaultPixelArcmin` (at most λ_min / (2D), Nyquist for the shortest wavelength). */
  pixelArcmin?: number;
}

interface RawPsf {
  aberrated: Float64Array;
  ideal: Float64Array;
  blurRad: number;
}

/** Diffraction-limited PSFs by (n, pupil radius, wavelength, pixel): they depend on nothing else. */
const idealCache = new Map<string, Float64Array>();
const IDEAL_CACHE_SIZE = 16;

/**
 * |FFT(P)|² for the generalized pupil function P = A·exp(i·2π·W/λ) sampled so the image pixel is
 * `pixelRad`: the pupil spacing is λ/(n·pixel). The aberrated and diffraction-limited
 * intensities are each normalized to unit total energy (Parseval), so wavelengths with
 * different pupil sampling add correctly.
 */
function rawPsf(input: WavefrontInput, n: number, pixelRad: number): RawPsf {
  const lambdaMm = input.wavelengthNm * 1e-6;
  const dx = lambdaMm / (n * pixelRad);
  const R = input.pupilRadiusMm;
  // The wavefront as one Cartesian polynomial: per row, a Horner polynomial in x.
  const { poly, order } = zernikeToCartesian(input.coeffsMicrons);
  const row = new Float64Array(order + 1);
  const [reA, imA] = scratchComplex(n, 0);
  const idealKey = `${n}|${R}|${input.wavelengthNm}|${pixelRad}`;
  const cachedIdeal = idealCache.get(idealKey);
  const scratchI = cachedIdeal ? null : scratchComplex(n, 1);
  const reI = scratchI?.[0] ?? null;
  const k = (2 * Math.PI) / (input.wavelengthNm * 1e-3); // per µm of OPD
  let count = 0;
  const h = n / 2;
  // Rows that can hold pupil samples (the rest stay zero and their FFT pass is skipped).
  const rowSpan = Math.ceil(R / dx) + 1;
  const rows = { from: h - rowSpan, to: h + rowSpan };
  for (let i = 0; i < n; i++) {
    const y = (i - h) * dx;
    if (Math.abs(y) > R) continue;
    cartesianRow(poly, order, y / R, row);
    for (let j = 0; j < n; j++) {
      const x = (j - h) * dx;
      if (x * x + y * y > R * R) continue;
      const u = x / R;
      let w = 0;
      for (let p = order; p >= 0; p--) w = w * u + row[p]!;
      const idx = i * n + j;
      reA[idx] = Math.cos(k * w);
      imA[idx] = Math.sin(k * w);
      if (reI) reI[idx] = 1;
      count++;
    }
  }
  if (count === 0) throw new RangeError("The pupil is smaller than one sample of the PSF grid");
  fft2(reA, imA, n, false, rows);
  const aberrated = new Float64Array(n * n);
  const norm = 1 / (n * n * count); // Parseval: Σ|F|² = n²·Σ|P|² = n²·count
  for (let i = 0; i < n * n; i++) aberrated[i] = (reA[i]! * reA[i]! + imA[i]! * imA[i]!) * norm;
  fftShift(aberrated, n);
  let ideal = cachedIdeal;
  if (ideal === undefined && scratchI) {
    const [reI, imI] = scratchI;
    fft2(reI, imI, n, false, rows);
    ideal = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) ideal[i] = (reI[i]! * reI[i]! + imI[i]! * imI[i]!) * norm;
    fftShift(ideal, n);
    if (idealCache.size >= IDEAL_CACHE_SIZE) idealCache.clear();
    idealCache.set(idealKey, ideal);
  }
  if (ideal === undefined) throw new Error("unreachable: no diffraction-limited PSF");
  const rx = refractionFromZernike(input.coeffsMicrons, R);
  const maxPowerD = Math.abs(rx.M) + Math.hypot(rx.J0, rx.J45);
  return { aberrated, ideal, blurRad: (maxPowerD * 2 * R) / 1000 };
}

/** Steps per octave of the default pixel ladder (numerical): finer than this barely changes the image. */
const PIXEL_STEPS_PER_OCTAVE = 8;

/**
 * Default PSF pixel, arcmin: the largest step of a ladder 2^(k/8) arcmin that does not exceed
 * λ/(2D) (Nyquist). Quantizing keeps the pixel, and so the target bitmap and its cached
 * spectrum, unchanged while the pupil varies a little.
 */
export function defaultPixelArcmin(wavelengthNm: number, pupilRadiusMm: number): number {
  const nyquist = ((wavelengthNm * 1e-6) / (4 * pupilRadiusMm)) * RAD_TO_ARCMIN;
  return 2 ** (Math.floor(PIXEL_STEPS_PER_OCTAVE * Math.log2(nyquist) + 1e-9) / PIXEL_STEPS_PER_OCTAVE);
}

function combine(inputs: readonly WavefrontInput[], opts: PsfOptions): Psf {
  if (inputs.length === 0) throw new RangeError("No wavefronts to image");
  const n = opts.gridN ?? 256;
  const R = inputs[0]!.pupilRadiusMm;
  const lambdaMin = Math.min(...inputs.map((w) => w.wavelengthNm));
  const pixelRad = opts.pixelArcmin !== undefined ? opts.pixelArcmin / RAD_TO_ARCMIN : defaultPixelArcmin(lambdaMin, R) / RAD_TO_ARCMIN;
  const wsum = inputs.reduce((s, w) => s + (w.weight ?? 1), 0);
  const weights = inputs.map((w) => (w.weight ?? 1) / wsum);
  const sumA = new Float64Array(n * n);
  const sumI = new Float64Array(n * n);
  let blurRad = 0;
  inputs.forEach((w, i) => {
    const raw = rawPsf(w, n, pixelRad);
    const wt = weights[i]!;
    for (let p = 0; p < n * n; p++) {
      sumA[p]! += wt * raw.aberrated[p]!;
      sumI[p]! += wt * raw.ideal[p]!;
    }
    blurRad = Math.max(blurRad, raw.blurRad);
  });
  let peakI = 0;
  for (let p = 0; p < n * n; p++) peakI = Math.max(peakI, sumI[p]!);
  // Rows are written top-down (+y up), the orientation of the targets, so the PSF convolves
  // and displays without a flip: FFT row r (angle +y) goes to row (n − r) mod n.
  const intensity = new Float32Array(n * n);
  let strehl = 0;
  for (let r = 0; r < n; r++) {
    const dst = ((n - r) % n) * n;
    for (let c = 0; c < n; c++) {
      const v = sumA[r * n + c]! / peakI;
      intensity[dst + c] = v;
      strehl = Math.max(strehl, v);
    }
  }
  const fieldRad = n * pixelRad;
  return {
    intensity,
    n,
    pixelArcmin: pixelRad * RAD_TO_ARCMIN,
    fieldArcmin: fieldRad * RAD_TO_ARCMIN,
    strehl,
    wavelengthsNm: inputs.map((w) => w.wavelengthNm),
    weights,
    pupilRadiusMm: R,
    aliased: blurRad > fieldRad / 2,
  };
}

/** Monochromatic PSF of a wavefront (spec §5.4): |FFT(P)|², peak of the diffraction-limited PSF = 1. */
export function psf(input: WavefrontInput, opts: PsfOptions = {}): Psf {
  return combine([input], opts);
}

/**
 * Polychromatic PSF: the weighted sum of each wavelength's PSF on one angular grid, each with
 * unit energy, normalized so the summed diffraction-limited peak is 1. All inputs must share
 * the pupil radius.
 */
export function polychromaticPsf(inputs: readonly WavefrontInput[], opts: PsfOptions = {}): Psf {
  if (inputs.some((w) => w.pupilRadiusMm !== inputs[0]?.pupilRadiusMm)) throw new RangeError("Polychromatic inputs must share the pupil radius");
  return combine(inputs, opts);
}
