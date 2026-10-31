import { InstancedInterleavedBuffer, InterleavedBufferAttribute } from "three";
import type { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

type P3 = readonly [number, number, number];

/**
 * Sets a LineGeometry's points, and with `dashed` the cumulative segment distances the dash
 * pattern needs (what Line2.computeLineDistances writes). When the geometry already holds a
 * polyline with the same number of points, both buffers are rewritten in place (one upload
 * each) instead of replaced: LineGeometry.setPositions and computeLineDistances allocate new
 * interleaved buffers, and with them new GPU buffers, on every call, and replaced attributes
 * keep their GPU buffers until the geometry is disposed. Lines that move every frame (sight
 * lines, the ray fan, insertion arcs) cannot afford either.
 */
export function writeLinePositions(g: LineGeometry, points: readonly P3[], dashed = false): void {
  const segments = Math.max(0, points.length - 1);
  const start = g.getAttribute("instanceStart");
  if (start instanceof InterleavedBufferAttribute && start.data.count === segments && segments > 0) {
    // Interleaved as [start xyz, end xyz] per segment (LineSegmentsGeometry's layout).
    const a = start.data.array;
    for (let i = 0; i < segments; i++) {
      const p = points[i] ?? [0, 0, 0];
      const q = points[i + 1] ?? p;
      const k = 6 * i;
      a[k] = p[0];
      a[k + 1] = p[1];
      a[k + 2] = p[2];
      a[k + 3] = q[0];
      a[k + 4] = q[1];
      a[k + 5] = q[2];
    }
    start.data.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  } else {
    g.setPositions(points.flatMap((p) => [p[0], p[1], p[2]]));
  }
  if (!dashed) return;

  const existing = g.getAttribute("instanceDistanceStart");
  const inPlace = existing instanceof InterleavedBufferAttribute && existing.data.count === segments;
  const d = inPlace ? existing.data.array : new Float32Array(2 * segments);
  let total = 0;
  for (let i = 0; i < segments; i++) {
    const p = points[i] ?? [0, 0, 0];
    const q = points[i + 1] ?? p;
    d[2 * i] = total;
    total += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    d[2 * i + 1] = total;
  }
  if (inPlace) {
    existing.data.needsUpdate = true;
    return;
  }
  const buffer = new InstancedInterleavedBuffer(d, 2, 1);
  g.setAttribute("instanceDistanceStart", new InterleavedBufferAttribute(buffer, 1, 0));
  g.setAttribute("instanceDistanceEnd", new InterleavedBufferAttribute(buffer, 1, 1));
}
