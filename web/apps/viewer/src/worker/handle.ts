import { normalize, retinalDefocusD, splitImageSurface, sub, traceRay, type Ray, type Vec3 } from "@eye/optics";
import type { OpticsRequest, OpticsResponse } from "./messages";

/** How far in front of the cornea a drawn ray starts, mm (a drawing choice, not physiology). */
export const FAN_LAUNCH_MM = 8;

/** Sagittal fan of `n` rays spanning the pupil in y, for drawing. */
export function fanRays(req: OpticsRequest, firstVertexZ: number): Ray[] {
  const n = Math.max(1, Math.floor(req.fanRays));
  const rays: Ray[] = [];
  const launchZ = firstVertexZ - FAN_LAUNCH_MM;
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : -req.pupilSemiDiamMm + (2 * req.pupilSemiDiamMm * i) / (n - 1);
    if (Number.isFinite(req.objectDistanceM)) {
      const obj: Vec3 = [0, 0, firstVertexZ - req.objectDistanceM * 1000];
      const dir = normalize(sub([0, y, firstVertexZ - 1], obj));
      // Start drawing FAN_LAUNCH_MM in front of the cornea along the same ray.
      const t = (launchZ - obj[2]) / dir[2];
      rays.push({ origin: [obj[0] + t * dir[0], obj[1] + t * dir[1], launchZ], dir, wavelengthNm: 555 });
    } else {
      rays.push({ origin: [0, y, launchZ], dir: [0, 0, 1], wavelengthNm: 555 });
    }
  }
  return rays;
}

/** Pure request handler, shared by the worker and its tests. */
export function handle(req: OpticsRequest): OpticsResponse {
  const t0 = performance.now();
  const { refracting } = splitImageSurface(req.surfaces);
  const first = refracting[0];
  if (!first) throw new Error("No refracting surfaces");
  const d = retinalDefocusD(req.surfaces, req.objectDistanceM, req.pupilSemiDiamMm);
  let vignettedRays = 0;
  const fan = fanRays(req, first.vertexZMm).map((ray) => {
    const r = traceRay(ray, req.surfaces, 1);
    if (r.vignetted) vignettedRays++;
    return [ray.origin, ...r.hits.map((h) => h.point)];
  });
  return {
    id: req.id,
    defocusD: d.defocusD,
    bestFocusZMm: d.bestFocusZMm,
    retinaZMm: d.retinaZMm,
    rmsSpotMm: d.rmsSpotMm,
    fan,
    vignettedRays,
    elapsedMs: performance.now() - t0,
  };
}
