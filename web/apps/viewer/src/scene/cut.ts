import { Plane, Vector3 } from "three";
import type { Side } from "../store/scene";

/** Orientation of the cutaway plane in the eye's own frame (x temporal, y superior, z posterior). */
export type CutOrientation = "sagittal" | "horizontal" | "frontal";

export interface CutSettings {
  orientation: CutOrientation;
  /** Offset of the plane from the globe center along its normal axis, mm (temporal, superior, or posterior positive). */
  depthMm: number;
  /** The eye that is cut; the other is drawn closed. */
  side: Side;
}

export const DEFAULT_CUT: CutSettings = { orientation: "horizontal", depthMm: 0, side: "right" };

export const CUT_LABELS: Record<CutOrientation, string> = {
  sagittal: "Sagittal (keeps the nasal part)",
  horizontal: "Horizontal (keeps the inferior part)",
  frontal: "Frontal (keeps the posterior part)",
};

/** Axis the depth is measured along, and the side of the plane that is kept (−1: below the depth). */
const AXES: Record<CutOrientation, { axis: [number, number, number]; keep: 1 | -1; along: string }> = {
  sagittal: { axis: [1, 0, 0], keep: -1, along: "temporal" },
  horizontal: { axis: [0, 1, 0], keep: -1, along: "superior" },
  frontal: { axis: [0, 0, 1], keep: 1, along: "posterior" },
};

export function clampDepthMm(depthMm: number, axialLengthMm: number): number {
  const h = Math.abs(axialLengthMm) / 2;
  return Number.isFinite(depthMm) ? Math.min(h, Math.max(-h, depthMm)) : 0;
}

/**
 * The cutaway plane in the eye's own frame, origin at the globe center. Three.js keeps the
 * side where `normal · p + constant ≥ 0`: the nasal part for a sagittal cut, the inferior
 * part for a horizontal cut, the posterior part for a frontal cut, so that the section faces
 * the lateral, superior, and anterior cameras. The depth is clamped to ±axialLength / 2.
 */
export function cutPlane(c: CutSettings, axialLengthMm: number): Plane {
  const { axis, keep } = AXES[c.orientation];
  const d = clampDepthMm(c.depthMm, axialLengthMm);
  const normal = new Vector3(axis[0] * keep, axis[1] * keep, axis[2] * keep);
  return new Plane(normal, -keep * d);
}

/** Readout of the plane's position, e.g. "2.0 mm superior of the globe center". */
export function cutDepthLabel(c: CutSettings, axialLengthMm: number): string {
  const d = clampDepthMm(c.depthMm, axialLengthMm);
  const { along } = AXES[c.orientation];
  const opposite: Record<string, string> = { temporal: "nasal", superior: "inferior", posterior: "anterior" };
  if (Math.abs(d) < 0.05) return "through the globe center";
  return `${Math.abs(d).toFixed(1)} mm ${d > 0 ? along : opposite[along]} of the globe center`;
}
