import navarro1985 from "../../../../../data/schematic-eyes/navarro-1985.json";
import zapataDiaz2019 from "../../../../../data/schematic-eyes/zapata-diaz-2019.json";
import type { EyeParameters, Surface } from "../schema/types";
import { validateEyeParameters } from "../schema/validate";

export const PRESET_NAMES = ["navarro-1985", "zapata-diaz-2019"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

/** Shape of a `data/schematic-eyes/*.json` file (see data/schematic-eyes/README.md). */
export interface SchematicEyeTable {
  name: string;
  label: string;
  citation: string;
  doi: string;
  transcribed: boolean;
  verified: boolean;
  verifiedDate: string | null;
  wavelengthNm?: number;
  referenceAgeYears?: number;
  relaxed?: Surface[];
  retina?: { radiusMm: number; conic: number };
  axialLengthMm?: number;
  pupil?: { model: string; params: Record<string, unknown> };
  accommodation?: {
    form: string;
    coefficients: Record<string, number>;
    unverified?: string[];
  };
  aging?: { form: string; coefficients: Record<string, number> };
}

export interface LensAccommodationModel {
  form: string;
  coefficients: Record<string, number>;
  unverified?: string[];
}

export class PresetNotTranscribedError extends Error {
  constructor(public readonly preset: string, note: string) {
    super(`Preset "${preset}" has not been transcribed from its source paper: ${note}`);
    this.name = "PresetNotTranscribedError";
  }
}

const TABLES: Record<PresetName, SchematicEyeTable & { transcriptionNote?: string }> = {
  "navarro-1985": navarro1985 as SchematicEyeTable,
  "zapata-diaz-2019": zapataDiaz2019 as SchematicEyeTable & { transcriptionNote?: string },
};

export function presetTable(name: PresetName): SchematicEyeTable {
  return TABLES[name];
}

/** Map a transcribed table to a validated EyeParameters document for the relaxed eye. */
export function loadPreset(name: PresetName): EyeParameters {
  const table = TABLES[name];
  if (!table.transcribed) {
    throw new PresetNotTranscribedError(name, table.transcriptionNote ?? "stub file");
  }
  if (
    table.relaxed === undefined ||
    table.retina === undefined ||
    table.axialLengthMm === undefined ||
    table.pupil === undefined ||
    table.referenceAgeYears === undefined
  ) {
    throw new Error(`Preset "${name}" is marked transcribed but is missing required fields`);
  }
  const doc: EyeParameters = {
    schemaVersion: "1.0.0",
    id: `${name}-relaxed`,
    label: table.label,
    provenance: {
      source: `data/schematic-eyes/${name}.json`,
      citation: table.citation,
      generatedBy: "eye-model loadPreset",
      gitHash: "",
      date: table.verifiedDate ?? "",
      verified: table.verified,
    },
    surfaces: clone(table.relaxed),
    pupil: clone(table.pupil),
    axialLengthMm: table.axialLengthMm,
    retina: { ...table.retina },
    age: table.referenceAgeYears,
    interpupillaryDistanceMm: DEFAULT_IPD_MM,
  };
  if (table.accommodation !== undefined) {
    doc.lensAccommodationModel = clone(table.accommodation);
  }
  const result = validateEyeParameters(doc);
  if (!result.ok) {
    throw new Error(`Preset "${name}" does not validate: ${result.errors.join("; ")}`);
  }
  return result.value;
}

/** Deep copy of plain JSON data (the tables are JSON, so no functions or cycles). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Spec §4.4 default interpupillary distance (63 mm); a scene-level default, not a per-eye constant. */
const DEFAULT_IPD_MM = 63;
