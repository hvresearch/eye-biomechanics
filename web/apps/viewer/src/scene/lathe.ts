import { BufferAttribute, LatheGeometry, Sphere, Vector2, type BufferGeometry } from "three";
import type { ProfilePoint } from "./profiles";
import { markDynamic } from "./tube";

/** Angular segments over the half revolution that survives the sagittal cut. */
export const LATHE_SEGMENTS = 48;

/**
 * Revolve a meridional (r, z) profile about world +Z. By default only the half that the
 * sagittal cut keeps is built (world x = r·sin φ ≤ 0 for φ in [π, 2π]); `full` builds the
 * whole revolution for an uncut eye. LatheGeometry revolves about +Y; a pure rotation maps
 * that axis to +Z and keeps its smooth normals consistent with the face winding, so no
 * second normals pass is needed.
 */
export function lathe(profile: readonly ProfilePoint[], full = false): LatheGeometry {
  const pts = profile.map(([r, z]) => new Vector2(Math.max(0, r), z));
  const g = full
    ? new LatheGeometry(pts, LATHE_SEGMENTS * 2, 0, 2 * Math.PI)
    : new LatheGeometry(pts, LATHE_SEGMENTS, Math.PI, Math.PI);
  g.rotateX(Math.PI / 2);
  markDynamic(g);
  return g;
}

/**
 * Rewrites a geometry built by `lathe(previous, full)` for a new profile with the same number
 * of points, in its existing buffers: the positions and normals `lathe(profile, full)` would
 * produce (three's LatheGeometry rotated so its axis is +Z: (r sin φ, −r cos φ, z)), with every
 * normal unit length. Accommodation reshapes the lens and its neighbors every frame of a target
 * drag; this keeps those frames from allocating new geometries and GPU buffers.
 */
export function writeLathe(g: BufferGeometry, profile: readonly ProfilePoint[], full = false): void {
  const m = profile.length;
  const segments = full ? LATHE_SEGMENTS * 2 : LATHE_SEGMENTS;
  const phiStart = full ? 0 : Math.PI;
  const phiLength = full ? 2 * Math.PI : Math.PI;
  const pos = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  if (!(pos instanceof BufferAttribute) || !(nrm instanceof BufferAttribute) || pos.count !== m * (segments + 1)) {
    throw new Error(`writeLathe: the geometry was not built by lathe() for ${m} profile points`);
  }

  // Meridian normals as LatheGeometry computes them: the first segment's at the first point,
  // the sum of the adjacent segments' between, the last segment's at the last point.
  const mr = new Float64Array(m);
  const mz = new Float64Array(m);
  let pr = 0;
  let pz = 0;
  for (let j = 0; j < m; j++) {
    let nr = pr;
    let nz = pz;
    if (j < m - 1) {
      const [r0 = 0, z0 = 0] = profile[j] ?? [];
      const [r1 = 0, z1 = 0] = profile[j + 1] ?? [];
      const dr = Math.max(0, r1) - Math.max(0, r0);
      const dz = z1 - z0;
      nr = dz + (j > 0 ? pr : 0);
      nz = -dr + (j > 0 ? pz : 0);
      pr = dz;
      pz = -dr;
    }
    const len = Math.hypot(nr, nz) || 1;
    mr[j] = nr / len;
    mz[j] = nz / len;
  }

  const pa = pos.array;
  const na = nrm.array;
  for (let i = 0; i <= segments; i++) {
    const phi = phiStart + (i / segments) * phiLength;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    for (let j = 0; j < m; j++) {
      const p = profile[j];
      const rr = Math.max(0, p?.[0] ?? 0);
      const k = 3 * (i * m + j);
      pa[k] = rr * sin;
      pa[k + 1] = -rr * cos;
      pa[k + 2] = p?.[1] ?? 0;
      const nr = mr[j] ?? 0;
      na[k] = nr * sin;
      na[k + 1] = -nr * cos;
      na[k + 2] = mz[j] ?? 0;
    }
  }
  // Bounding sphere from the profile: centered on the axis midway between its z extremes, the
  // radius the farthest profile point (every revolved vertex is that far or nearer).
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [, z] of profile) {
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const zc = (z0 + z1) / 2;
  let reach = 0;
  for (const [r, z] of profile) reach = Math.max(reach, Math.hypot(Math.max(0, r), z - zc));
  const sphere = g.boundingSphere ?? new Sphere();
  sphere.center.set(0, 0, zc);
  sphere.radius = reach;
  g.boundingSphere = sphere;
  g.boundingBox = null;
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
}
