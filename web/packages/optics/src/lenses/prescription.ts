import defaults from "../../../../../data/spectacles/defaults.json";
import type { Surface } from "../surfaces/types";

/**
 * A spectacle prescription and its lens design. Sphere and cylinder are back-vertex powers in
 * minus-cylinder form (diopters); `axisDeg` is in the optics frame (from +x toward +y), not TABO.
 */
export interface Prescription {
  sphereD: number;
  cylinderD: number;
  axisDeg: number;
  vertexMm: number;
  baseCurveD: number;
  index: number;
  centerThicknessMm: number;
}

/** Lens design defaults (data/spectacles/defaults.json). */
export const SPECTACLE_DEFAULTS = {
  vertexMm: defaults.vertexMm,
  baseCurveD: defaults.baseCurveD,
  index: defaults.index,
  centerThicknessMm: defaults.centerThicknessMm,
  semiDiameterMm: defaults.semiDiameterMm,
} as const;

/** Radius (mm) of a surface of power `powerD` between indices n1 → n2; Infinity for zero power. */
function radiusFor(powerD: number, n1: number, n2: number): number {
  return powerD === 0 ? Number.POSITIVE_INFINITY : (1000 * (n2 - n1)) / powerD;
}

/**
 * The two surfaces of a spectacle lens in front of an eye whose anterior corneal vertex is at
 * `corneaVertexZMm`: a spherical front of power `baseCurveD` at z = cornea − vertex − thickness,
 * and a back surface at z = cornea − vertex whose principal sections make the thick-lens
 * back-vertex power S along `axisDeg` and S + C across it (toric when C ≠ 0):
 * F2 = BVP − F1/(1 − (t/n)·F1).
 */
export function lensSurfaces(p: Prescription, corneaVertexZMm = 0): Surface[] {
  const n = p.index;
  const t = p.centerThicknessMm;
  const F1 = p.baseCurveD;
  const reduced = F1 / (1 - (t / 1000 / n) * F1);
  const back = (bvp: number) => radiusFor(bvp - reduced, n, 1);
  const backZ = corneaVertexZMm - p.vertexMm;
  const common = {
    apertureSemiDiamMm: SPECTACLE_DEFAULTS.semiDiameterMm,
    tilt: { xDeg: 0, yDeg: 0 },
    decenter: { xMm: 0, yMm: 0 },
  };
  const front: Surface = {
    ...common,
    name: "spectacle.front",
    kind: "conic",
    radiusMm: radiusFor(F1, 1, n),
    conic: 0,
    vertexZMm: backZ - t,
    mediumAfter: { name: "spectacle", index555: n },
  };
  const air = { name: "air", index555: 1 };
  const backSurface: Surface =
    p.cylinderD === 0
      ? { ...common, name: "spectacle.back", kind: "conic", radiusMm: back(p.sphereD), conic: 0, vertexZMm: backZ, mediumAfter: air }
      : {
          ...common,
          name: "spectacle.back",
          kind: "toric",
          rxMm: back(p.sphereD),
          ryMm: back(p.sphereD + p.cylinderD),
          axisDeg: p.axisDeg,
          conicX: 0,
          conicY: 0,
          vertexZMm: backZ,
          mediumAfter: air,
        };
  return [front, backSurface];
}
