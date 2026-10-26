import { normalize, sub, type Vec3 } from "../math/vec3";
import type { Ray } from "./ray";

const DEG = Math.PI / 180;

/** Square grid of (x, y) pupil samples inside a disk of radius `semiDiam`; gridN = 1 gives the center. */
export function pupilGrid(semiDiamMm: number, gridN: number): Array<readonly [number, number]> {
  if (!(Number.isInteger(gridN) && gridN >= 1)) throw new RangeError(`gridN must be a positive integer, got ${gridN}`);
  if (gridN === 1) return [[0, 0]];
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i < gridN; i++) {
    const y = -semiDiamMm + (2 * semiDiamMm * i) / (gridN - 1);
    for (let j = 0; j < gridN; j++) {
      const x = -semiDiamMm + (2 * semiDiamMm * j) / (gridN - 1);
      if (Math.hypot(x, y) <= semiDiamMm + 1e-12) pts.push([x, y]);
    }
  }
  return pts;
}

/** Direction for a field angle (degrees) measured from +z toward +x and +y. */
export function fieldDirection(dirAngleDeg: { x: number; y: number }): Vec3 {
  const ax = dirAngleDeg.x * DEG;
  const ay = dirAngleDeg.y * DEG;
  return normalize([Math.sin(ax) * Math.cos(ay), Math.sin(ay), Math.cos(ax) * Math.cos(ay)]);
}

/**
 * Parallel rays from a distant object, launched from the plane z = entranceZMm on a
 * gridN × gridN grid clipped to the pupil disk. Rays are tilted by the field angle.
 */
export function collimatedBundle(
  dirAngleDeg: { x: number; y: number },
  pupilSemiDiamMm: number,
  gridN: number,
  entranceZMm: number,
  wavelengthNm = 555,
): Ray[] {
  const dir = fieldDirection(dirAngleDeg);
  return pupilGrid(pupilSemiDiamMm, gridN).map(([x, y]) => ({ origin: [x, y, entranceZMm], dir, wavelengthNm }));
}

/** Rays from a point object aimed at the pupil grid in the plane z = entranceZMm. */
export function pointSourceBundle(
  point: Vec3,
  pupilSemiDiamMm: number,
  gridN: number,
  entranceZMm: number,
  wavelengthNm = 555,
): Ray[] {
  return pupilGrid(pupilSemiDiamMm, gridN).map(([x, y]) => ({
    origin: point,
    dir: normalize(sub([x, y, entranceZMm], point)),
    wavelengthNm,
  }));
}
