import type { Refraction } from "@eye/optics";

export type Side = "left" | "right";

/** Sphero-cylinder in clinical form: minus cylinder, axis in TABO degrees (0, 180]. */
export interface ClinicalPrescription {
  sphereD: number;
  cylinderD: number;
  axisDeg: number;
}

function wrap(deg: number): number {
  const a = ((deg % 180) + 180) % 180;
  return a < 1e-12 ? 180 : a;
}

/**
 * TABO axis of an angle given in the eye's local frame (x temporal, y superior, as optics
 * sees it). TABO is measured counterclockwise from the examiner's right while facing the
 * patient. For the right eye local +x (temporal) is the examiner's left, so TABO = 180 − φ;
 * for the left eye local +x is the examiner's right, so TABO = φ. Result in (0, 180].
 */
export function clinicalAxisDeg(localDeg: number, side: Side): number {
  return wrap(side === "right" ? 180 - localDeg : localDeg);
}

/** Inverse of `clinicalAxisDeg` (the map is its own inverse for each side). */
export function localAxisDeg(taboDeg: number, side: Side): number {
  return wrap(side === "right" ? 180 - taboDeg : taboDeg);
}

/**
 * A refraction from optics (local frame) in clinical terms: the axis in TABO and J45 in the
 * TABO frame (its sign flips for the right eye, whose local frame is mirrored relative to TABO).
 */
export function toClinicalRefraction(r: Refraction, side: Side): Refraction {
  return { ...r, axisDeg: clinicalAxisDeg(r.axisDeg, side), J45: side === "right" ? -r.J45 : r.J45 };
}
