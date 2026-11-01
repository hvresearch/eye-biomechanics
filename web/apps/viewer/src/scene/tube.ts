import type { Vec3 } from "@eye/eye-model";
import { BufferAttribute, CatmullRomCurve3, DynamicDrawUsage, LineCurve3, Sphere, TubeGeometry, Vector3, type BufferGeometry } from "three";

/**
 * Drawn radius of a muscle along its path, u in [0, 1] from origin (0) to insertion (1):
 * a fusiform belly that reaches `bellyMm` and tapers to the tendon radius over the last
 * `tendonFraction` of the path. A drawing choice, not anatomy data.
 */
export function taperedRadius(u: number, bellyMm: number, tendonMm: number, tendonFraction: number): number {
  const c = Math.min(1, Math.max(0, u));
  const tf = Math.min(0.9, Math.max(0, tendonFraction));
  const bellyEnd = 1 - tf;
  if (c >= bellyEnd) return tendonMm;
  // Belly: rises from the tendon radius at the origin to the maximum and back, as a sine lobe.
  const s = c / bellyEnd;
  return tendonMm + (bellyMm - tendonMm) * Math.sin(Math.PI * s) ** 0.6;
}

/** Resolution and drawn radii of a muscle tube (data/anatomy/orbit-drawing.json `muscle`). */
export interface TubeShape {
  tubularSegments: number;
  radialSegments: number;
  bellyRadiusMm: number;
  tendonRadiusMm: number;
}

/** Curve samples per tube segment for the arc-length table (a numerical choice). */
const ARC_SAMPLES_PER_SEGMENT = 2;

/**
 * An open tube with fixed topology (indices and uvs) whose vertices `writeTaperedTube` fills.
 * Built once per muscle, so a gaze change rewrites two vertex buffers instead of allocating a
 * new geometry, frames, and GPU buffers for every muscle on every frame.
 */
export function createTube(shape: TubeShape): BufferGeometry {
  const g = new TubeGeometry(new LineCurve3(new Vector3(0, 0, 0), new Vector3(0, 0, 1)), shape.tubularSegments, 1, shape.radialSegments, false);
  markDynamic(g);
  return g;
}

const trigCache = new Map<number, { sin: Float64Array; cos: Float64Array }>();

/** sin v and −cos v around a ring of `radial` segments (three's TubeGeometry convention). */
function ringTrig(radial: number): { sin: Float64Array; cos: Float64Array } {
  let t = trigCache.get(radial);
  if (!t) {
    const sin = new Float64Array(radial + 1);
    const cos = new Float64Array(radial + 1);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      sin[j] = Math.sin(v);
      cos[j] = -Math.cos(v);
    }
    t = { sin, cos };
    trigCache.set(radial, t);
  }
  return t;
}

/** Hints that a geometry's positions and normals are rewritten often (in-place updates). */
export function markDynamic(g: BufferGeometry): void {
  for (const name of ["position", "normal"]) {
    const a = g.getAttribute(name);
    if (a instanceof BufferAttribute) a.setUsage(DynamicDrawUsage);
  }
}

/**
 * Writes a tapered tube along the centripetal Catmull-Rom curve through `points` into `g`
 * (from `createTube` with the same shape): rings evenly spaced in arc length, oriented by
 * rotation-minimizing frames, radius `taperedRadius` with the tendon over the last
 * `tendonMm` of `lengthMm`, radial normals. `mirror` flips x (the left eye).
 */
export function writeTaperedTube(
  g: BufferGeometry,
  points: readonly Vec3[],
  lengthMm: number,
  tendonMm: number,
  mirror: boolean,
  shape: TubeShape,
): void {
  const n = shape.tubularSegments;
  const radial = shape.radialSegments;
  const sx = mirror ? -1 : 1;
  const curve = new CatmullRomCurve3(
    points.map(([x, y, z]) => new Vector3(sx * x, y, z)),
    false,
    "centripetal",
  );

  // Arc-length table at uniform curve parameter, then the ring centers at uniform arc length.
  const k = n * ARC_SAMPLES_PER_SEGMENT;
  const lengths = new Float64Array(k + 1);
  const p = new Vector3();
  const q = new Vector3();
  curve.getPoint(0, q);
  for (let i = 1; i <= k; i++) {
    curve.getPoint(i / k, p);
    lengths[i] = (lengths[i - 1] ?? 0) + p.distanceTo(q);
    q.copy(p);
  }
  const total = lengths[k] ?? 0;
  const centers = new Float64Array(3 * (n + 1));
  let seg = 0;
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    while (seg < k - 1 && (lengths[seg + 1] ?? 0) < s) seg++;
    const l0 = lengths[seg] ?? 0;
    const l1 = lengths[seg + 1] ?? l0;
    const f = l1 > l0 ? (s - l0) / (l1 - l0) : 0;
    curve.getPoint(Math.min(1, (seg + f) / k), p);
    centers[3 * i] = p.x;
    centers[3 * i + 1] = p.y;
    centers[3 * i + 2] = p.z;
  }

  const pos = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  if (!(pos instanceof BufferAttribute) || !(nrm instanceof BufferAttribute) || pos.count !== (n + 1) * (radial + 1)) {
    throw new Error("writeTaperedTube: geometry was not made by createTube with this shape");
  }
  const pa = pos.array;
  const na = nrm.array;
  const { sin, cos } = ringTrig(radial);
  const t = new Vector3();
  const nv = new Vector3();
  const b = new Vector3();
  const tendonFraction = lengthMm > 0 ? tendonMm / lengthMm : 0;
  // Bounding box of the centers and the largest radius, for the bounding sphere.
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  let rMax = 0;
  for (let i = 0; i <= n; i++) {
    // Tangent by differences of the neighboring centers (one-sided at the ends).
    const a = Math.max(0, i - 1);
    const c = Math.min(n, i + 1);
    t.set(
      (centers[3 * c] ?? 0) - (centers[3 * a] ?? 0),
      (centers[3 * c + 1] ?? 0) - (centers[3 * a + 1] ?? 0),
      (centers[3 * c + 2] ?? 0) - (centers[3 * a + 2] ?? 0),
    ).normalize();
    if (i === 0) {
      // Initial normal: perpendicular to the tangent, from its smallest component's axis.
      const ax = Math.abs(t.x);
      const ay = Math.abs(t.y);
      const az = Math.abs(t.z);
      if (ax <= ay && ax <= az) nv.set(1, 0, 0);
      else if (ay <= az) nv.set(0, 1, 0);
      else nv.set(0, 0, 1);
    }
    // Rotation-minimizing: project the previous normal off the new tangent.
    nv.addScaledVector(t, -nv.dot(t)).normalize();
    b.crossVectors(t, nv);
    const r = taperedRadius(i / n, shape.bellyRadiusMm, shape.tendonRadiusMm, tendonFraction);
    const cx = centers[3 * i] ?? 0;
    const cy = centers[3 * i + 1] ?? 0;
    const cz = centers[3 * i + 2] ?? 0;
    x0 = Math.min(x0, cx);
    y0 = Math.min(y0, cy);
    z0 = Math.min(z0, cz);
    x1 = Math.max(x1, cx);
    y1 = Math.max(y1, cy);
    z1 = Math.max(z1, cz);
    rMax = Math.max(rMax, r);
    for (let j = 0; j <= radial; j++) {
      // The same ring parametrization as three's TubeGeometry, so its uvs and winding fit.
      const sj = sin[j] ?? 0;
      const cj = cos[j] ?? 0;
      const ox = cj * nv.x + sj * b.x;
      const oy = cj * nv.y + sj * b.y;
      const oz = cj * nv.z + sj * b.z;
      const k = 3 * (i * (radial + 1) + j);
      na[k] = ox;
      na[k + 1] = oy;
      na[k + 2] = oz;
      pa[k] = cx + r * ox;
      pa[k + 1] = cy + r * oy;
      pa[k + 2] = cz + r * oz;
    }
  }
  const sphere = g.boundingSphere ?? new Sphere();
  sphere.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  let reach = 0;
  for (let i = 0; i <= n; i++) {
    const dx = (centers[3 * i] ?? 0) - sphere.center.x;
    const dy = (centers[3 * i + 1] ?? 0) - sphere.center.y;
    const dz = (centers[3 * i + 2] ?? 0) - sphere.center.z;
    reach = Math.max(reach, dx * dx + dy * dy + dz * dz);
  }
  sphere.radius = Math.sqrt(reach) + rMax;
  g.boundingSphere = sphere;
  g.boundingBox = null;
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
}
