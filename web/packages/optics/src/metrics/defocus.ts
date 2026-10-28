import type { Vec3 } from "../math/vec3";
import { objectVergenceForImageD } from "../paraxial/abcd";
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
  /** Axial position of minimum RMS spot, mm; ±Infinity if the image-space rays are parallel. */
  bestFocusZMm: number;
  retinaZMm: number;
  /** RMS spot radius at the retina, mm. */
  rmsSpotMm: number;
  validRays: number;
  totalRays: number;
}

export interface DefocusOptions {
  gridN?: number;
  /** Distance in front of the first vertex at which the bundle is launched, mm. */
  launchOffsetMm?: number;
}

/**
 * Default distance in front of the first vertex at which bundles are launched and aimed, mm
 * (a numerical choice, not physiology). Exported so drawn ray fans aim at the same plane.
 */
export const DEFAULT_LAUNCH_OFFSET_MM = 1;

/** Fraction of launched rays that must reach image space before a defocus is reported. */
const MIN_VALID_FRACTION = 0.6;

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

/**
 * Axial position of minimum RMS spot radius. Each ray's transverse position is linear in
 * z, so the centroid-relative mean squared radius is a quadratic in z and its minimum is
 * closed-form: z* = −Σ(Δa·Δb)/Σ(Δb²) with x_i(z) = a_i + b_i·z (likewise y) and Δ the
 * deviation from the bundle mean. No search window, so any defocus is found. Returns
 * ±Infinity when the image-space rays are parallel (focus at infinity).
 */
function bestRmsFocusZ(rays: readonly ImageRay[]): number {
  const n = rays.length;
  const coef = rays.map((r) => {
    const bx = r.d[0] / r.d[2];
    const by = r.d[1] / r.d[2];
    return { ax: r.p[0] - bx * r.p[2], ay: r.p[1] - by * r.p[2], bx, by };
  });
  let max = 0;
  let may = 0;
  let mbx = 0;
  let mby = 0;
  for (const c of coef) {
    max += c.ax / n;
    may += c.ay / n;
    mbx += c.bx / n;
    mby += c.by / n;
  }
  let num = 0;
  let den = 0;
  for (const c of coef) {
    const dbx = c.bx - mbx;
    const dby = c.by - mby;
    num += (c.ax - max) * dbx + (c.ay - may) * dby;
    den += dbx * dbx + dby * dby;
  }
  if (den === 0) return Number.POSITIVE_INFINITY;
  return -num / den;
}

/** Split the surface list into the surfaces before the image surface and the image (retina) surface. */
export function splitImageSurface(surfaces: readonly Surface[]): { refracting: Surface[]; image: Surface } {
  const i = surfaces.findIndex((s) => s.image === true);
  const image = surfaces[i];
  if (i <= 0 || !image) throw new Error("No image surface: mark the retina with image: true (after at least one refracting surface)");
  return { refracting: surfaces.slice(0, i), image };
}

/**
 * Retinal defocus for an on-axis object at `objectDistanceM` (`Infinity` for a distant
 * object) through a pupil of the given semi-diameter. A point-source bundle is traced to
 * image space and the axial position of minimum RMS spot radius is found in closed form.
 * The gap is converted to diopters exactly, not to first order: defocus is the difference
 * between the object vergences (clinical sign, referred to the first vertex) whose
 * paraxial images lie on the retina and at the best focus, so a paraxial bundle reproduces
 * the paraxial far point at any magnitude. Sign is positive when the focus is behind the
 * retina.
 */
export function retinalDefocusD(
  surfaces: readonly Surface[],
  objectDistanceM: number,
  pupilSemiDiamMm: number,
  opts: DefocusOptions = {},
): DefocusResult {
  if (!(objectDistanceM > 0)) throw new RangeError(`objectDistanceM must be > 0, got ${objectDistanceM}`);
  const gridN = opts.gridN ?? 16;
  const launchOffset = opts.launchOffsetMm ?? DEFAULT_LAUNCH_OFFSET_MM;
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
  const bestZ = bestRmsFocusZ(imageRays);

  const defocusD = objectVergenceForImageD(surfaces, retinaZ) - objectVergenceForImageD(surfaces, bestZ);

  return {
    defocusD,
    bestFocusZMm: bestZ,
    retinaZMm: retinaZ,
    rmsSpotMm: rmsRadiusAt(imageRays, retinaZ),
    validRays: imageRays.length,
    totalRays: bundle.length,
  };
}
