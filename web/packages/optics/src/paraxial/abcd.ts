import { meridianCurvature } from "../surfaces/geometry";
import type { Surface } from "../surfaces/types";

const DEG = Math.PI / 180;

export interface ParaxialOptions {
  /** Meridian (degrees from +x toward +y) whose section curvatures are used; 0 by default. Matters only for toric and Zernike surfaces. */
  meridianDeg?: number;
}

export interface ParaxialResult {
  /** Equivalent power of the refracting surfaces, diopters. */
  powerD: number;
  /** Distance from the last refracting vertex to the paraxial focus of a distant object, mm. */
  backFocalLengthMm: number;
  /** Absolute z of that focus, mm. */
  imageZMm: number;
  /**
   * Far point in clinical sign (D): the object vergence whose paraxial image lies on the
   * image surface. Negative for a myope (far point in front of the eye), positive for a
   * hyperope, 0 for an emmetrope. NaN when there is no image surface.
   */
  farPointD: number;
  /** Absolute z of the image surface (retina), or NaN. */
  imageSurfaceZMm: number;
}

type Mat = readonly [number, number, number, number]; // [a b; c d]

function mul(p: Mat, q: Mat): Mat {
  // p · q
  return [
    p[0] * q[0] + p[1] * q[2],
    p[0] * q[1] + p[1] * q[3],
    p[2] * q[0] + p[3] * q[2],
    p[2] * q[1] + p[3] * q[3],
  ];
}

interface SystemMatrix {
  /** Reduced matrix from the first to the last refracting vertex. */
  M: Mat;
  nImage: number;
  lastVertexZ: number;
  /** Absolute z of the first non-refracting (image) surface, or NaN. */
  imageSurfaceZ: number;
}

/**
 * Reduced ABCD matrix of the surfaces before the image surface: state (y, n·u) in mm and
 * radians, in the section along `meridianRad`. The first surface flagged `image` (the
 * retina) ends the system; an index-matched surface without the flag has no power.
 */
function systemMatrix(surfaces: readonly Surface[], indexBefore: number, meridianRad: number): SystemMatrix {
  let M: Mat = [1, 0, 0, 1];
  let n = indexBefore;
  let lastVertexZ = Number.NaN;
  let imageSurfaceZ = Number.NaN;
  let prevVertexZ: number | null = null;
  let refractingCount = 0;

  for (const s of surfaces) {
    if (s.image) {
      if (prevVertexZ === null) throw new Error(`The image surface "${s.name}" comes before any refracting surface`);
      imageSurfaceZ = s.vertexZMm;
      break;
    }
    const n2 = s.mediumAfter.index555;
    if (prevVertexZ !== null) M = mul([1, (s.vertexZMm - prevVertexZ) / n, 0, 1], M);
    const power = (n2 - n) * meridianCurvature(s, meridianRad); // per mm
    M = mul([1, 0, -power, 1], M);
    n = n2;
    prevVertexZ = s.vertexZMm;
    lastVertexZ = s.vertexZMm;
    refractingCount++;
  }
  if (refractingCount === 0) throw new Error("paraxialPower needs at least one refracting surface");
  return { M, nImage: n, lastVertexZ, imageSurfaceZ };
}

function vergenceImagingTo(sys: SystemMatrix, imageZMm: number): number {
  const [a, b, c, d] = sys.M;
  // A plane at infinity is conjugate to the object vergence 1000·c/d (the limit below).
  if (!Number.isFinite(imageZMm)) return d === 0 ? Number.NaN : (1000 * c) / d;
  const t = imageZMm - sys.lastVertexZ;
  const N = mul([1, t / sys.nImage, 0, 1], [a, b, c, d]);
  // Object transfer T(L) = [1 L/n0; 0 1]; (N·T)[0][1] = a·L/n0 + b = 0 ⇒ L = −b·n0/a.
  // Vergence (clinical sign) −1000·n0/L = 1000·a/b.
  return N[1] === 0 ? Number.NaN : (1000 * N[0]) / N[1];
}

/**
 * Object vergence in clinical sign (D), referred to the first vertex, whose paraxial image
 * lies at absolute `imageZMm` (`±Infinity` allowed). The far point is this vergence for the
 * retina; the difference between two such vergences is an exact defocus in diopters.
 */
export function objectVergenceForImageD(
  surfaces: readonly Surface[],
  imageZMm: number,
  indexBefore = 1,
  opts: ParaxialOptions = {},
): number {
  return vergenceImagingTo(systemMatrix(surfaces, indexBefore, (opts.meridianDeg ?? 0) * DEG), imageZMm);
}

/**
 * Paraxial ABCD trace in reduced form: state (y, n·u) in mm and radians, in one meridian
 * (toric and Zernike surfaces contribute the vertex curvature of that section). The first
 * surface flagged `image` (the retina) ends the system and defines `farPointD`; without one,
 * `farPointD` is NaN.
 */
export function paraxialPower(surfaces: readonly Surface[], indexBefore = 1, opts: ParaxialOptions = {}): ParaxialResult {
  const sys = systemMatrix(surfaces, indexBefore, (opts.meridianDeg ?? 0) * DEG);
  const [a, , c] = sys.M;
  const nImage = sys.nImage;
  const powerD = -c * 1000;
  const backFocalLengthMm = c === 0 ? Number.POSITIVE_INFINITY : (-a * nImage) / c;
  const imageZMm = sys.lastVertexZ + backFocalLengthMm;
  const farPointD = Number.isNaN(sys.imageSurfaceZ) ? Number.NaN : vergenceImagingTo(sys, sys.imageSurfaceZ);
  return { powerD, backFocalLengthMm, imageZMm, farPointD, imageSurfaceZMm: sys.imageSurfaceZ };
}
