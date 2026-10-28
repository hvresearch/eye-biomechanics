/**
 * Zernike polynomials in the OSA/ANSI Z80.28 convention: single index j = (n(n+2) + m)/2,
 * unit-RMS normalization over the unit disk, Z = N·R_n^|m|(ρ)·cos(mθ) for m ≥ 0 and
 * N·R_n^|m|(ρ)·sin(|m|θ) for m < 0, θ measured from +x toward +y.
 */

/** Radial order n and azimuthal frequency m of OSA index j. */
export function zernikeIndex(j: number): { n: number; m: number } {
  if (!(Number.isInteger(j) && j >= 0)) throw new RangeError(`Zernike index must be a non-negative integer, got ${j}`);
  const n = Math.ceil((-3 + Math.sqrt(9 + 8 * j)) / 2);
  return { n, m: 2 * j - n * (n + 2) };
}

/** OSA index of (n, m); throws unless |m| ≤ n and n − |m| is even. */
export function zernikeJ(n: number, m: number): number {
  if (!(Number.isInteger(n) && Number.isInteger(m) && n >= 0 && Math.abs(m) <= n && (n - Math.abs(m)) % 2 === 0)) {
    throw new RangeError(`No Zernike polynomial with n = ${n}, m = ${m}`);
  }
  return (n * (n + 2) + m) / 2;
}

/** Number of polynomials up to and including radial order `maxOrder`. */
export function zernikeCount(maxOrder: number): number {
  return ((maxOrder + 1) * (maxOrder + 2)) / 2;
}

/** Normalization N_n^m = √(2(n+1)/(1 + δ_m0)). */
export function zernikeNorm(n: number, m: number): number {
  return Math.sqrt((2 * (n + 1)) / (m === 0 ? 2 : 1));
}

function factorial(k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
}

/** Coefficients of R_n^|m| by power: entry [p] multiplies ρ^p. */
const radialCache = new Map<number, Float64Array>();
function radialCoefficients(n: number, m: number): Float64Array {
  const am = Math.abs(m);
  const key = n * 1000 + am;
  let c = radialCache.get(key);
  if (c === undefined) {
    c = new Float64Array(n + 1);
    for (let s = 0; s <= (n - am) / 2; s++) {
      c[n - 2 * s] =
        ((s % 2 === 0 ? 1 : -1) * factorial(n - s)) / (factorial(s) * factorial((n + am) / 2 - s) * factorial((n - am) / 2 - s));
    }
    radialCache.set(key, c);
  }
  return c;
}

/** Radial polynomial R_n^|m|(ρ). */
export function zernikeRadial(n: number, m: number, rho: number): number {
  const c = radialCoefficients(n, m);
  let v = 0;
  for (let p = n; p >= 0; p--) v = v * rho + (c[p] ?? 0);
  return v;
}

/** Z_j(ρ, θ), normalized. */
export function zernikeValue(j: number, rho: number, theta: number): number {
  const { n, m } = zernikeIndex(j);
  const r = zernikeNorm(n, m) * zernikeRadial(n, m, rho);
  if (m > 0) return r * Math.cos(m * theta);
  if (m < 0) return r * Math.sin(-m * theta);
  return r;
}

interface BasisTable {
  /** Per term: radial order, signed m, and N·(radial coefficients by power). */
  n: Int32Array;
  m: Int32Array;
  coeffs: Float64Array[];
}
const basisTables = new Map<number, BasisTable>();
function basisTable(maxOrder: number): BasisTable {
  let t = basisTables.get(maxOrder);
  if (t === undefined) {
    const count = zernikeCount(maxOrder);
    t = { n: new Int32Array(count), m: new Int32Array(count), coeffs: [] };
    let j = 0;
    for (let n = 0; n <= maxOrder; n++) {
      for (let m = -n; m <= n; m += 2) {
        t.n[j] = n;
        t.m[j] = m;
        const N = zernikeNorm(n, m);
        t.coeffs.push(radialCoefficients(n, m).map((c) => c * N));
        j++;
      }
    }
    basisTables.set(maxOrder, t);
  }
  return t;
}

const MAX_SCRATCH_ORDER = 32;
const pw = new Float64Array(MAX_SCRATCH_ORDER + 1);
const cs = new Float64Array(MAX_SCRATCH_ORDER + 1);
const sn = new Float64Array(MAX_SCRATCH_ORDER + 1);

/** Every Z_j for j < zernikeCount(maxOrder) at (ρ, θ), written into `out` (powers and harmonics computed once). */
export function zernikeBasis(maxOrder: number, rho: number, theta: number, out: Float64Array): void {
  basisFrom(maxOrder, rho, Math.cos(theta), Math.sin(theta), out);
}

/**
 * `zernikeBasis` at unit-disk Cartesian coordinates (x, y) = ρ(cos θ, sin θ), without
 * trigonometric calls (the harmonics follow from x/ρ and y/ρ). The hot path of the fit and PSF.
 */
export function zernikeBasisXY(maxOrder: number, x: number, y: number, out: Float64Array): void {
  const rho = Math.sqrt(x * x + y * y);
  if (rho === 0) basisFrom(maxOrder, 0, 1, 0, out);
  else basisFrom(maxOrder, rho, x / rho, y / rho, out);
}

function basisFrom(maxOrder: number, rho: number, c1: number, s1: number, out: Float64Array): void {
  if (maxOrder > MAX_SCRATCH_ORDER) throw new RangeError(`Zernike order above ${MAX_SCRATCH_ORDER} is not supported`);
  const t = basisTable(maxOrder);
  pw[0] = 1;
  for (let p = 1; p <= maxOrder; p++) pw[p] = pw[p - 1]! * rho;
  cs[0] = 1;
  sn[0] = 0;
  for (let k = 1; k <= maxOrder; k++) {
    cs[k] = cs[k - 1]! * c1 - sn[k - 1]! * s1;
    sn[k] = sn[k - 1]! * c1 + cs[k - 1]! * s1;
  }
  const count = t.n.length;
  for (let j = 0; j < count; j++) {
    const c = t.coeffs[j]!;
    const n = t.n[j]!;
    const m = t.m[j]!;
    let r = 0;
    for (let p = n; p >= 0; p -= 2) r += c[p]! * pw[p]!;
    out[j] = m > 0 ? r * cs[m]! : m < 0 ? r * sn[-m]! : r;
  }
}

/**
 * Coefficient of ρ² in N·R_n^|m|(ρ) for index j (nonzero only for m = 0 and |m| = 2, n even).
 * The paraxial curvature of Σ c_j Z_j comes from these terms (Task 3.4, surfaces' meridian
 * curvature).
 */
export function zernikeRho2Coefficient(j: number): number {
  const { n, m } = zernikeIndex(j);
  const am = Math.abs(m);
  if (n < 2 || (am !== 0 && am !== 2)) return 0;
  return zernikeNorm(n, m) * (radialCoefficients(n, m)[2] ?? 0);
}

/** Polynomial in x and y as a dense (order+1)² table: entry [p·(order+1) + q] multiplies x^p y^q. */
type Poly2 = Float64Array;

function polyMul(a: Poly2, b: Poly2, order: number): Poly2 {
  const s = order + 1;
  const out = new Float64Array(s * s);
  for (let p1 = 0; p1 <= order; p1++) {
    for (let q1 = 0; q1 + p1 <= order; q1++) {
      const va = a[p1 * s + q1]!;
      if (va === 0) continue;
      for (let p2 = 0; p1 + p2 <= order; p2++) {
        for (let q2 = 0; p1 + p2 + q1 + q2 <= order; q2++) {
          const vb = b[p2 * s + q2]!;
          if (vb !== 0) out[(p1 + p2) * s + q1 + q2]! += va * vb;
        }
      }
    }
  }
  return out;
}

const cartesianCache = new Map<number, Poly2[]>();

/** Each Z_j up to `order` as a Cartesian polynomial on the unit disk (cached per order). */
function cartesianBasis(order: number): Poly2[] {
  let polys = cartesianCache.get(order);
  if (polys !== undefined) return polys;
  const s = order + 1;
  const mono = (p: number, q: number, c = 1) => {
    const a = new Float64Array(s * s);
    a[p * s + q] = c;
    return a;
  };
  const rho2 = new Float64Array(s * s);
  rho2[2 * s] = 1;
  rho2[2] = 1;
  // Powers of ρ² and the real/imaginary parts of (x + iy)^m.
  const rho2Pow: Poly2[] = [mono(0, 0)];
  for (let k = 1; 2 * k <= order; k++) rho2Pow.push(polyMul(rho2Pow[k - 1]!, rho2, order));
  const re: Poly2[] = [mono(0, 0)];
  const im: Poly2[] = [new Float64Array(s * s)];
  for (let m = 1; m <= order; m++) {
    // (a + ib)(x + iy) = (ax − by) + i(ay + bx)
    const a = re[m - 1]!;
    const b = im[m - 1]!;
    const nr = new Float64Array(s * s);
    const ni = new Float64Array(s * s);
    for (let p = 0; p < order; p++) {
      for (let q = 0; p + q < order; q++) {
        const va = a[p * s + q]!;
        const vb = b[p * s + q]!;
        nr[(p + 1) * s + q]! += va;
        nr[p * s + q + 1]! -= vb;
        ni[p * s + q + 1]! += va;
        ni[(p + 1) * s + q]! += vb;
      }
    }
    re.push(nr);
    im.push(ni);
  }
  polys = [];
  for (let n = 0; n <= order; n++) {
    for (let m = -n; m <= n; m += 2) {
      const am = Math.abs(m);
      const c = radialCoefficients(n, m);
      const N = zernikeNorm(n, m);
      const out = new Float64Array(s * s);
      const harmonic = m >= 0 ? re[am]! : im[am]!;
      for (let p = am; p <= n; p += 2) {
        const coef = (c[p] ?? 0) * N;
        if (coef === 0) continue;
        const term = polyMul(rho2Pow[(p - am) / 2]!, harmonic, order);
        for (let i = 0; i < s * s; i++) out[i]! += coef * term[i]!;
      }
      polys.push(out);
    }
  }
  cartesianCache.set(order, polys);
  return polys;
}

/**
 * Σ c_j Z_j as one Cartesian polynomial on the unit disk, for fast evaluation over many points
 * (`evalCartesian`). Returns the table and its order.
 */
export function zernikeToCartesian(coeffs: readonly number[]): { poly: Float64Array; order: number } {
  let order = 0;
  while (zernikeCount(order) < coeffs.length) order++;
  const basis = cartesianBasis(order);
  const s = order + 1;
  const poly = new Float64Array(s * s);
  coeffs.forEach((c, j) => {
    if (c === 0) return;
    const b = basis[j]!;
    for (let i = 0; i < s * s; i++) poly[i]! += c * b[i]!;
  });
  return { poly, order };
}

/** Coefficients in x of a Cartesian polynomial at fixed y: out[p] = Σ_q poly[p, q]·y^q (one row of evaluations). */
export function cartesianRow(poly: Float64Array, order: number, y: number, out: Float64Array): void {
  const s = order + 1;
  for (let p = 0; p <= order; p++) {
    let v = 0;
    for (let q = order - p; q >= 0; q--) v = v * y + poly[p * s + q]!;
    out[p] = v;
  }
}
