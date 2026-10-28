import { fft2, fftShift } from "./fft";
import type { Psf } from "./psf";

/** Optical transfer function of a PSF: the FFT of the PSF normalized to unit sum, origin at index 0. */
export interface Otf {
  re: Float64Array;
  im: Float64Array;
  n: number;
}

/** OTF of a PSF (one FFT); shared by `mtf` and `retinalImage` when both are wanted. */
export function otf(p: Psf): Otf {
  const n = p.n;
  let sum = 0;
  for (let i = 0; i < n * n; i++) sum += p.intensity[i]!;
  const re = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) re[i] = p.intensity[i]! / sum;
  fftShift(re, n); // PSF center to index 0
  const im = new Float64Array(n * n);
  fft2(re, im, n);
  return { re, im, n };
}

export interface Mtf {
  /** Spatial frequency of each radial bin, cycles per degree. */
  freqCpd: Float32Array;
  /** Radially averaged |OTF|, 1 at zero frequency. */
  radial: Float32Array;
  /** Diffraction-limited MTF of the same pupil and spectrum at the same frequencies. */
  diffraction: Float32Array;
}

/** Analytic diffraction-limited MTF of a circular pupil: (2/π)(acos s − s√(1 − s²)), s = ν/ν_c, ν_c = D/λ. */
export function diffractionMtf(pupilRadiusMm: number, wavelengthNm: number, freqCpd: number): number {
  const cutoffCpd = ((2 * pupilRadiusMm) / (wavelengthNm * 1e-6)) * (Math.PI / 180);
  const s = Math.abs(freqCpd) / cutoffCpd;
  if (s >= 1) return 0;
  return (2 / Math.PI) * (Math.acos(s) - s * Math.sqrt(1 - s * s));
}

/**
 * OTFs of two PSFs of the same size from one complex FFT (their real intensities packed as
 * real and imaginary parts, separated by Hermitian symmetry): X_a = (Z[k] + Z*[−k])/2,
 * X_b = (Z[k] − Z*[−k])/(2i).
 */
export function otfPair(a: Psf, b: Psf): [Otf, Otf] {
  const n = a.n;
  if (b.n !== n) throw new RangeError("otfPair needs PSFs of the same size");
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n * n; i++) {
    sa += a.intensity[i]!;
    sb += b.intensity[i]!;
  }
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    re[i] = a.intensity[i]! / sa;
    im[i] = b.intensity[i]! / sb;
  }
  fftShift(re, n);
  fftShift(im, n);
  fft2(re, im, n);
  const ar = new Float64Array(n * n);
  const ai = new Float64Array(n * n);
  const br = new Float64Array(n * n);
  const bi = new Float64Array(n * n);
  for (let u = 0; u < n; u++) {
    const um = (n - u) % n;
    for (let v = 0; v < n; v++) {
      const k = u * n + v;
      const km = um * n + ((n - v) % n);
      const zr = re[k]!;
      const zi = im[k]!;
      const cr = re[km]!;
      const ci = -im[km]!; // conj(Z[−k])
      ar[k] = (zr + cr) / 2;
      ai[k] = (zi + ci) / 2;
      // (Z − conj)/(2i) = −i(Z − conj)/2
      br[k] = (zi - ci) / 2;
      bi[k] = -(zr - cr) / 2;
    }
  }
  return [
    { re: ar, im: ai, n },
    { re: br, im: bi, n },
  ];
}

/**
 * Radially averaged MTF from a PSF: |OTF| normalized at zero frequency, in integer frequency
 * bins up to n/2. Pass the PSF's `otf` to reuse it.
 */
export function mtf(p: Psf, transfer: Otf = otf(p)): Mtf {
  const n = p.n;
  const { re, im } = transfer;
  const dc = Math.hypot(re[0]!, im[0]!);
  const bins = n / 2 + 1;
  const sum = new Float64Array(bins);
  const cnt = new Float64Array(bins);
  for (let i = 0; i < n; i++) {
    const ky = i < n / 2 ? i : i - n;
    for (let j = 0; j < n; j++) {
      const kx = j < n / 2 ? j : j - n;
      const b = Math.round(Math.sqrt(kx * kx + ky * ky));
      if (b >= bins) continue;
      const r = re[i * n + j]!;
      const q = im[i * n + j]!;
      sum[b]! += Math.sqrt(r * r + q * q) / dc;
      cnt[b]! += 1;
    }
  }
  const stepCpd = 1 / (n * (p.pixelArcmin / 60));
  const freqCpd = new Float32Array(bins);
  const radial = new Float32Array(bins);
  const diffraction = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    const f = b * stepCpd;
    freqCpd[b] = f;
    radial[b] = cnt[b]! > 0 ? sum[b]! / cnt[b]! : 0;
    diffraction[b] = p.wavelengthsNm.reduce((s, wl, i) => s + (p.weights[i] ?? 0) * diffractionMtf(p.pupilRadiusMm, wl, f), 0);
  }
  return { freqCpd, radial, diffraction };
}
