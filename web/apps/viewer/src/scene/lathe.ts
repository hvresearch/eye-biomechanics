import { LatheGeometry, Vector2 } from "three";
import type { ProfilePoint } from "./profiles";

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
  return g;
}
