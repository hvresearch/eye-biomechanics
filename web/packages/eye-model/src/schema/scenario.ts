import { Ajv2020 } from "ajv/dist/2020.js";
import eyeSchema from "../../../../../schemas/eye-parameters.schema.json";
import scenarioSchema from "../../../../../schemas/scenario.schema.json";
import type { EyeParameters } from "./types";
import { validateEyeParameters } from "./validate";

/** A spectacle lens as a scenario stores it (structurally the optics package's ClinicalLens). */
export interface ScenarioLens {
  sphereD: number;
  cylinderD: number;
  axisDeg: number;
  vertexMm: number;
  baseCurveD: number;
  index: number;
  centerThicknessMm: number;
}

/** The scene of a scenario; `targetDistanceM` is null for a target at infinity (JSON has no Infinity). */
export interface ScenarioScene {
  targetDistanceM: number | null;
  targetDirectionDeg: { x: number; y: number };
  luminanceCdM2: number;
  ageYears: number;
  ipdMm: number;
  preset: string;
}

/** What a keyframe may set at its time; unset fields hold the previous keyframe's value. */
export interface ScenarioKeyframe {
  timeS: number;
  scene?: Partial<Pick<ScenarioScene, "targetDistanceM" | "targetDirectionDeg" | "luminanceCdM2" | "ageYears">>;
  corrected?: boolean;
}

/** A saved viewer state with a timeline (spec §6.5; schemas/scenario.schema.json). */
export interface Scenario {
  schemaVersion: string;
  name: string;
  description: string;
  scene: ScenarioScene;
  eyes: { left: EyeParameters; right: EyeParameters };
  prescription: { left: ScenarioLens; right: ScenarioLens } | null;
  corrected: boolean;
  result: { id: string } | null;
  timeline: ScenarioKeyframe[];
}

export type ScenarioValidation = { ok: true; value: Scenario } | { ok: false; kind: "version" | "schema"; errors: string[] };

const SUPPORTED_MAJOR = 1;
const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(eyeSchema);
const validateSchema = ajv.compile(scenarioSchema);

/**
 * Validate a scenario: its major version, the schema (with the referenced EyeParameters
 * schema), each embedded eye's own major version, and keyframe times in non-decreasing order.
 * Errors name the offending key path.
 */
export function validateScenario(doc: unknown): ScenarioValidation {
  const v = (doc as { schemaVersion?: unknown } | null)?.schemaVersion;
  const m = typeof v === "string" ? /^(\d+)\.\d+\.\d+$/.exec(v) : null;
  if (m !== null && Number(m[1]) !== SUPPORTED_MAJOR) {
    return { ok: false, kind: "version", errors: [`Unsupported scenario schemaVersion "${String(v)}": this build supports major version ${SUPPORTED_MAJOR}`] };
  }
  if (!validateSchema(doc)) {
    const errors = (validateSchema.errors ?? []).map((e) => {
      const extra = e.keyword === "additionalProperties" && typeof e.params.additionalProperty === "string" ? ` '${e.params.additionalProperty}'` : "";
      return `${e.instancePath || "(root)"} ${e.message ?? "invalid"}${extra}`;
    });
    return { ok: false, kind: "schema", errors };
  }
  const sc = doc as unknown as Scenario;
  for (const side of ["left", "right"] as const) {
    const r = validateEyeParameters(sc.eyes[side]);
    if (!r.ok) return { ok: false, kind: r.kind, errors: r.errors.map((e) => `/eyes/${side}: ${e}`) };
  }
  const late = sc.timeline.findIndex((k, i) => i > 0 && k.timeS < sc.timeline[i - 1]!.timeS);
  if (late > 0) {
    return { ok: false, kind: "schema", errors: [`/timeline/${late} timeS ${sc.timeline[late]!.timeS} is earlier than the previous keyframe's`] };
  }
  return { ok: true, value: sc };
}
