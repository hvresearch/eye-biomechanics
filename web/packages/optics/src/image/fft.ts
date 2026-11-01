/**
 * Per transform length: twiddles stored stage by stage (for butterfly size `size`, the `size/2`
 * factors e^(−2πik/size) start at offset `size/2 − 1`), and the bit-reversal permutation.
 */
const plans = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();

function plan(n: number) {
  let p = plans.get(n);
  if (p === undefined) {
    if (!(Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0)) throw new RangeError(`FFT length must be a power of two, got ${n}`);
    const cos = new Float64Array(Math.max(1, n - 1));
    const sin = new Float64Array(Math.max(1, n - 1));
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      for (let k = 0; k < half; k++) {
        cos[half - 1 + k] = Math.cos((2 * Math.PI * k) / size);
        sin[half - 1 + k] = Math.sin((2 * Math.PI * k) / size);
      }
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
  // Size-2 butterflies need no multiplication.
  const end = offset + n;
  for (let a = offset; a < end; a += 2) {
    const b = a + 1;
    const ar = re[a]!;
    const ai = im[a]!;
    const br = re[b]!;
    const bi = im[b]!;
    re[a] = ar + br;
    im[a] = ai + bi;
    re[b] = ar - br;
    im[b] = ai - bi;
  }
  for (let size = 4; size <= n; size <<= 1) {
    const half = size >> 1;
    const tw = half - 1;
    for (let start = offset; start < end; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[tw + k]!;
        const wi = sign * sin[tw + k]!;
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
 * Columns are transformed as rows of the transpose (contiguous memory). `rows` declares that
 * every row outside [from, to] is zero (a pupil smaller than the grid), which skips their pass.
 */
export function fft2(re: Float64Array, im: Float64Array, n: number, inverse = false, rows?: { from: number; to: number }): void {
  if (re.length !== n * n || im.length !== n * n) throw new RangeError(`fft2 expects ${n}×${n} arrays`);
  const sign = inverse ? 1 : -1;
  // Rows outside `rows` are known to be zero, so their transforms are zero and are skipped.
  const r0 = Math.max(0, rows?.from ?? 0);
  const r1 = Math.min(n - 1, rows?.to ?? n - 1);
  for (let r = r0; r <= r1; r++) fft1(re, im, n, r * n, sign);
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

/** Scratch complex buffers by (n, slot), reused across calls (each worker is single-threaded). */
const scratch = new Map<string, [Float64Array, Float64Array]>();

/**
 * A pair of n × n scratch arrays (real, imaginary), zeroed, valid until the next request for the
 * same slot. Callers use them only within one call and never return them; two slots let one
 * call hold two pairs. Reusing them keeps a request from allocating (and the collector from
 * reclaiming) several 0.5 MB arrays per FFT at the 256 grid.
 */
export function scratchComplex(n: number, slot: 0 | 1): [Float64Array, Float64Array] {
  const key = `${n}|${slot}`;
  let s = scratch.get(key);
  if (s === undefined) {
    s = [new Float64Array(n * n), new Float64Array(n * n)];
    scratch.set(key, s);
  } else {
    s[0].fill(0);
    s[1].fill(0);
  }
  return s;
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
