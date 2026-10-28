import { indexAt } from "../color/dispersion";
import { distance } from "../math/vec3";
import { intersect, normalAt } from "../surfaces/geometry";
import type { Surface } from "../surfaces/types";
import type { Ray, TraceHit, TraceResult } from "./ray";
import { refract } from "./refract";

/**
 * Trace one ray sequentially through `surfaces`. The trace stops at the first surface the
 * ray misses (`"aperture"` when the hit lies outside the aperture, `"miss"` when there is no
 * forward intersection) or where it undergoes total internal reflection (`"tir"`); the result
 * then has `vignetted: true` with the surface name and reason. A surface whose medium index
 * equals the incoming index (the retina, a stop) is hit without refraction. Indices follow
 * each medium's dispersion at the ray's wavelength; `indexBefore` is the index of the
 * object space at that wavelength (air, 1, by default).
 */
export function traceRay(ray: Ray, surfaces: readonly Surface[], indexBefore = 1): TraceResult {
  const hits: TraceHit[] = [];
  let origin = ray.origin;
  let dir = ray.dir;
  let n = indexBefore;
  let opl = 0;

  for (const s of surfaces) {
    const hit = intersect(s, origin, dir);
    if (hit === null || hit === "miss") {
      return { hits, opticalPathMm: opl, vignetted: true, vignettedAt: s.name, reason: hit === null ? "aperture" : "miss" };
    }
    opl += n * distance(origin, hit.point);
    const n2 = indexAt(s.mediumAfter, ray.wavelengthNm);
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
