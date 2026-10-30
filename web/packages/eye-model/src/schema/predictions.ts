import { Ajv2020 } from "ajv/dist/2020.js";
import predictionsSchema from "../../../../../schemas/predictions.schema.json";

type Grid4 = number[][][][];
type Grid3 = Array<Array<Array<number | null>>>;
interface Bands {
  p05: Grid4;
  p50: Grid4;
  p95: Grid4;
}
interface OnsetBands {
  p05: Grid3;
  p50: Grid3;
  p95: Grid3;
}

/**
 * The prediction grid `eyebiomech grid` writes (schemas/predictions.schema.json): remodeled
 * trajectories of sphere, minus cylinder, and axis from a baseline refraction at the first age,
 * nested over (nearHours, baselineSphereD, baselineCylinderD, ages), and onset ages over the
 * first three axes (spec §8, §12).
 */
export interface PredictionsDocument {
  schemaVersion: string;
  id: string;
  provenance: Record<string, unknown>;
  remodeled: true;
  baselineAgeYears: number;
  baselineAxisDeg: number;
  axes: { ages: number[]; nearHours: number[]; baselineSphereD: number[]; baselineCylinderD: number[] };
  parameters?: string[];
  draws?: number;
  sphere: Bands;
  cylinder: Bands;
  axisDeg: { p50: Grid4 };
  logMAR?: { p50: Grid4 };
  onset: { refraction: OnsetBands; acuity: OnsetBands };
  thresholds?: Record<string, unknown>;
  /** Since 1.1.0: the calibration's stance and finding in words, shown by the timeline. */
  summary?: { stance: string; finding: string };
  citation?: string;
  date?: string;
}

const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile(predictionsSchema);
const SUPPORTED_MAJOR = 1;

export type PredictionsValidation = { ok: true; value: PredictionsDocument } | { ok: false; errors: string[] };

/** The first place where nested arrays `x` differ from `shape` (every row is checked), or null. */
function shapeError(x: unknown, shape: readonly number[], path: string): string | null {
  if (shape.length === 0) return null;
  if (!Array.isArray(x)) return `${path} is not an array`;
  if (x.length !== shape[0]) return `${path} has length ${x.length}, expected ${shape[0]}`;
  for (let i = 0; i < x.length; i++) {
    const e = shapeError(x[i], shape.slice(1), `${path}/${i}`);
    if (e !== null) return e;
  }
  return null;
}

const QUANTILES = ["p05", "p50", "p95"] as const;

/** Validate a prediction grid: its schema (major version 1) and the shape of every row. */
export function validatePredictions(doc: unknown): PredictionsValidation {
  const v = (doc as { schemaVersion?: unknown } | null)?.schemaVersion;
  const m = typeof v === "string" ? /^(\d+)\.\d+\.\d+$/.exec(v) : null;
  if (m !== null && Number(m[1]) !== SUPPORTED_MAJOR) {
    return { ok: false, errors: [`Unsupported predictions schemaVersion "${String(v)}": this build supports major version ${SUPPORTED_MAJOR}`] };
  }
  if (!validateSchema(doc)) {
    return { ok: false, errors: (validateSchema.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`) };
  }
  const value = doc as unknown as PredictionsDocument;
  const a = value.axes;
  const shape = [a.nearHours.length, a.baselineSphereD.length, a.baselineCylinderD.length];
  const full = [...shape, a.ages.length];
  const checks: Array<[string, unknown, number[]]> = [];
  for (const [name, bands] of [["sphere", value.sphere], ["cylinder", value.cylinder]] as const) {
    for (const q of QUANTILES) checks.push([`/${name}/${q}`, bands[q], full]);
  }
  checks.push(["/axisDeg/p50", value.axisDeg.p50, full]);
  if (value.logMAR) checks.push(["/logMAR/p50", value.logMAR.p50, full]);
  for (const name of ["refraction", "acuity"] as const) {
    for (const q of QUANTILES) checks.push([`/onset/${name}/${q}`, value.onset[name][q], shape]);
  }
  const errors = checks.map(([path, x, sh]) => shapeError(x, sh, path)).filter((e): e is string => e !== null);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
