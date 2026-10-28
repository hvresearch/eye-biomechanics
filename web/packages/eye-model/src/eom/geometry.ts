import table from "../../../../../data/eom/geometry-default.json";
import type { EyeParameters, MuscleGeometry } from "../schema/types";
import { cross, normalize, scale, add, type Vec3 } from "../math/vec";

/** Canonical muscle order used by every per-muscle array (EyeState, tables, UI). */
export const MUSCLE_NAMES = [
  "lateralRectus",
  "medialRectus",
  "superiorRectus",
  "inferiorRectus",
  "superiorOblique",
  "inferiorOblique",
] as const;
export type MuscleName = (typeof MUSCLE_NAMES)[number];

interface RawMuscle {
  name: string;
  antagonist: string;
  originMm: number[];
  pulleyMm: number[] | null;
  obliqueConstruction?: { elevationDeg: number };
  insertion: { meridianDeg: number; arcFromLimbusMm: number; alt: number | null; widthMm: number; citation: string; verified: boolean };
  tendon: { stiffnessNPerMm: number; slackLengthMm: number; citation: string; verified: boolean };
  muscleLengthMm: number | null;
  arcOfContactMm: number[] | null;
}

/** Shape of data/eom/geometry-default.json (see data/eom/README.md). */
export interface EomTable {
  name: string;
  frame: string;
  verified: boolean;
  citation: string;
  globe: { radiusMm: number; limbusRadiusMm: number; citation: string; verified: boolean };
  obliqueOriginConstruction: { horizontalDeg: number; lengthMm: number; citation: string; verified: boolean };
  muscles: RawMuscle[];
}

export const EOM_TABLE: EomTable = table;
export const GLOBE_RADIUS_MM = EOM_TABLE.globe.radiusMm;

/**
 * One muscle in the eye's local frame: origin at the globe center (taken as the center of
 * rotation), x temporal, y superior, z posterior, mm. The insertion is given in primary
 * position; gaze rotates it.
 */
export interface EomMuscle {
  name: MuscleName;
  antagonist: MuscleName;
  originMm: Vec3;
  pulleyMm: Vec3 | null;
  insertionMm: Vec3;
  insertionWidthMm: number;
  tendon: { stiffnessNPerMm: number; slackLengthMm: number };
}

const DEG = Math.PI / 180;

function isMuscleName(name: string): name is MuscleName {
  return (MUSCLE_NAMES as readonly string[]).includes(name);
}

function vec3(a: readonly number[], what: string): Vec3 {
  const [x, y, z] = a;
  if (a.length !== 3 || x === undefined || y === undefined || z === undefined) throw new Error(`${what} must have 3 components`);
  return [x, y, z];
}

/**
 * Insertion center on the globe from its meridian (0 temporal, 90 superior, seen from the
 * front) and its arc distance behind the limbus (data/eom/geometry-default.json
 * `insertionConvention`).
 */
export function insertionPoint(
  meridianDeg: number,
  arcFromLimbusMm: number,
  globeRadiusMm = GLOBE_RADIUS_MM,
  limbusRadiusMm = EOM_TABLE.globe.limbusRadiusMm,
): Vec3 {
  const theta = Math.asin(limbusRadiusMm / globeRadiusMm) + arcFromLimbusMm / globeRadiusMm;
  const phi = meridianDeg * DEG;
  const s = Math.sin(theta);
  return [globeRadiusMm * s * Math.cos(phi), globeRadiusMm * s * Math.sin(phi), -globeRadiusMm * Math.cos(theta)];
}

/**
 * The construction that placed the oblique origins: the muscle leaves the globe tangentially
 * at the point of the great circle through the insertion whose tangent is the direction u
 * (horizontal projection at `horizontalDeg` to the anterior line of sight, toward nasal;
 * elevation `elevationDeg`), and the origin lies `lengthMm` further along u.
 */
export function obliqueOrigin(
  insertionMm: Vec3,
  horizontalDeg: number,
  elevationDeg: number,
  lengthMm: number,
): { originMm: Vec3; tangentMm: Vec3 } {
  const h = horizontalDeg * DEG;
  const e = elevationDeg * DEG;
  const u: Vec3 = [-Math.sin(h) * Math.cos(e), Math.sin(e), -Math.cos(h) * Math.cos(e)];
  const n = normalize(cross(insertionMm, u));
  const radius = Math.hypot(insertionMm[0], insertionMm[1], insertionMm[2]);
  const tangentMm = scale(cross(u, n), radius);
  return { originMm: add(tangentMm, scale(u, lengthMm)), tangentMm };
}

function rawByName(name: MuscleName): RawMuscle {
  const raw = EOM_TABLE.muscles.find((m) => m.name === name);
  if (!raw) throw new Error(`EOM table has no entry for ${name}`);
  return raw;
}

function fromRaw(raw: RawMuscle, arcFromLimbusMm = raw.insertion.arcFromLimbusMm): EomMuscle {
  if (!isMuscleName(raw.name)) throw new Error(`Unknown muscle "${raw.name}"`);
  if (!isMuscleName(raw.antagonist)) throw new Error(`Unknown antagonist "${raw.antagonist}" for ${raw.name}`);
  return {
    name: raw.name,
    antagonist: raw.antagonist,
    originMm: vec3(raw.originMm, `${raw.name}.originMm`),
    pulleyMm: raw.pulleyMm ? vec3(raw.pulleyMm, `${raw.name}.pulleyMm`) : null,
    insertionMm: insertionPoint(raw.insertion.meridianDeg, arcFromLimbusMm),
    insertionWidthMm: raw.insertion.widthMm,
    tendon: { stiffnessNPerMm: raw.tendon.stiffnessNPerMm, slackLengthMm: raw.tendon.slackLengthMm },
  };
}

/** The default table's six muscles in `MUSCLE_NAMES` order. */
export function defaultMuscles(): EomMuscle[] {
  return MUSCLE_NAMES.map((name) => fromRaw(rawByName(name)));
}

/**
 * Muscles for a document: its `extraocularMuscles` when present (origin, pulley, width,
 * tendon, and the insertion's arc from the limbus on the table's meridian for that muscle),
 * otherwise the default table. Returned in `MUSCLE_NAMES` order.
 */
export function musclesFromDocument(params: EyeParameters): EomMuscle[] {
  const doc = params.extraocularMuscles;
  if (!doc) return defaultMuscles();
  for (const m of doc) if (!isMuscleName(m.name)) throw new Error(`Unknown extraocular muscle "${m.name}"`);
  return MUSCLE_NAMES.map((name) => {
    const m = doc.find((d) => d.name === name);
    if (!m) throw new Error(`extraocularMuscles is missing ${name}`);
    const base = fromRaw(rawByName(name), m.insertionDistFromLimbusMm);
    return {
      ...base,
      originMm: vec3(m.originMm, `${name}.originMm`),
      pulleyMm: m.pulleyMm ? vec3(m.pulleyMm, `${name}.pulleyMm`) : null,
      insertionWidthMm: m.insertionWidthMm,
      tendon: { ...m.tendon },
    };
  });
}

/** The schema shape of the default table, for attaching to a preset document. */
export function toDocumentMuscles(): MuscleGeometry[] {
  return MUSCLE_NAMES.map((name) => {
    const raw = rawByName(name);
    const m = fromRaw(raw);
    return {
      name,
      originMm: [m.originMm[0], m.originMm[1], m.originMm[2]],
      pulleyMm: m.pulleyMm ? [m.pulleyMm[0], m.pulleyMm[1], m.pulleyMm[2]] : null,
      insertionDistFromLimbusMm: raw.insertion.arcFromLimbusMm,
      insertionWidthMm: m.insertionWidthMm,
      tendon: { ...m.tendon },
    };
  });
}
