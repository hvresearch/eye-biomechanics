import { assertSupported, validateDeformation, validateEyeParameters, type EyeParameters } from "@eye/eye-model";

/** A document that cannot be shown; the message names the version or the first schema problem. */
export class LoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoadError";
  }
}

/**
 * The outer-surface displacement field of a result, ready for drawing: positions and
 * displacements in the FEM frame (origin at the globe center, x temporal, y superior, z
 * posterior; mm), magnitudes in µm.
 */
export interface Deformation {
  id: string;
  vertices: Float32Array;
  triangles: Uint32Array;
  displacementMm: Float32Array;
  magnitudeUm: Float32Array;
  maxUm: number;
  /** z of the undeformed corneal apex in the FEM frame, mm. */
  apexZMm: number;
  region: Uint8Array;
  reference: EyeParameters;
  loads: unknown[];
}

/** Validate an EyeParameters document from a result or a file (version first, then schema). */
export function parseEyeDocument(raw: unknown): EyeParameters {
  const v = validateEyeParameters(raw);
  if (!v.ok) throw new LoadError(v.kind === "version" ? v.errors[0]! : `Invalid EyeParameters: ${v.errors[0]}`);
  try {
    assertSupported(v.value);
  } catch (e) {
    throw new LoadError(e instanceof Error ? e.message : String(e));
  }
  return v.value;
}

const REGIONS = ["cornea", "limbus", "sclera"] as const;

/** Validate a deformation sidecar and pack it into typed arrays. */
export function parseDeformation(raw: unknown): Deformation {
  const v = validateDeformation(raw);
  if (!v.ok) throw new LoadError(`Invalid deformation file: ${v.errors[0]}`);
  const d = v.value;
  const n = d.vertices.length;
  const vertices = new Float32Array(n * 3);
  const displacementMm = new Float32Array(n * 3);
  const magnitudeUm = new Float32Array(n);
  let maxUm = 0;
  for (let i = 0; i < n; i++) {
    const p = d.vertices[i]!;
    const u = d.displacementMm[i]!;
    for (let k = 0; k < 3; k++) {
      vertices[3 * i + k] = p[k]!;
      displacementMm[3 * i + k] = u[k]!;
    }
    magnitudeUm[i] = Math.hypot(u[0], u[1], u[2]) * 1000;
    maxUm = Math.max(maxUm, magnitudeUm[i]!);
  }
  return {
    id: d.id,
    vertices,
    triangles: Uint32Array.from(d.triangles.flat()),
    displacementMm,
    magnitudeUm,
    maxUm,
    apexZMm: d.apexZMm,
    region: Uint8Array.from(d.region.map((r) => REGIONS.indexOf(r))),
    reference: d.reference,
    loads: d.loads,
  };
}

/** Check that a sidecar was written for this document (their ids agree); returns it. */
export function pairDeformation(eye: EyeParameters, deformation: Deformation | null): Deformation | null {
  if (deformation !== null && deformation.id !== eye.id) {
    throw new LoadError(`The deformation file belongs to "${deformation.id}", not to the EyeParameters document "${eye.id}"`);
  }
  return deformation;
}

async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    throw new LoadError(`${file.name} is not valid JSON`);
  }
}

/**
 * An EyeParameters file and, optionally, its sidecar from one file selection: the sidecar is
 * the file whose name ends in `.deformation.json`, the document the other one.
 */
export async function parseFiles(files: readonly File[]): Promise<{ eye: EyeParameters; deformation: Deformation | null }> {
  const side = files.find((f) => f.name.endsWith(".deformation.json"));
  const eyeFile = files.find((f) => f !== side);
  if (!eyeFile) throw new LoadError("Choose an EyeParameters file (.eye.json), optionally with its .deformation.json");
  const eye = parseEyeDocument(await readJson(eyeFile));
  const deformation = pairDeformation(eye, side ? parseDeformation(await readJson(side)) : null);
  return { eye, deformation };
}
