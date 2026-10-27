import { buildSurfacesAt, lensParameterFor, type EyeParameters } from "@eye/eye-model";
import {
  DEFAULT_LAUNCH_OFFSET_MM,
  normalize,
  paraxialPower,
  retinalDefocusD,
  splitImageSurface,
  sub,
  traceRay,
  type Ray,
  type Surface,
  type Vec3,
} from "@eye/optics";
import type { EyeOptics, EyeOpticsRequest, OpticsRequest, OpticsResponse } from "./messages";

/** How far in front of the cornea a drawn ray starts, mm (a drawing choice, not physiology). */
export const FAN_LAUNCH_MM = 8;

/** Sagittal fan of `n` rays spanning the pupil in y, aimed like the defocus bundle. */
export function fanRays(req: Pick<EyeOpticsRequest, "fanRays" | "objectDistanceM" | "pupilSemiDiamMm">, firstVertexZ: number): Ray[] {
  const n = Math.max(0, Math.floor(req.fanRays));
  const rays: Ray[] = [];
  const launchZ = firstVertexZ - FAN_LAUNCH_MM;
  const aimZ = firstVertexZ - DEFAULT_LAUNCH_OFFSET_MM;
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : -req.pupilSemiDiamMm + (2 * req.pupilSemiDiamMm * i) / (n - 1);
    if (Number.isFinite(req.objectDistanceM)) {
      const obj: Vec3 = [0, 0, firstVertexZ - req.objectDistanceM * 1000];
      const dir = normalize(sub([0, y, aimZ], obj));
      // Start drawing FAN_LAUNCH_MM in front of the cornea along the same ray.
      const t = (launchZ - obj[2]) / dir[2];
      rays.push({ origin: [obj[0] + t * dir[0], obj[1] + t * dir[1], launchZ], dir, wavelengthNm: 555 });
    } else {
      rays.push({ origin: [0, y, launchZ], dir: [0, 0, 1], wavelengthNm: 555 });
    }
  }
  return rays;
}

const farPointOf = (s: Surface[]) => paraxialPower(s).farPointD;
const relaxedCache = new Map<string, number>();

/**
 * Far point of the relaxed document (clinical sign), cached by document contents: worker
 * messages are structured clones, so object identity does not survive between requests.
 */
export function relaxedFarPointD(params: EyeParameters): number {
  const key = JSON.stringify(params);
  let fp = relaxedCache.get(key);
  if (fp === undefined) {
    const raw = farPointOf(buildSurfacesAt(params, 0));
    fp = Number.isFinite(raw) ? raw : 0;
    if (relaxedCache.size > 16) relaxedCache.clear();
    relaxedCache.set(key, fp);
  }
  return fp;
}

function eyeOptics(req: EyeOpticsRequest): EyeOptics {
  // The lens parameter is solved so the optics accommodate by exactly the requested
  // response; without this the modeled lag of accommodation would not reach the optics.
  const lensParameterA = lensParameterFor(req.params, req.accommodationD, farPointOf);
  const surfaces = buildSurfacesAt(req.params, lensParameterA);
  const { refracting } = splitImageSurface(surfaces);
  const first = refracting[0];
  if (!first) throw new Error("No refracting surfaces");
  const d = retinalDefocusD(surfaces, req.objectDistanceM, req.pupilSemiDiamMm);
  let vignettedRays = 0;
  const fan = fanRays(req, first.vertexZMm).map((ray) => {
    const r = traceRay(ray, surfaces, 1);
    if (r.vignetted) vignettedRays++;
    return [ray.origin, ...r.hits.map((h) => h.point)];
  });
  return {
    side: req.side,
    surfaces,
    lensParameterA,
    paraxialPowerD: paraxialPower(surfaces).powerD,
    farPointD: relaxedFarPointD(req.params),
    defocusD: d.defocusD,
    bestFocusZMm: d.bestFocusZMm,
    retinaZMm: d.retinaZMm,
    rmsSpotMm: d.rmsSpotMm,
    fan,
    vignettedRays,
  };
}

/** Pure request handler, shared by the worker and its tests: all optics for both eyes. */
export function handle(req: OpticsRequest): OpticsResponse {
  const t0 = performance.now();
  const eyes = req.eyes.map(eyeOptics);
  return { id: req.id, eyes, elapsedMs: performance.now() - t0 };
}
