import type { Vec3 } from "../math/vec3";
import { paraxialPower } from "../paraxial/abcd";
import type { Surface } from "../surfaces/types";
import { collimatedBundle, pointSourceBundle } from "../trace/bundle";
import { traceRay } from "../trace/sequential";

export class InsufficientRaysError extends Error {
  constructor(valid: number, total: number) {
    super(`Only ${valid} of ${total} rays reached the image space (need 60%)`);
    this.name = "InsufficientRaysError";
  }
}

export interface DefocusResult {
  /** Retinal defocus, diopters; positive when best focus lies behind the retina. */
  defocusD: number;
  bestFocusZMm: number;
  retinaZMm: number;
  /** RMS spot radius at the retina, mm. */
  rmsSpotMm: number;
  validRays: number;
  totalRays: number;
}

export interface DefocusOptions {
  gridN?: number;
  searchHalfWidthMm?: number;
  /** Distance in front of the first vertex at which the bundle is launched, mm. */
  launchOffsetMm?: number;
}

/** Fraction of launched rays that must reach image space before a defocus is reported. */
const MIN_VALID_FRACTION = 0.6;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

interface ImageRay {
  p: Vec3;
  d: Vec3;
}

function rmsRadiusAt(rays: readonly ImageRay[], z: number): number {
  let sx = 0;
  let sy = 0;
  const pts: Array<[number, number]> = [];
  for (const r of rays) {
    const t = (z - r.p[2]) / r.d[2];
    const x = r.p[0] + t * r.d[0];
    const y = r.p[1] + t * r.d[1];
    pts.push([x, y]);
    sx += x;
    sy += y;
  }
  const cx = sx / rays.length;
  const cy = sy / rays.length;
  let s = 0;
  for (const [x, y] of pts) s += (x - cx) ** 2 + (y - cy) ** 2;
  return Math.sqrt(s / rays.length);
}

/** Split the surface list into refracting surfaces and the image (retina) surface. */
export function splitImageSurface(surfaces: readonly Surface[], indexBefore = 1): { refracting: Surface[]; image: Surface } {
  let n = indexBefore;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (!s) continue;
    if (i > 0 && s.mediumAfter.index555 === n) return { refracting: surfaces.slice(0, i), image: s };
    n = s.mediumAfter.index555;
  }
  throw new Error("No image surface: expected a final surface whose medium index equals the preceding one");
}

/**
 * Retinal defocus for an on-axis object at `objectDistanceM` (`Infinity` for a distant
 * object) through a pupil of the given semi-diameter. A point-source bundle is traced to
 * image space, the axial position of minimum RMS spot radius is found by golden-section
 * search within ±searchHalfWidthMm of the retina vertex, and the axial gap is converted to
 * diopters with ΔD = n_image · Δz / f'² (f' the paraxial back focal length in the image
 * medium). Sign is positive when the focus is behind the retina.
 */
export function retinalDefocusD(
  surfaces: readonly Surface[],
  objectDistanceM: number,
  pupilSemiDiamMm: number,
  opts: DefocusOptions = {},
): DefocusResult {
  if (!(objectDistanceM > 0)) throw new RangeError(`objectDistanceM must be > 0, got ${objectDistanceM}`);
  const gridN = opts.gridN ?? 16;
  const halfWidth = opts.searchHalfWidthMm ?? 3;
  const launchOffset = opts.launchOffsetMm ?? 1;
  const { refracting, image } = splitImageSurface(surfaces);
  const first = refracting[0];
  if (!first) throw new Error("No refracting surfaces");
  const entranceZ = first.vertexZMm - launchOffset;
  const bundle = Number.isFinite(objectDistanceM)
    ? pointSourceBundle([0, 0, first.vertexZMm - objectDistanceM * 1000], pupilSemiDiamMm, gridN, entranceZ)
    : collimatedBundle({ x: 0, y: 0 }, pupilSemiDiamMm, gridN, entranceZ);

  const imageRays: ImageRay[] = [];
  for (const ray of bundle) {
    const r = traceRay(ray, refracting, 1);
    if (r.vignetted) continue;
    const last = r.hits[r.hits.length - 1];
    if (!last || last.dirAfter[2] <= 0) continue;
    imageRays.push({ p: last.point, d: last.dirAfter });
  }
  if (imageRays.length < MIN_VALID_FRACTION * bundle.length) {
    throw new InsufficientRaysError(imageRays.length, bundle.length);
  }

  const retinaZ = image.vertexZMm;
  let a = retinaZ - halfWidth;
  let b = retinaZ + halfWidth;
  let c = b - GOLDEN * (b - a);
  let d = a + GOLDEN * (b - a);
  let fc = rmsRadiusAt(imageRays, c);
  let fd = rmsRadiusAt(imageRays, d);
  for (let i = 0; i < 60 && b - a > 1e-6; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - GOLDEN * (b - a);
      fc = rmsRadiusAt(imageRays, c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + GOLDEN * (b - a);
      fd = rmsRadiusAt(imageRays, d);
    }
  }
  const bestZ = (a + b) / 2;

  const par = paraxialPower(surfaces);
  const nImage = image.mediumAfter.index555;
  const fPrimeMm = (1000 * nImage) / par.powerD;
  const defocusD = (nImage * (bestZ - retinaZ) * 1000) / (fPrimeMm * fPrimeMm);

  return {
    defocusD,
    bestFocusZMm: bestZ,
    retinaZMm: retinaZ,
    rmsSpotMm: rmsRadiusAt(imageRays, retinaZ),
    validRays: imageRays.length,
    totalRays: bundle.length,
  };
}
