// Hand-written mirror of schemas/eye-parameters.schema.json (v1).

export interface Provenance {
  source: string;
  citation: string;
  generatedBy: string;
  gitHash: string;
  date: string;
  verified: boolean;
}

export interface Medium {
  name: string;
  index555: number;
  dispersion?: Record<string, unknown>;
}

export interface Surface {
  name: string;
  type: "conic" | "toric" | "zernike";
  radiusMm?: number;
  rxMm?: number;
  ryMm?: number;
  axisDeg?: number;
  conic?: number;
  conicX?: number;
  conicY?: number;
  zernikeHeight?: { normRadiusMm: number; coeffsMicrons: number[] };
  tilt?: { xDeg: number; yDeg: number };
  decenter?: { xMm: number; yMm: number };
  thicknessToNextMm: number;
  mediumAfter: Medium;
  apertureSemiDiamMm: number;
}

export type Vec3 = [number, number, number];

export interface MuscleGeometry {
  name: string;
  originMm: Vec3;
  pulleyMm: Vec3 | null;
  insertionDistFromLimbusMm: number;
  insertionWidthMm: number;
  tendon: { stiffnessNPerMm: number; slackLengthMm: number };
}

export interface EyeParameters {
  schemaVersion: string;
  id: string;
  label: string;
  provenance: Provenance;
  surfaces: Surface[];
  pupil: { model: string; params: Record<string, unknown> };
  axialLengthMm: number;
  retina: { radiusMm: number; conic: number };
  age: number;
  interpupillaryDistanceMm: number;
  lensAccommodationModel?: { coefficients?: Record<string, unknown>; [key: string]: unknown };
  visualAxis?: { alphaDeg: number; kappaDeg: number };
  pupilDecenterMm?: { x: number; y: number };
  extraocularMuscles?: MuscleGeometry[];
  eyelid?: { upperPressureKPa: number; lowerPressureKPa: number; apertureMm: number } | null;
}
