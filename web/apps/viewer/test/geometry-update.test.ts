import { buildSurfaces, deriveEyeState, loadPreset, type SceneState, type Vec3 } from "@eye/eye-model";
import { InterleavedBufferAttribute } from "three";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { describe, expect, it } from "vitest";
import { lathe, writeLathe } from "../src/scene/lathe";
import { writeLinePositions } from "../src/scene/lineBuffer";
import { globeProfiles } from "../src/scene/profiles";
import { createTube, taperedRadius, writeTaperedTube, type TubeShape } from "../src/scene/tube";

const scene = (targetDistanceM: number): SceneState => ({
  targetDistanceM,
  targetDirectionDeg: { x: 0, y: 0 },
  luminanceCdM2: 100,
  ageYears: 30,
  ipdMm: 63,
  timeS: 0,
  preset: "navarro-1985",
});

const profilesAt = (d: number) => {
  const eye = loadPreset("navarro-1985");
  const st = deriveEyeState(scene(d), eye, "right");
  return globeProfiles(buildSurfaces(eye, st), eye.axialLengthMm, eye.retina.radiusMm, st.pupilMm);
};

const SHAPE: TubeShape = { tubularSegments: 24, radialSegments: 8, bellyRadiusMm: 1.9, tendonRadiusMm: 0.55 };
const PATH_A: Vec3[] = [
  [10, 2, 30],
  [11, 1.5, 15],
  [11.5, 0.5, 5],
  [11.2, 0, -2],
];
const PATH_B: Vec3[] = [
  [10, 2, 30],
  [9, 3, 15],
  [8, 4, 4],
  [6.5, 5, -3],
  [5, 5.5, -6],
];

const ring = (pos: ArrayLike<number>, i: number, radial: number) => {
  const pts: Vec3[] = [];
  // The last vertex of a ring duplicates the first (the uv seam).
  for (let j = 0; j < radial; j++) {
    const k = 3 * (i * (radial + 1) + j);
    pts.push([pos[k] ?? NaN, pos[k + 1] ?? NaN, pos[k + 2] ?? NaN]);
  }
  return pts;
};
const mean = (pts: Vec3[]): Vec3 => {
  const s = pts.reduce<Vec3>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return [s[0] / pts.length, s[1] / pts.length, s[2] / pts.length];
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("writeTaperedTube", () => {
  it("rewrites a fixed-topology tube in place along a new path", () => {
    const g = createTube(SHAPE);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const index = g.getIndex();
    writeTaperedTube(g, PATH_A, 40, 8, false, SHAPE);
    writeTaperedTube(g, PATH_B, 45, 8, false, SHAPE);
    // Same buffers: nothing reallocated, so the GPU buffers are updated rather than recreated.
    expect(g.getAttribute("position")).toBe(pos);
    expect(g.getAttribute("normal")).toBe(nrm);
    expect(g.getIndex()).toBe(index);
    expect(pos.count).toBe((SHAPE.tubularSegments + 1) * (SHAPE.radialSegments + 1));

    const first = mean(ring(pos.array, 0, SHAPE.radialSegments));
    const last = mean(ring(pos.array, SHAPE.tubularSegments, SHAPE.radialSegments));
    expect(dist(first, PATH_B[0] ?? [0, 0, 0])).toBeLessThan(1e-4);
    expect(dist(last, PATH_B[PATH_B.length - 1] ?? [0, 0, 0])).toBeLessThan(1e-4);

    for (let i = 0; i <= SHAPE.tubularSegments; i++) {
      const pts = ring(pos.array, i, SHAPE.radialSegments);
      const c = mean(pts);
      const r = taperedRadius(i / SHAPE.tubularSegments, SHAPE.bellyRadiusMm, SHAPE.tendonRadiusMm, 8 / 45);
      for (const [j, p] of pts.entries()) {
        expect(dist(p, c)).toBeCloseTo(r, 4);
        const k = 3 * (i * (SHAPE.radialSegments + 1) + j);
        const n: Vec3 = [nrm.array[k] ?? NaN, nrm.array[k + 1] ?? NaN, nrm.array[k + 2] ?? NaN];
        expect(Math.hypot(...n)).toBeCloseTo(1, 6);
        // Outward: along the vertex's offset from the ring center.
        const out = (p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1] + (p[2] - c[2]) * n[2];
        expect(out / r).toBeGreaterThan(0.99);
      }
    }
    expect(g.boundingSphere?.radius ?? 0).toBeGreaterThan(0);
  });

  it("mirrors x for the left eye", () => {
    const right = createTube(SHAPE);
    const left = createTube(SHAPE);
    writeTaperedTube(right, PATH_A, 40, 8, false, SHAPE);
    writeTaperedTube(left, PATH_A, 40, 8, true, SHAPE);
    const a = right.getAttribute("position");
    const b = left.getAttribute("position");
    const ca = mean(ring(a.array, 5, SHAPE.radialSegments));
    const cb = mean(ring(b.array, 5, SHAPE.radialSegments));
    expect(dist(cb, [-ca[0], ca[1], ca[2]])).toBeLessThan(1e-6);
  });
});

describe("writeLathe", () => {
  it("reproduces a freshly built lathe in the existing buffers", () => {
    const near = profilesAt(0.25);
    const far = profilesAt(6);
    for (const key of Object.keys(far) as (keyof typeof far)[]) {
      const a = near[key];
      const b = far[key];
      if (a.length !== b.length) continue;
      const g = lathe(a, true);
      const pos = g.getAttribute("position");
      writeLathe(g, b, true);
      expect(g.getAttribute("position"), key).toBe(pos);
      const fresh = lathe(b, true);
      const p1 = g.getAttribute("position").array;
      const p2 = fresh.getAttribute("position").array;
      for (let i = 0; i < p1.length; i++) expect(p1[i], key).toBeCloseTo(p2[i] ?? NaN, 5);
      const n1 = g.getAttribute("normal").array;
      const n2 = fresh.getAttribute("normal").array;
      for (let i = 0; i < n1.length; i += 3) {
        const l2 = Math.hypot(n2[i] ?? 0, n2[i + 1] ?? 0, n2[i + 2] ?? 0) || 1;
        // three leaves the last meridian point's normal unnormalized; compare directions.
        for (let c = 0; c < 3; c++) expect(n1[i + c], key).toBeCloseTo((n2[i + c] ?? NaN) / l2, 5);
      }
    }
  });

  it("changes the lens between near and far targets", () => {
    const g = lathe(profilesAt(0.25).lens, true);
    const before = Float32Array.from(g.getAttribute("position").array);
    writeLathe(g, profilesAt(6).lens, true);
    const after = g.getAttribute("position").array;
    let moved = 0;
    for (let i = 0; i < before.length; i++) moved = Math.max(moved, Math.abs((before[i] ?? 0) - (after[i] ?? 0)));
    expect(moved).toBeGreaterThan(0.01);
  });
});

describe("writeLinePositions", () => {
  it("rewrites a polyline with the same point count in its existing buffer", () => {
    const g = new LineGeometry();
    writeLinePositions(g, [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ]);
    const start = g.getAttribute("instanceStart");
    if (!(start instanceof InterleavedBufferAttribute)) throw new Error("no instanceStart");
    const buffer = start.data;
    const version = buffer.version;
    writeLinePositions(g, [
      [0, 0, 5],
      [2, 0, 5],
      [2, 3, 5],
    ]);
    const now = g.getAttribute("instanceStart");
    if (!(now instanceof InterleavedBufferAttribute)) throw new Error("no instanceStart");
    expect(now.data).toBe(buffer);
    expect(buffer.version).toBeGreaterThan(version);
    expect(Array.from(buffer.array)).toEqual([0, 0, 5, 2, 0, 5, 2, 0, 5, 2, 3, 5]);
    expect(g.boundingBox?.max.y).toBe(3);
    expect(g.boundingSphere?.center.z).toBeCloseTo(5, 6);
    // A different point count replaces the buffer.
    writeLinePositions(g, [
      [0, 0, 0],
      [1, 1, 1],
    ]);
    const replaced = g.getAttribute("instanceStart");
    if (!(replaced instanceof InterleavedBufferAttribute)) throw new Error("no instanceStart");
    expect(replaced.data).not.toBe(buffer);
    expect(replaced.data.count).toBe(1);
  });

  it("writes the dash distances in place, as Line2.computeLineDistances would", () => {
    const g = new LineGeometry();
    const pts = (z: number): [number, number, number][] => [
      [0, 0, z],
      [3, 4, z],
      [3, 4, z + 2],
    ];
    writeLinePositions(g, pts(0), true);
    const d = g.getAttribute("instanceDistanceStart");
    if (!(d instanceof InterleavedBufferAttribute)) throw new Error("no distances");
    expect(Array.from(d.data.array)).toEqual([0, 5, 5, 7]);
    const buffer = d.data;
    writeLinePositions(g, [
      [0, 0, 0],
      [0, 0, 1],
      [0, 2, 1],
    ], true);
    const again = g.getAttribute("instanceDistanceEnd");
    if (!(again instanceof InterleavedBufferAttribute)) throw new Error("no distances");
    expect(again.data).toBe(buffer);
    expect(Array.from(buffer.array)).toEqual([0, 1, 1, 3]);
  });
});

describe("tube bounding sphere", () => {
  it("contains every vertex", () => {
    const g = createTube(SHAPE);
    writeTaperedTube(g, PATH_B, 45, 8, true, SHAPE);
    const s = g.boundingSphere;
    if (!s) throw new Error("no bounding sphere");
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i) - s.center.x, pos.getY(i) - s.center.y, pos.getZ(i) - s.center.z);
      expect(d).toBeLessThanOrEqual(s.radius + 1e-4);
    }
  });
});

describe("lathe bounding sphere", () => {
  it("contains every revolved vertex", () => {
    const p = profilesAt(0.25);
    for (const key of Object.keys(p) as (keyof typeof p)[]) {
      const g = lathe(p[key], true);
      writeLathe(g, profilesAt(1)[key].length === p[key].length ? profilesAt(1)[key] : p[key], true);
      const s = g.boundingSphere;
      if (!s) throw new Error("no bounding sphere");
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const d = Math.hypot(pos.getX(i) - s.center.x, pos.getY(i) - s.center.y, pos.getZ(i) - s.center.z);
        expect(d, key).toBeLessThanOrEqual(s.radius + 1e-4);
      }
    }
  });
});
