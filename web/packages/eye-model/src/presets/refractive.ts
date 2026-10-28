import type { Surface } from "@eye/optics";
import table from "../../../../../data/presets/refractive-errors.json";
import { SURFACE_NAMES } from "../accommodation/lens";
import { buildSurfacesAt } from "../build/surfaces";
import { localAxisDeg, type Side } from "../optics/clinical";
import type { EyeParameters, Surface as SchemaSurface } from "../schema/types";
import { validateEyeParameters } from "../schema/validate";

/** Paraxial far point (clinical sign, D) of built surfaces in one meridian (degrees, local frame); injected so eye-model does not call optics. */
export type FarPointFn = (surfaces: Surface[], meridianDeg?: number) => number;

export type Mechanism = "none" | "axial" | "corneal" | "lenticular";

export interface RefractionSpec {
  mechanism: Mechanism;
  /** Change of refraction from the base eye, minus cylinder, axis TABO (right eye). */
  sphereD: number;
  cylinderD: number;
  axisDegTabo: number;
  ageYears?: number;
}

export interface RefractivePreset extends RefractionSpec {
  name: string;
  label: string;
}

export const REFRACTIVE_PRESETS: readonly RefractivePreset[] = table.presets as RefractivePreset[];
export const REFRACTIVE_PRESET_NAMES = REFRACTIVE_PRESETS.map((p) => p.name);
export type RefractivePresetName = (typeof table.presets)[number]["name"];

/** Search half-widths for the solvers, mm (numerical: generous brackets around the base value). */
const AXIAL_BRACKET_MM = 6;
const RADIUS_BRACKET_MM = 3;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Bisection for f(x) = target on [lo, hi], f monotone (either direction). */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
  const flo = f(lo) - target;
  const fhi = f(hi) - target;
  if (flo * fhi > 0) throw new RangeError(`The preset solver could not bracket ${target} D`);
  let a = lo;
  let b = hi;
  for (let i = 0; i < 100 && b - a > 1e-12; i++) {
    const m = (a + b) / 2;
    if ((f(m) - target) * flo > 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

function surfaceIndex(doc: EyeParameters, name: string): number {
  const i = doc.surfaces.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`EyeParameters "${doc.id}" has no surface ${name}`);
  return i;
}

/** The surface as a toric with both sections of the given radii (conics from the base surface). */
function toric(s: SchemaSurface, axisDeg: number, rxMm: number, ryMm: number): SchemaSurface {
  const { radiusMm: _r, conic, conicX, conicY, type: _t, ...rest } = s;
  const k = conic ?? 0;
  return { ...rest, type: "toric", rxMm, ryMm, axisDeg, conicX: conicX ?? k, conicY: conicY ?? k };
}

/** Base radius of a conic surface (presets reshape conic surfaces only). */
function radiusOf(s: SchemaSurface): number {
  if (s.type !== "conic" || s.radiusMm === undefined) throw new Error(`Surface ${s.name} must be conic to apply a preset`);
  return s.radiusMm;
}

/**
 * The base eye with one mechanism changed so its paraxial refraction moves by the given
 * sphere and cylinder (spec §4.1): axial → axial length; corneal → anterior cornea; lenticular
 * → anterior lens surface (always toric). With cylinder the surface becomes toric: its section
 * along the local axis is solved for the sphere change and the perpendicular section for
 * sphere + cylinder.
 */
export function applyRefraction(base: EyeParameters, spec: RefractionSpec, farPointOf: FarPointFn, side: Side = "right"): EyeParameters {
  const doc = clone(base);
  const far0 = (meridianDeg = 0) => farPointOf(buildSurfacesAt(base, 0), meridianDeg);
  const axis = localAxisDeg(spec.axisDegTabo, side);
  if (spec.mechanism === "axial") {
    if (spec.cylinderD !== 0) throw new Error("An axial preset cannot carry cylinder");
    const target = far0() + spec.sphereD;
    doc.axialLengthMm = solve(
      (L) => farPointOf(buildSurfacesAt({ ...doc, axialLengthMm: L }, 0)),
      target,
      base.axialLengthMm - AXIAL_BRACKET_MM,
      base.axialLengthMm + AXIAL_BRACKET_MM,
    );
  } else if (spec.mechanism === "corneal" || spec.mechanism === "lenticular") {
    const name = spec.mechanism === "corneal" ? SURFACE_NAMES.corneaAnterior : SURFACE_NAMES.lensAnterior;
    const i = surfaceIndex(doc, name);
    const s0 = doc.surfaces[i]!;
    const r0 = radiusOf(s0);
    const sectionRadius = (meridianDeg: number, change: number) => {
      const target = far0(meridianDeg) + change;
      const at = (r: number) => {
        const trial = clone(doc);
        trial.surfaces[i] = toric(s0, axis, r, r);
        return farPointOf(buildSurfacesAt(trial, 0), meridianDeg);
      };
      return change === 0 ? r0 : solve(at, target, r0 - RADIUS_BRACKET_MM, r0 + RADIUS_BRACKET_MM);
    };
    if (spec.cylinderD === 0 && spec.mechanism === "corneal") {
      doc.surfaces[i] = { ...s0, radiusMm: sectionRadius(0, spec.sphereD) };
    } else {
      doc.surfaces[i] = toric(s0, axis, sectionRadius(axis, spec.sphereD), sectionRadius(axis + 90, spec.sphereD + spec.cylinderD));
    }
  }
  if (spec.ageYears !== undefined) doc.age = spec.ageYears;
  return doc;
}

/** A named preset (data/presets/refractive-errors.json) applied to the base eye, validated. */
export function applyRefractivePreset(base: EyeParameters, name: string, farPointOf: FarPointFn, side: Side = "right"): EyeParameters {
  const preset = REFRACTIVE_PRESETS.find((p) => p.name === name);
  if (!preset) throw new Error(`Unknown refractive preset "${name}"`);
  const doc = applyRefraction(base, preset, farPointOf, side);
  doc.id = `${base.id}-${preset.name}-${side}`;
  doc.label = `${preset.label}, ${side} eye (${base.label})`;
  const r = validateEyeParameters(doc);
  if (!r.ok) throw new Error(`Preset "${name}" does not validate: ${r.errors.join("; ")}`);
  return r.value;
}

/** Spherical equivalent and cylinder of a document from its paraxial far points at 0°, 45°, 90° (local). */
function powerOf(doc: EyeParameters, farPointOf: FarPointFn): { M: number; cylinderD: number } {
  const s = buildSurfacesAt(doc, 0);
  const p0 = farPointOf(s, 0);
  const p45 = farPointOf(s, 45);
  const p90 = farPointOf(s, 90);
  const M = (p0 + p90) / 2;
  return { M, cylinderD: -2 * Math.hypot((p0 - p90) / 2, p45 - M) };
}

export interface Decomposition {
  /** Spherical-equivalent refraction of the document, D. */
  totalD: number;
  /** That of the base eye (about 0 for an emmetropic schematic eye), D. */
  baseD: number;
  cornealD: number;
  lenticularD: number;
  axialD: number;
  /** totalD − baseD − (corneal + lenticular + axial): the interaction the split does not capture. */
  residualD: number;
  cylinderTotalD: number;
  cylinderCornealD: number;
  cylinderLenticularD: number;
}

const CORNEA = [SURFACE_NAMES.corneaAnterior, SURFACE_NAMES.corneaPosterior] as const;
const LENS = [SURFACE_NAMES.lensAnterior, SURFACE_NAMES.lensPosterior] as const;

/**
 * Split a document's paraxial refraction into corneal, lenticular, and axial parts: each part is
 * the change from the base eye when only the cornea's surfaces, the lens's surfaces, or the axial
 * length are taken from the document (spec §4.1 decomposition readout).
 */
export function decomposeRefraction(params: EyeParameters, base: EyeParameters, farPointOf: FarPointFn): Decomposition {
  const swap = (names: readonly string[]) => {
    const d = clone(base);
    d.surfaces = d.surfaces.map((s) => (names.includes(s.name) ? clone(params.surfaces.find((x) => x.name === s.name) ?? s) : s));
    return d;
  };
  const b = powerOf(base, farPointOf);
  const t = powerOf(params, farPointOf);
  const c = powerOf(swap(CORNEA), farPointOf);
  const l = powerOf(swap(LENS), farPointOf);
  const a = powerOf({ ...clone(base), axialLengthMm: params.axialLengthMm }, farPointOf);
  const cornealD = c.M - b.M;
  const lenticularD = l.M - b.M;
  const axialD = a.M - b.M;
  return {
    totalD: t.M,
    baseD: b.M,
    cornealD,
    lenticularD,
    axialD,
    residualD: t.M - b.M - (cornealD + lenticularD + axialD),
    cylinderTotalD: t.cylinderD,
    cylinderCornealD: c.cylinderD,
    cylinderLenticularD: l.cylinderD,
  };
}

/**
 * The other eye's document for the mirror shortcut (spec §4.1). Lateral quantities are stored in
 * each eye's local frame (x temporal), so the numbers carry over unchanged: the mirrored eye has
 * the same temporal fovea and its TABO axes are 180° minus the original's.
 */
export function mirrorEye(params: EyeParameters, side: Side): EyeParameters {
  const doc = clone(params);
  const stem = params.id.replace(/-(left|right)$/, "");
  doc.id = `${stem}-${side}`;
  doc.label = params.label.replace(/\b(left|right) eye\b/, `${side} eye`);
  return doc;
}
