/** Twiddle factors and bit-reversal table per transform length (cached). */
const plans = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();

function plan(n: number) {
  let p = plans.get(n);
  if (p === undefined) {
    if (!(Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0)) throw new RangeError(`FFT length must be a power of two, got ${n}`);
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      cos[k] = Math.cos((2 * Math.PI * k) / n);
      sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
    const bits = Math.log2(n);
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    p = { cos, sin, rev };
    plans.set(n, p);
  }
  return p;
}

/** In-place radix-2 FFT of the `n` contiguous complex values starting at `offset` (sign −1 forward, +1 inverse, unscaled). */
function fft1(re: Float64Array, im: Float64Array, n: number, offset: number, sign: number): void {
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i]!;
    if (j > i) {
      const a = offset + i;
      const b = offset + j;
      const tr = re[a]!;
      re[a] = re[b]!;
      re[b] = tr;
      const ti = im[a]!;
      im[a] = im[b]!;
      im[b] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = offset; start < offset + n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step]!;
        const wi = sign * sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const br = re[b]!;
        const bi = im[b]!;
        const xr = br * wr - bi * wi;
        const xi = br * wi + bi * wr;
        const ar = re[a]!;
        const ai = im[a]!;
        re[b] = ar - xr;
        im[b] = ai - xi;
        re[a] = ar + xr;
        im[a] = ai + xi;
      }
    }
  }
}

/** In-place transpose of an n × n row-major array. */
function transpose(a: Float64Array, n: number): void {
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = i * n + j;
      const q = j * n + i;
      const t = a[p]!;
      a[p] = a[q]!;
      a[q] = t;
    }
  }
}

/**
 * In-place 2-D complex FFT of an n × n row-major array (n a power of two). The forward
 * transform uses e^(−2πi·kx/n); the inverse uses e^(+2πi·kx/n) and is scaled by 1/n².
 * Columns are transformed as rows of the transpose (contiguous memory).
 */
export function fft2(re: Float64Array, im: Float64Array, n: number, inverse = false): void {
  if (re.length !== n * n || im.length !== n * n) throw new RangeError(`fft2 expects ${n}×${n} arrays`);
  const sign = inverse ? 1 : -1;
  for (let r = 0; r < n; r++) fft1(re, im, n, r * n, sign);
  transpose(re, n);
  transpose(im, n);
  for (let r = 0; r < n; r++) fft1(re, im, n, r * n, sign);
  transpose(re, n);
  transpose(im, n);
  if (inverse) {
    const s = 1 / (n * n);
    for (let i = 0; i < n * n; i++) {
      re[i]! *= s;
      im[i]! *= s;
    }
  }
}

/** Swap quadrants in place so index (0, 0) moves to (n/2, n/2) (its own inverse for even n). */
export function fftShift(a: Float64Array | Float32Array, n: number): void {
  const h = n / 2;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const j = (r + h) * n + ((c + h) % n);
      const t = a[i]!;
      a[i] = a[j]!;
      a[j] = t;
    }
  }
}
