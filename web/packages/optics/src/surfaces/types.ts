/** Optical medium following a surface. Index at 555 nm (dispersion arrives in Milestone 3). */
export interface Medium {
  name: string;
  index555: number;
}

/**
 * A rotationally symmetric conic surface placed at an absolute axial position.
 *
 * Coordinates: right-handed, z along the optical axis toward the retina, x temporal for
 * the right eye, y superior. `radiusMm` is positive when the center of curvature lies
 * at +z of the vertex (convex toward the object); `Infinity` is a plane. `conic` is the
 * Schwarzschild constant k (0 sphere, −1 paraboloid, < −1 hyperboloid).
 *
 * `tilt` is carried for the schema contract but must be zero in this milestone;
 * `intersect` throws otherwise so the limitation is loud rather than silently wrong.
 */
export interface Surface {
  name: string;
  kind: "conic";
  radiusMm: number;
  conic: number;
  apertureSemiDiamMm: number;
  vertexZMm: number;
  tilt: { xDeg: number; yDeg: number };
  decenter: { xMm: number; yMm: number };
  mediumAfter: Medium;
}

/** Surface description by thickness to the next surface, as in the EyeParameters schema. */
export interface SequentialSurface {
  name: string;
  radiusMm: number;
  conic?: number;
  tilt?: { xDeg: number; yDeg: number };
  decenter?: { xMm: number; yMm: number };
  thicknessToNextMm: number;
  mediumAfter: Medium;
  apertureSemiDiamMm: number;
}
