import { validatePredictions, type PredictionsDocument } from "@eye/eye-model";

/**
 * The prediction grid (data/results/predictions/*.json, schemas/predictions.schema.json) and its
 * interpolation for a subject (spec §8, §12: predictions are precomputed, the viewer
 * interpolates; M5 plan, Task 5.12, Deviation 7).
 */
export type PredictionGrid = PredictionsDocument;

export interface PredictionProfile {
  nearHours: number;
  /** Refraction at `anchorAgeYears` (minus cylinder, axis 180, the grid's baseline axis). */
  baselineSphereD: number;
  baselineCylinderD: number;
  /** Age at which the baseline refraction holds (the grid's baseline age by default). */
  anchorAgeYears: number;
}

export interface Bands {
  p05: number[];
  p50: number[];
  p95: number[];
}

export interface Onsets {
  refraction: number | null;
  acuity: number | null;
}

/** 5% and 95% onset ages over the posterior draws; null at 95% means later than the last age (or never). */
export interface OnsetRange {
  refraction: [number | null, number | null];
  acuity: [number | null, number | null];
}

export interface Trajectory {
  ages: number[];
  sphere: Bands;
  cylinder: Bands;
  axisDeg: number[];
  /** Median logMAR (the grid's, blended like the bands); null when the grid has none or the trajectory was re-anchored. */
  logMAR: number[] | null;
  /** Onsets of the displayed median (`onsetFromCurve`). */
  onset: Onsets;
  /** The grid's 5–95% onset range at the nearest node; null after re-anchoring. */
  onsetRange: OnsetRange | null;
  /** Profile inputs that fell outside the grid and were clamped to its edge. */
  clamped: string[];
}

/** The grid files, loaded on demand so the main bundle does not carry them. */
const FILES = import.meta.glob<unknown>("../../../../../data/results/predictions/*.json", { import: "default" });

export class PredictionLoadError extends Error {}

/** Load and validate the newest grid (the last file name in order). */
export async function loadPredictionGrid(): Promise<PredictionGrid> {
  const names = Object.keys(FILES).sort();
  const last = names[names.length - 1];
  if (last === undefined) throw new PredictionLoadError("No prediction grid is committed under data/results/predictions");
  return parsePredictionGrid(await FILES[last]!());
}

export function parsePredictionGrid(raw: unknown): PredictionGrid {
  const r = validatePredictions(raw);
  if (!r.ok) throw new PredictionLoadError(`Prediction grid: ${r.errors[0] ?? "invalid"}`);
  return r.value;
}

/** Lower index and weight of `x` on a monotone axis (either direction), clamped to its ends. */
function locate(axis: number[], x: number): { i: number; w: number; clamped: boolean } {
  const n = axis.length;
  if (n > 1 && axis[0]! > axis[n - 1]!) return locate(axis.map((v) => -v), -x);
  if (n === 1) return { i: 0, w: 0, clamped: x !== axis[0] };
  if (x <= axis[0]!) return { i: 0, w: 0, clamped: x < axis[0]! };
  if (x >= axis[n - 1]!) return { i: n - 2, w: 1, clamped: x > axis[n - 1]! };
  let i = 0;
  while (axis[i + 1]! < x) i++;
  return { i, w: (x - axis[i]!) / (axis[i + 1]! - axis[i]!), clamped: false };
}

const DEG = Math.PI / 180;

/** Power vector (M, J0, J45) of sphere, minus cylinder, axis (TABO). */
function vector(s: number, c: number, axisDeg: number): [number, number, number] {
  return [s + c / 2, (-c / 2) * Math.cos(2 * axisDeg * DEG), (-c / 2) * Math.sin(2 * axisDeg * DEG)];
}

function refraction(v: readonly number[]): { sphereD: number; cylinderD: number; axisDeg: number } {
  const j = Math.hypot(v[1]!, v[2]!);
  const c = -2 * j;
  let axis = ((0.5 * Math.atan2(v[2]!, v[1]!)) / DEG + 180) % 180;
  if (axis === 0) axis = 180;
  return { sphereD: v[0]! - c / 2, cylinderD: c, axisDeg: axis };
}

/**
 * The interpolation corners of a profile: grid indices with trilinear weights over
 * (nearHours, baselineSphereD, baselineCylinderD), and the axes the profile was clamped on.
 */
function cornersOf(grid: PredictionGrid, p: PredictionInputs) {
  const a = grid.axes;
  const loc = [
    ["nearHours", locate(a.nearHours, p.nearHours)],
    ["baselineSphereD", locate(a.baselineSphereD, p.baselineSphereD)],
    ["baselineCylinderD", locate(a.baselineCylinderD, -Math.abs(p.baselineCylinderD))],
  ] as const;
  const corners: Array<{ idx: [number, number, number]; w: number }> = [];
  for (const di of [0, 1]) {
    for (const dj of [0, 1]) {
      for (const dk of [0, 1]) {
        const [, li] = loc[0];
        const [, lj] = loc[1];
        const [, lk] = loc[2];
        const w = (di ? li.w : 1 - li.w) * (dj ? lj.w : 1 - lj.w) * (dk ? lk.w : 1 - lk.w);
        if (w === 0) continue;
        const idx: [number, number, number] = [
          Math.min(li.i + di, a.nearHours.length - 1),
          Math.min(lj.i + dj, a.baselineSphereD.length - 1),
          Math.min(lk.i + dk, a.baselineCylinderD.length - 1),
        ];
        corners.push({ idx, w });
      }
    }
  }
  const nearest = corners.reduce((best, c) => (c.w > best.w ? c : best), corners[0]!);
  return { corners, nearest: nearest.idx, clamped: loc.filter(([, l]) => l.clamped).map(([name]) => name) };
}

/** The profile inputs the grid is indexed by. */
export type PredictionInputs = Omit<PredictionProfile, "anchorAgeYears">;

/**
 * The grid's 5–95% onset ages over the posterior draws at the profile's nearest node (onset
 * ages do not blend: a node without an onset has none to average).
 */
export function onsetRange(grid: PredictionGrid, p: PredictionInputs): OnsetRange {
  const [i, j, k] = cornersOf(grid, p).nearest;
  const pick = (b: PredictionGrid["onset"]["refraction"]): [number | null, number | null] => [b.p05[i]![j]![k]! ?? null, b.p95[i]![j]![k]! ?? null];
  return { refraction: pick(grid.onset.refraction), acuity: pick(grid.onset.acuity) };
}

/**
 * Trilinear interpolation over (nearHours, baselineSphereD, baselineCylinderD) at every age.
 * Bands and logMAR interpolate linearly; the median trajectory interpolates as power vectors
 * (so the axis blends without wrapping). Onsets are those of the displayed median and the
 * grid's thresholds; the 5–95% onset range is the nearest node's. Inputs outside the grid
 * clamp and are reported in `clamped`.
 */
export function interpolate(grid: PredictionGrid, p: PredictionInputs): Trajectory {
  const a = grid.axes;
  const { corners, clamped } = cornersOf(grid, p);
  const n = a.ages.length;
  const blend = (field: number[][][][]) => {
    const out = new Array<number>(n).fill(0);
    for (const { idx, w } of corners) {
      const row = field[idx[0]]![idx[1]]![idx[2]]!;
      for (let t = 0; t < n; t++) out[t]! += w * row[t]!;
    }
    return out;
  };
  const vec = [new Array<number>(n).fill(0), new Array<number>(n).fill(0), new Array<number>(n).fill(0)];
  for (const { idx, w } of corners) {
    const [i, j, k] = idx;
    for (let t = 0; t < n; t++) {
      const v = vector(grid.sphere.p50[i]![j]![k]![t]!, grid.cylinder.p50[i]![j]![k]![t]!, grid.axisDeg.p50[i]![j]![k]![t]!);
      for (let q = 0; q < 3; q++) vec[q]![t]! += w * v[q]!;
    }
  }
  const med = Array.from({ length: n }, (_, t) => refraction([vec[0]![t]!, vec[1]![t]!, vec[2]![t]!]));
  const logMAR = grid.logMAR ? blend(grid.logMAR.p50) : null;
  return {
    ages: [...a.ages],
    sphere: { p05: blend(grid.sphere.p05), p50: med.map((r) => r.sphereD), p95: blend(grid.sphere.p95) },
    cylinder: { p05: blend(grid.cylinder.p05), p50: med.map((r) => r.cylinderD), p95: blend(grid.cylinder.p95) },
    axisDeg: med.map((r) => r.axisDeg),
    logMAR,
    onset: onsetFromCurve(a.ages, med, logMAR, grid.thresholds),
    onsetRange: onsetRange(grid, p),
    clamped,
  };
}

/** Linear interpolation of a series at an age, clamped to the trajectory's ages. */
function sample(ages: number[], values: number[], age: number): number {
  const { i, w } = locate(ages, age);
  return ages.length === 1 ? values[0]! : (1 - w) * values[i]! + w * values[i + 1]!;
}

/** Median refraction at an age (ages outside the trajectory clamp to its ends). */
export function at(traj: Trajectory, ageYears: number): { sphereD: number; cylinderD: number; axisDeg: number } {
  const v = traj.ages.map((_, t) => vector(traj.sphere.p50[t]!, traj.cylinder.p50[t]!, traj.axisDeg[t]!));
  const m = [0, 1, 2].map((q) =>
    sample(
      traj.ages,
      v.map((x) => x[q]!),
      ageYears,
    ),
  );
  return refraction(m);
}

/**
 * Re-anchor a trajectory so that its median passes through `baseline` at `ageYears` (Deviation 7:
 * the predicted change since the grid's baseline age is subtracted as a power vector, and the
 * bands are shifted by the same sphere and cylinder offsets; an approximation for the bands).
 * The refraction onset is recomputed on the re-anchored median with `thresholds`, from the
 * anchor age on (the subject is described from there on). The grid's logMAR, acuity onset, and
 * draw ranges belong to the unshifted refraction, so they are dropped (null).
 */
export function reanchor(
  traj: Trajectory,
  ageYears: number,
  baseline: { sphereD: number; cylinderD: number; axisDeg: number },
  thresholds?: PredictionGrid["thresholds"],
): Trajectory {
  const now = at(traj, ageYears);
  const shift = vector(baseline.sphereD, baseline.cylinderD, baseline.axisDeg).map((x, q) => x - vector(now.sphereD, now.cylinderD, now.axisDeg)[q]!);
  if (shift.every((x) => Math.abs(x) < 1e-12) && ageYears <= traj.ages[0]!) return traj;
  const med = traj.ages.map((_, t) => {
    const v = vector(traj.sphere.p50[t]!, traj.cylinder.p50[t]!, traj.axisDeg[t]!);
    return refraction(v.map((x, q) => x + shift[q]!));
  });
  const dS = med.map((r, t) => r.sphereD - traj.sphere.p50[t]!);
  const dC = med.map((r, t) => r.cylinderD - traj.cylinder.p50[t]!);
  return {
    ...traj,
    sphere: { p05: traj.sphere.p05.map((x, t) => x + dS[t]!), p50: med.map((r) => r.sphereD), p95: traj.sphere.p95.map((x, t) => x + dS[t]!) },
    cylinder: { p05: traj.cylinder.p05.map((x, t) => Math.min(0, x + dC[t]!)), p50: med.map((r) => r.cylinderD), p95: traj.cylinder.p95.map((x, t) => Math.min(0, x + dC[t]!)) },
    axisDeg: med.map((r) => r.axisDeg),
    logMAR: null,
    onset: { refraction: onsetFromCurve(traj.ages, med, null, thresholds, ageYears).refraction, acuity: null },
    onsetRange: null,
  };
}

/** The trajectory for a profile: interpolated, then re-anchored when the anchor age is not the grid's baseline age. */
export function trajectoryFor(grid: PredictionGrid, p: PredictionProfile): Trajectory {
  const traj = interpolate(grid, p);
  if (p.anchorAgeYears === grid.baselineAgeYears) return traj;
  return reanchor(traj, p.anchorAgeYears, { sphereD: p.baselineSphereD, cylinderD: -Math.abs(p.baselineCylinderD), axisDeg: grid.baselineAxisDeg }, grid.thresholds);
}

/** A finite numeric threshold of the grid, or null. */
function threshold(thresholds: PredictionGrid["thresholds"], key: string): number | null {
  const v = thresholds?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * First age at which `value` reaches `limit` (≥, or > when strict), linearly interpolated
 * between ages; the first age when already there; null if never (eyebiomech.predict.onset).
 */
function firstCrossing(ages: readonly number[], value: readonly number[], limit: number, strict: boolean): number | null {
  const over = (v: number) => (strict ? v > limit : v >= limit);
  const i = value.findIndex(over);
  if (i < 0) return null;
  if (i === 0) return ages[0]!;
  const v0 = value[i - 1]!;
  const v1 = value[i]!;
  return ages[i - 1]! + ((limit - v0) * (ages[i]! - ages[i - 1]!)) / (v1 - v0);
}

/**
 * Onset ages of a median curve as it is drawn (straight between ages), with the criteria of spec
 * §8 and the grid's `thresholds`: refraction when |cylinder| reaches the cylinder threshold or
 * |sphere| exceeds the sphere threshold, whichever comes first; acuity when logMAR exceeds its
 * threshold. A criterion without a threshold is left out. With `fromAge`, the search starts
 * there (the curve is cut at that age, interpolated).
 */
export function onsetFromCurve(
  ages: readonly number[],
  median: readonly { sphereD: number; cylinderD: number }[],
  logMAR: readonly number[] | null,
  thresholds: PredictionGrid["thresholds"],
  fromAge?: number,
): Onsets {
  let a = [...ages];
  let s = median.map((m) => m.sphereD);
  let c = median.map((m) => m.cylinderD);
  let l = logMAR ? [...logMAR] : null;
  if (fromAge !== undefined && fromAge > a[0]!) {
    const cut = (v: number[]) => [sample(a, v, fromAge), ...v.filter((_, t) => a[t]! > fromAge)];
    [s, c] = [cut(s), cut(c)];
    if (l) l = cut(l);
    a = [Math.min(fromAge, a[a.length - 1]!), ...a.filter((x) => x > fromAge)];
  }
  const cyl = threshold(thresholds, "cylinderD");
  const sph = threshold(thresholds, "sphereD");
  const lm = threshold(thresholds, "logMAR");
  const found = [
    cyl === null ? null : firstCrossing(a, c.map(Math.abs), cyl, false),
    sph === null ? null : firstCrossing(a, s.map(Math.abs), sph, true),
  ].filter((x): x is number => x !== null);
  return {
    refraction: found.length ? Math.min(...found) : null,
    acuity: l === null || lm === null ? null : firstCrossing(a, l, lm, true),
  };
}

/** The Snellen fraction of a logMAR value (20/20 at 0). */
const snellen = (logMAR: number) => `20/${Math.round(20 * 10 ** logMAR)}`;

/** The acuity onset's label from the grid's threshold, e.g. "acuity 20/40"; "acuity" without one. */
export function thresholdLabel(thresholds: PredictionGrid["thresholds"]): string {
  const lm = threshold(thresholds, "logMAR");
  return lm === null ? "acuity" : `acuity ${snellen(lm)}`;
}

/**
 * The onset criteria of a grid in words, from its `thresholds` (spec §8: cylinder at or above
 * the cylinder threshold, sphere strictly beyond the sphere threshold, acuity worse than the
 * logMAR threshold, shown as a Snellen fraction). Thresholds the grid does not carry are left out.
 */
export function onsetCriteria(thresholds: PredictionGrid["thresholds"]): string[] {
  const d = (x: number) => x.toFixed(2);
  const out: string[] = [];
  const cyl = threshold(thresholds, "cylinderD");
  const sph = threshold(thresholds, "sphereD");
  const logMAR = threshold(thresholds, "logMAR");
  if (cyl !== null) out.push(`cylinder of ${d(cyl)} D or more`);
  if (sph !== null) out.push(`sphere beyond ±${d(sph)} D`);
  if (logMAR !== null) out.push(`acuity worse than ${snellen(logMAR)}`);
  return out;
}
