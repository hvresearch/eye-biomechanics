import { Ajv2020 } from "ajv/dist/2020.js";
import deformationSchema from "../../../../../schemas/deformation.schema.json";
import eyeSchema from "../../../../../schemas/eye-parameters.schema.json";
import type { EyeParameters, Provenance } from "./types";
import { validateEyeParameters } from "./validate";

/**
 * The displacement sidecar `eyebiomech fem` writes next to its EyeParameters result
 * (schemas/deformation.schema.json): the outer surface of the corneoscleral shell in the FEM
 * frame (origin at the globe center, x temporal, y superior, z posterior; mm) with the
 * displacement of the loaded state relative to the IOP-only state.
 */
export interface DeformationDocument {
  schemaVersion: string;
  id: string;
  provenance: Provenance;
  frame: string;
  elastic: true;
  /** z of the undeformed corneal apex in the FEM frame (the optics origin), mm. */
  apexZMm: number;
  loads: Array<Record<string, unknown>>;
  vertices: Array<[number, number, number]>;
  triangles: Array<[number, number, number]>;
  /** Loaded minus IOP-only, relative to the lens (the spur ring's lateral shift and tilt removed; M5). */
  displacementMm: Array<[number, number, number]>;
  /** The same difference before the lens-relative correction (M5; absent in M4 files). */
  rawDisplacementMm?: Array<[number, number, number]>;
  /** Scleral radial height change in Zernike polynomials on a stereographic projection (M5). */
  scleralMaps?: { projection: string; normRadiusMm: number; maxOrder: number; coeffsMicrons: number[]; rmsResidualUm: number; samples?: number };
  region: Array<"cornea" | "limbus" | "sclera">;
  reference: EyeParameters;
}

const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(eyeSchema);
const validateSchema = ajv.compile(deformationSchema);
const SUPPORTED_MAJOR = 1;

export type DeformationValidation = { ok: true; value: DeformationDocument } | { ok: false; errors: string[] };

/** Validate a sidecar: its own schema (major version 1), then the embedded reference document. */
export function validateDeformation(doc: unknown): DeformationValidation {
  const v = (doc as { schemaVersion?: unknown } | null)?.schemaVersion;
  const m = typeof v === "string" ? /^(\d+)\.\d+\.\d+$/.exec(v) : null;
  if (m !== null && Number(m[1]) !== SUPPORTED_MAJOR) {
    return { ok: false, errors: [`Unsupported deformation schemaVersion "${String(v)}": this build supports major version ${SUPPORTED_MAJOR}`] };
  }
  if (!validateSchema(doc)) {
    return {
      ok: false,
      errors: (validateSchema.errors ?? []).map((e) => {
        const missing = e.keyword === "required" && typeof e.params.missingProperty === "string" ? ` '${e.params.missingProperty}'` : "";
        return `${e.instancePath || "(root)"} ${e.message ?? "invalid"}${missing}`;
      }),
    };
  }
  const value = doc as unknown as DeformationDocument;
  const ref = validateEyeParameters(value.reference);
  if (!ref.ok) return { ok: false, errors: ref.errors.map((e) => `reference: ${e}`) };
  const n = value.vertices.length;
  if (value.displacementMm.length !== n || value.region.length !== n) {
    return { ok: false, errors: ["vertices, displacementMm, and region must have the same length"] };
  }
  if (value.triangles.some((t) => t.some((i) => i >= n))) return { ok: false, errors: ["a triangle refers to a missing vertex"] };
  return { ok: true, value };
}
