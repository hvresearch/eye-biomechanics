import { distance, dot, sub, type Vec3 } from "../math/vec3";
import { splitImageSurface } from "../metrics/defocus";
import type { Surface } from "../surfaces/types";
import type { PupilBundle } from "../trace/aim";
import { traceRay } from "../trace/sequential";

/**
 * Optical path difference over the pupil, in µm: W = OPL_chief − OPL_ray at the reference
 * sphere, so a phase-advanced ray is positive (a myopic eye has c(2,0) > 0). Samples are the
 * bundle's pupil-plane positions relative to the pupil center.
 */
export interface OpdMap {
  gridN: number;
  pupilRadiusMm: number;
  xs: Float64Array;
  ys: Float64Array;
  opdMicrons: Float64Array;
  /** 1 where the ray reached the reference sphere, 0 where it was vignetted (its OPD is 0). */
  valid: Uint8Array;
  gridIndex: Uint32Array;
  /** Center of the reference sphere: the chief ray's intersection with the image surface, mm. */
  imagePoint: Vec3;
  validFraction: number;
  wavelengthNm: number;
}

export class ChiefRayError extends Error {
  constructor(at: string | undefined, reason: string | undefined) {
    super(`The chief ray was vignetted at ${at ?? "?"} (${reason ?? "?"}); no wavefront reference`);
    this.name = "ChiefRayError";
  }
}

/**
 * OPD map of a bundle through `surfaces` (image surface last). The reference sphere is
 * centered on the chief ray's intersection with the image surface and passes through the
 * chief ray's last refracting hit; each ray's path is extended (or shortened) in image space
 * to that sphere.
 */
export function opdMap(surfaces: readonly Surface[], bundle: PupilBundle): OpdMap {
  const { refracting } = splitImageSurface(surfaces);
  const chiefFull = traceRay(bundle.chief, surfaces, 1);
  if (chiefFull.vignetted) throw new ChiefRayError(chiefFull.vignettedAt, chiefFull.reason);
  const imageHit = chiefFull.hits[chiefFull.hits.length - 1];
  const chiefLast = chiefFull.hits[chiefFull.hits.length - 2];
  if (!imageHit || !chiefLast) throw new ChiefRayError(undefined, "no hits");
  const P = imageHit.point;
  const R = distance(chiefLast.point, P);
  const chiefOpl = chiefFull.opticalPathMm - chiefLast.indexAfter * R; // OPL up to the last refracting hit

  const n = bundle.rays.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const opd = new Float64Array(n);
  const valid = new Uint8Array(n);
  let nValid = 0;
  bundle.rays.forEach((ray, i) => {
    xs[i] = bundle.pupilXYMm[2 * i] ?? 0;
    ys[i] = bundle.pupilXYMm[2 * i + 1] ?? 0;
    const r = traceRay(ray, refracting, 1);
    if (r.vignetted) return;
    const last = r.hits[r.hits.length - 1];
    if (!last || !(last.dirAfter[2] > 0)) return;
    // |p + t d − P| = R; take the root nearest the last hit.
    const w = sub(last.point, P);
    const b = dot(w, last.dirAfter);
    const disc = b * b - (dot(w, w) - R * R);
    if (disc < 0) return;
    const sq = Math.sqrt(disc);
    const t1 = -b - sq;
    const t2 = -b + sq;
    const t = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
    const opl = r.opticalPathMm + last.indexAfter * t;
    opd[i] = (chiefOpl - opl) * 1000;
    valid[i] = 1;
    nValid++;
  });
  return {
    gridN: bundle.gridN,
    pupilRadiusMm: bundle.view.pupilRadiusMm,
    xs,
    ys,
    opdMicrons: opd,
    valid,
    gridIndex: bundle.gridIndex,
    imagePoint: P,
    validFraction: n > 0 ? nValid / n : 0,
    wavelengthNm: bundle.chief.wavelengthNm,
  };
}
