import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "../../../../../schemas/eye-parameters.schema.json";
import type { EyeParameters } from "./types";

export class SchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaVersionError";
  }
}

const SUPPORTED_MAJOR = 1;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function checkMajor(doc: unknown): void {
  if (typeof doc !== "object" || doc === null) return;
  const v = (doc as Record<string, unknown>).schemaVersion;
  if (typeof v !== "string") return;
  const major = Number(v.split(".")[0]);
  if (major !== SUPPORTED_MAJOR) {
    throw new SchemaVersionError(
      `Unsupported schemaVersion "${v}": this build supports major version ${SUPPORTED_MAJOR}`,
    );
  }
}

export function validateEyeParameters(
  doc: unknown,
): { ok: true; value: EyeParameters } | { ok: false; errors: string[] } {
  try {
    checkMajor(doc);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
  if (validateSchema(doc)) return { ok: true, value: doc as unknown as EyeParameters };
  const errors = (validateSchema.errors ?? []).map(
    (e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`,
  );
  return { ok: false, errors };
}
