export interface NelderMeadOptions {
  /** Initial simplex step per coordinate. */
  step: readonly number[];
  /** Stop when the simplex's spread of function values falls below this. */
  tolerance?: number;
  maxEvaluations?: number;
}

export interface NelderMeadResult {
  x: number[];
  fx: number;
  evaluations: number;
}

/**
 * Nelder–Mead downhill simplex (reflection 1, expansion 2, contraction ½, shrink ½). Minimizes
 * `f` from `x0`; stops when the simplex's function values agree within `tolerance` or after
 * `maxEvaluations` calls.
 */
export function nelderMead(f: (x: number[]) => number, x0: readonly number[], opts: NelderMeadOptions): NelderMeadResult {
  const n = x0.length;
  const tol = opts.tolerance ?? 1e-10;
  const maxEval = opts.maxEvaluations ?? 200 * n;
  let evaluations = 0;
  const call = (x: number[]) => {
    evaluations++;
    const v = f(x);
    return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
  };
  let simplex = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + (opts.step[i] ?? 1) : v)))];
  let values = simplex.map(call);
  const combine = (a: number[], b: number[], t: number) => a.map((v, i) => v + t * (b[i]! - v));

  while (evaluations < maxEval) {
    const order = values.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    simplex = order.map(([, i]) => simplex[i]!);
    values = order.map(([v]) => v);
    if (Math.abs(values[n]! - values[0]!) <= tol * (Math.abs(values[0]!) + tol)) break;
    const centroid = new Array<number>(n).fill(0);
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) centroid[i]! += simplex[k]![i]! / n;
    const worst = simplex[n]!;
    const xr = combine(centroid, worst, -1);
    const fr = call(xr);
    if (fr < values[0]!) {
      const xe = combine(centroid, worst, -2);
      const fe = call(xe);
      if (fe < fr) {
        simplex[n] = xe;
        values[n] = fe;
      } else {
        simplex[n] = xr;
        values[n] = fr;
      }
    } else if (fr < values[n - 1]!) {
      simplex[n] = xr;
      values[n] = fr;
    } else {
      const outside = fr < values[n]!;
      const xc = outside ? combine(centroid, xr, 0.5) : combine(centroid, worst, 0.5);
      const fc = call(xc);
      if (fc < (outside ? fr : values[n]!)) {
        simplex[n] = xc;
        values[n] = fc;
      } else {
        const best = simplex[0]!;
        for (let k = 1; k <= n; k++) {
          simplex[k] = combine(best, simplex[k]!, 0.5);
          values[k] = call(simplex[k]!);
        }
      }
    }
  }
  let bi = 0;
  for (let k = 1; k <= n; k++) if (values[k]! < values[bi]!) bi = k;
  return { x: simplex[bi]!, fx: values[bi]!, evaluations };
}
