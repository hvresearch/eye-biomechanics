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
  citation?: string;
  date?: string;
}

const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile(predictionsSchema);
const SUPPORTED_MAJOR = 1;

export type PredictionsValidation = { ok: true; value: PredictionsDocument } | { ok: false; errors: string[] };

function dims(x: unknown, depth: number): number[] {
  const out: number[] = [];
  let v = x;
  for (let i = 0; i < depth; i++) {
    if (!Array.isArray(v)) return out;
    out.push(v.length);
    v = v[0];
  }
  return out;
}

/** Validate a prediction grid: its schema (major version 1) and the array shapes. */
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
  const full = [...shape, a.ages.length].join(",");
  const errors: string[] = [];
  for (const [name, bands] of [["sphere", value.sphere], ["cylinder", value.cylinder]] as const) {
    for (const q of ["p05", "p50", "p95"] as const) if (dims(bands[q], 4).join(",") !== full) errors.push(`/${name}/${q} has the wrong shape`);
  }
  if (dims(value.axisDeg.p50, 4).join(",") !== full) errors.push("/axisDeg/p50 has the wrong shape");
  for (const name of ["refraction", "acuity"] as const) {
    for (const q of ["p05", "p50", "p95"] as const) if (dims(value.onset[name][q], 3).join(",") !== shape.join(",")) errors.push(`/onset/${name}/${q} has the wrong shape`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
