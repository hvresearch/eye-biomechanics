import { distance } from "../math/vec3";
import { intersect, normalAt } from "../surfaces/conic";
import type { Surface } from "../surfaces/types";
import type { Ray, TraceHit, TraceResult } from "./ray";
import { refract } from "./refract";

/**
 * Trace one ray sequentially through `surfaces`. The trace stops at the first surface the
 * ray misses (aperture or no forward intersection) or where it undergoes total internal
 * reflection; the result then has `vignetted: true` with the surface name and reason. A
 * surface whose medium index equals the incoming index (the retina) is hit without
 * refraction.
 */
export function traceRay(ray: Ray, surfaces: readonly Surface[], indexBefore = 1): TraceResult {
  const hits: TraceHit[] = [];
  let origin = ray.origin;
  let dir = ray.dir;
  let n = indexBefore;
  let opl = 0;

  for (const s of surfaces) {
    const hit = intersect(s, origin, dir);
    if (hit === null) {
      return { hits, opticalPathMm: opl, vignetted: true, vignettedAt: s.name, reason: "aperture" };
    }
    opl += n * distance(origin, hit.point);
    const n2 = s.mediumAfter.index555;
    const normal = normalAt(s, hit.point[0], hit.point[1]);
    const out = refract(dir, normal, n, n2);
    if (out === null) {
      hits.push({ surface: s.name, point: hit.point, dirAfter: dir, indexAfter: n });
      return { hits, opticalPathMm: opl, vignetted: true, vignettedAt: s.name, reason: "tir" };
    }
    hits.push({ surface: s.name, point: hit.point, dirAfter: out, indexAfter: n2 });
    origin = hit.point;
    dir = out;
    n = n2;
  }
  return { hits, opticalPathMm: opl, vignetted: false };
}
