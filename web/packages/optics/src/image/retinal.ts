import { fft2 } from "./fft";
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
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
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
