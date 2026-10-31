import { fft2, scratchComplex } from "./fft";
import { otf, type Otf } from "./mtf";
import type { Psf } from "./psf";
import type { Bitmap } from "./targets";

/** Spectra of targets already convolved (targets are reused across frames and configurations). */
const spectra = new WeakMap<Bitmap, { re: Float64Array; im: Float64Array }>();

function spectrum(t: Bitmap): { re: Float64Array; im: Float64Array } {
  let s = spectra.get(t);
  if (s === undefined) {
    const re = Float64Array.from(t.data);
    const im = new Float64Array(re.length);
    fft2(re, im, t.width);
    s = { re, im };
    spectra.set(t, s);
  }
  return s;
}

/**
 * Retinal image: the target convolved with the PSF (normalized to unit sum, so mean luminance
 * is preserved), by FFT. The target must have the PSF's size and angular pixel. The
 * convolution is circular, so the target should leave a bright margin around its content.
 * Pass the PSF's `otf` to reuse it; the target's spectrum is cached per bitmap object.
 */
export function retinalImage(target: Bitmap, p: Psf, transfer?: Otf): Bitmap {
  const n = p.n;
  if (target.width !== n || target.height !== n) throw new RangeError(`Target must be ${n}×${n} to match the PSF`);
  if (Math.abs(target.pixelArcmin - p.pixelArcmin) > 1e-9 * p.pixelArcmin) {
    throw new RangeError(`Target pixel ${target.pixelArcmin}′ differs from the PSF pixel ${p.pixelArcmin}′`);
  }
  const k = transfer ?? otf(p);
  const t = spectrum(target);
  const [re, im] = scratchComplex(n, 0);
  for (let i = 0; i < n * n; i++) {
    const a = t.re[i]!;
    const b = t.im[i]!;
    const c = k.re[i]!;
    const d = k.im[i]!;
    re[i] = a * c - b * d;
    im[i] = a * d + b * c;
  }
  fft2(re, im, n, true);
  const data = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) data[i] = re[i]!;
  return { width: n, height: n, data, pixelArcmin: target.pixelArcmin };
}

/**
 * Retinal images of one target through two PSFs with one inverse FFT: both products are spectra
 * of real images, so IFFT(T·K_a + i·T·K_b) carries image a in its real part and b in its
 * imaginary part.
 */
export function retinalImagePair(target: Bitmap, a: Psf, b: Psf, ka: Otf, kb: Otf): [Bitmap, Bitmap] {
  const n = a.n;
  for (const p of [a, b]) {
    if (target.width !== p.n || target.height !== p.n) throw new RangeError(`Target must be ${p.n}×${p.n} to match the PSF`);
    if (Math.abs(target.pixelArcmin - p.pixelArcmin) > 1e-9 * p.pixelArcmin) {
      throw new RangeError(`Target pixel ${target.pixelArcmin}′ differs from the PSF pixel ${p.pixelArcmin}′`);
    }
  }
  const t = spectrum(target);
  const [re, im] = scratchComplex(n, 0);
  for (let i = 0; i < n * n; i++) {
    const tr = t.re[i]!;
    const ti = t.im[i]!;
    // T·K_a and T·K_b
    const pr = tr * ka.re[i]! - ti * ka.im[i]!;
    const pi = tr * ka.im[i]! + ti * ka.re[i]!;
    const qr = tr * kb.re[i]! - ti * kb.im[i]!;
    const qi = tr * kb.im[i]! + ti * kb.re[i]!;
    re[i] = pr - qi; // P + iQ
    im[i] = pi + qr;
  }
  fft2(re, im, n, true);
  const da = new Float32Array(n * n);
  const db = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    da[i] = re[i]!;
    db[i] = im[i]!;
  }
  return [
    { width: n, height: n, data: da, pixelArcmin: target.pixelArcmin },
    { width: n, height: n, data: db, pixelArcmin: target.pixelArcmin },
  ];
}
