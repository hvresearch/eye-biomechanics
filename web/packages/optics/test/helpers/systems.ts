import type { ConicSurface, Surface } from "../../src/surfaces/types";
import type { ViewSpec } from "../../src/trace/aim";

const flat = { tilt: { xDeg: 0, yDeg: 0 }, decenter: { xMm: 0, yMm: 0 } };

export function conicAt(name: string, z: number, radiusMm: number, k: number, index: number, aperture = 20): ConicSurface {
  return { name, kind: "conic", radiusMm, conic: k, vertexZMm: z, apertureSemiDiamMm: aperture, mediumAfter: { name: `n${index}`, index555: index }, ...flat };
}

/**
 * A stigmatic system for a distant object: one refracting ellipsoid with k = −1/n² images an
 * axial point at infinity perfectly at its far focus z = nR/(n − 1). The image plane sits there
 * (plus `imageShiftMm`).
 */
export function stigmaticEllipsoid(n = 1.5, R = 10, imageShiftMm = 0): Surface[] {
  const f = (n * R) / (n - 1);
  return [
    conicAt("ellipsoid", 0, R, -1 / (n * n), n),
    { ...conicAt("image", f + imageShiftMm, Number.POSITIVE_INFINITY, 0, n, 50), image: true },
  ];
}

export function onAxisView(pupilRadiusMm: number, objectDistanceM = Number.POSITIVE_INFINITY): ViewSpec {
  return {
    objectDistanceM,
    fieldDeg: { x: 0, y: 0 },
    referenceZMm: 0,
    pupilPlaneZMm: -1,
    pupilCenterMm: { x: 0, y: 0 },
    pupilRadiusMm,
  };
}

/** A thin spectacle of back-vertex power about `powerD` (plane front, spherical back), front vertex at z0. */
export function thinSpectacle(powerD: number, z0 = -14, n = 1.5, t = 1): Surface[] {
  const R2 = (1000 * (1 - n)) / powerD;
  return [conicAt("spec.front", z0, Number.POSITIVE_INFINITY, 0, n, 25), { ...conicAt("spec.back", z0 + t, R2, 0, 1, 25), mediumAfter: { name: "air", index555: 1 } }];
}
