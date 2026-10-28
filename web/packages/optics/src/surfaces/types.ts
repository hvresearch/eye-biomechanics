/**
 * Wavelength dependence of a medium as a Cauchy law n(λ) = A + B/λ² + C/λ⁴ (λ in µm). Only the
 * differences from 555 nm are used, so A is not stored (see `indexAt`).
 */
export interface CauchyDispersion {
  form: "cauchy";
  bUm2: number;
  cUm4: number;
}

/** Optical medium following a surface: index at 555 nm, and optionally its dispersion. */
export interface Medium {
  name: string;
  index555: number;
  dispersion?: CauchyDispersion;
}

/**
 * Fields shared by every surface kind, placed at an absolute axial position.
 *
 * Coordinates: right-handed, z along the optical axis toward the retina, x temporal for
 * the right eye, y superior. Angles are measured from +x toward +y.
 *
 * `tilt` is carried for the schema contract but must be zero; `intersect` throws otherwise
 * so the limitation is loud rather than silently wrong. `image: true` marks the image
 * surface (the retina): paraxial and defocus calculations end there, and an index-matched
 * surface without the flag is an ordinary (non-refracting) surface.
 */
export interface SurfaceBase {
  name: string;
  apertureSemiDiamMm: number;
  vertexZMm: number;
  tilt: { xDeg: number; yDeg: number };
  decenter: { xMm: number; yMm: number };
  mediumAfter: Medium;
  image?: boolean;
}

/**
 * Rotationally symmetric conic. `radiusMm` is positive when the center of curvature lies at
 * +z of the vertex (convex toward the object); `Infinity` is a plane. `conic` is the
 * Schwarzschild constant k (0 sphere, −1 paraboloid, < −1 hyperboloid).
 */
export interface ConicSurface extends SurfaceBase {
  kind: "conic";
  radiusMm: number;
  conic: number;
}

/**
 * Biconic (toric) surface. `rxMm` is the radius of the section along the direction
 * `axisDeg` (from +x toward +y), `ryMm` along `axisDeg + 90°`; `conicX` and `conicY` are
 * the conic constants of those sections. `Infinity` gives a flat section (a cylinder).
 */
export interface ToricSurface extends SurfaceBase {
  kind: "toric";
  rxMm: number;
  ryMm: number;
  axisDeg: number;
  conicX: number;
  conicY: number;
}

/**
 * Conic base plus a Zernike height perturbation: sag = conic sag + Σ c_j Z_j(r / normRadius, θ),
 * with `coeffsMicrons` in OSA/ANSI single-index order (j = 0 first) and in micrometers.
 */
export interface ZernikeSurface extends SurfaceBase {
  kind: "zernike";
  radiusMm: number;
  conic: number;
  normRadiusMm: number;
  coeffsMicrons: number[];
}

export type Surface = ConicSurface | ToricSurface | ZernikeSurface;

interface SequentialBase {
  name: string;
  tilt?: { xDeg: number; yDeg: number };
  decenter?: { xMm: number; yMm: number };
  thicknessToNextMm: number;
  mediumAfter: Medium;
  apertureSemiDiamMm: number;
  image?: boolean;
}

/** Surface description by thickness to the next surface, as in the EyeParameters schema. */
export type SequentialSurface =
  | (SequentialBase & { kind?: "conic"; radiusMm: number; conic?: number })
  | (SequentialBase & { kind: "toric"; rxMm: number; ryMm: number; axisDeg: number; conicX?: number; conicY?: number })
  | (SequentialBase & { kind: "zernike"; radiusMm: number; conic?: number; normRadiusMm: number; coeffsMicrons: number[] });
