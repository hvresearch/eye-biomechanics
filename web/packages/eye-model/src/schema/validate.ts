import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "../../../../../schemas/eye-parameters.schema.json";
import type { EyeParameters } from "./types";

const SUPPORTED_MAJOR = 1;
const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile(schema);

const VERSION_RE = /^(\d+)\.\d+\.\d+$/;

/** Returns a message if the document declares a well-formed but unsupported major version. */
function unsupportedMajor(doc: unknown): string | null {
  if (typeof doc !== "object" || doc === null) return null;
  const v = (doc as Record<string, unknown>).schemaVersion;
  if (typeof v !== "string") return null;
  const m = VERSION_RE.exec(v);
  // Malformed versions fall through to the schema's pattern check.
  if (m === null || Number(m[1]) === SUPPORTED_MAJOR) return null;
  return `Unsupported schemaVersion "${v}": this build supports major version ${SUPPORTED_MAJOR}`;
}

export type ValidationResult =
  | { ok: true; value: EyeParameters }
  | { ok: false; kind: "version" | "schema"; errors: string[] };

export function validateEyeParameters(doc: unknown): ValidationResult {
  const versionError = unsupportedMajor(doc);
  if (versionError !== null) return { ok: false, kind: "version", errors: [versionError] };
  if (validateSchema(doc)) return { ok: true, value: doc as unknown as EyeParameters };
  const errors = (validateSchema.errors ?? []).map((e) => {
    const extra =
      e.keyword === "additionalProperties" && typeof e.params.additionalProperty === "string"
        ? ` '${e.params.additionalProperty}'`
        : "";
    return `${e.instancePath || "(root)"} ${e.message ?? "invalid"}${extra}`;
  });
  return { ok: false, kind: "schema", errors };
}
