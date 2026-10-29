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

export interface Trajectory {
  ages: number[];
  sphere: Bands;
  cylinder: Bands;
  axisDeg: number[];
  onset: { refraction: number | null; acuity: number | null };
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
 * Trilinear interpolation over (nearHours, baselineSphereD, baselineCylinderD) at every age.
 * Bands interpolate linearly; the median trajectory interpolates as power vectors (so the axis
 * blends without wrapping); onsets take the nearest grid node. Inputs outside the grid clamp
 * and are reported in `clamped`.
 */
export function interpolate(grid: PredictionGrid, p: Omit<PredictionProfile, "anchorAgeYears">): Trajectory {
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
  const nearest = corners.reduce((best, c) => (c.w > best.w ? c : best), corners[0]!);
  const [ni, nj, nk] = nearest.idx;
  return {
    ages: [...a.ages],
    sphere: { p05: blend(grid.sphere.p05), p50: med.map((r) => r.sphereD), p95: blend(grid.sphere.p95) },
    cylinder: { p05: blend(grid.cylinder.p05), p50: med.map((r) => r.cylinderD), p95: blend(grid.cylinder.p95) },
    axisDeg: med.map((r) => r.axisDeg),
    onset: {
      refraction: grid.onset.refraction.p50[ni]![nj]![nk]! ?? null,
      acuity: grid.onset.acuity.p50[ni]![nj]![nk]! ?? null,
    },
    clamped: loc.filter(([, l]) => l.clamped).map(([name]) => name),
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
 * Onset ages before the anchor age are dropped (the subject is described from there on).
 */
export function reanchor(traj: Trajectory, ageYears: number, baseline: { sphereD: number; cylinderD: number; axisDeg: number }): Trajectory {
  const now = at(traj, ageYears);
  const shift = vector(baseline.sphereD, baseline.cylinderD, baseline.axisDeg).map((x, q) => x - vector(now.sphereD, now.cylinderD, now.axisDeg)[q]!);
  if (shift.every((x) => Math.abs(x) < 1e-12)) return traj;
  const med = traj.ages.map((_, t) => {
    const v = vector(traj.sphere.p50[t]!, traj.cylinder.p50[t]!, traj.axisDeg[t]!);
    return refraction(v.map((x, q) => x + shift[q]!));
  });
  const dS = med.map((r, t) => r.sphereD - traj.sphere.p50[t]!);
  const dC = med.map((r, t) => r.cylinderD - traj.cylinder.p50[t]!);
  const keep = (x: number | null) => (x === null || x < ageYears ? null : x);
  return {
    ...traj,
    sphere: { p05: traj.sphere.p05.map((x, t) => x + dS[t]!), p50: med.map((r) => r.sphereD), p95: traj.sphere.p95.map((x, t) => x + dS[t]!) },
    cylinder: { p05: traj.cylinder.p05.map((x, t) => Math.min(0, x + dC[t]!)), p50: med.map((r) => r.cylinderD), p95: traj.cylinder.p95.map((x, t) => Math.min(0, x + dC[t]!)) },
    axisDeg: med.map((r) => r.axisDeg),
    onset: { refraction: keep(traj.onset.refraction), acuity: keep(traj.onset.acuity) },
  };
}

/** The trajectory for a profile: interpolated, then re-anchored when the anchor age is not the grid's baseline age. */
export function trajectoryFor(grid: PredictionGrid, p: PredictionProfile): Trajectory {
  const traj = interpolate(grid, p);
  if (p.anchorAgeYears === grid.baselineAgeYears) return traj;
  return reanchor(traj, p.anchorAgeYears, { sphereD: p.baselineSphereD, cylinderD: -Math.abs(p.baselineCylinderD), axisDeg: grid.baselineAxisDeg });
}

/**
 * The onset criteria of a grid in words, from its `thresholds` (spec §8: cylinder at or above
 * the cylinder threshold, sphere strictly beyond the sphere threshold, acuity worse than the
 * logMAR threshold, shown as a Snellen fraction). Thresholds the grid does not carry are left out.
 */
export function onsetCriteria(thresholds: Record<string, unknown> | undefined): string[] {
  const num = (key: string): number | null => {
    const v = thresholds?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const d = (x: number) => x.toFixed(2);
  const out: string[] = [];
  const cyl = num("cylinderD");
  const sph = num("sphereD");
  const logMAR = num("logMAR");
  if (cyl !== null) out.push(`cylinder of ${d(cyl)} D or more`);
  if (sph !== null) out.push(`sphere beyond ±${d(sph)} D`);
  if (logMAR !== null) out.push(`acuity worse than 20/${Math.round(20 * 10 ** logMAR)}`);
  return out;
}
