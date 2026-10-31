import { describe, expect, it } from "vitest";
import { dragToTarget } from "../src/scene/dragTarget";
import { THEMES, activationColor, paletteFor } from "../src/scene/palette";
import { taperedRadius } from "../src/scene/tube";

describe("taperedRadius", () => {
  it("is the tendon radius over the tendon and at the origin, and the belly maximum in the belly", () => {
    expect(taperedRadius(1, 2.4, 0.5, 0.2)).toBe(0.5);
    expect(taperedRadius(0.85, 2.4, 0.5, 0.2)).toBe(0.5);
    expect(taperedRadius(0, 2.4, 0.5, 0.2)).toBeCloseTo(0.5, 12);
    expect(taperedRadius(0.4, 2.4, 0.5, 0.2)).toBeCloseTo(2.4, 12);
    for (let u = 0; u <= 1; u += 0.05) {
      const r = taperedRadius(u, 2.4, 0.5, 0.2);
      expect(r).toBeGreaterThanOrEqual(0.5 - 1e-12);
      expect(r).toBeLessThanOrEqual(2.4 + 1e-12);
    }
  });
});

describe("activationColor", () => {
  it.each(THEMES)("runs from the resting muscle tone to the hot token (%s)", (theme) => {
    const p = paletteFor(theme);
    expect(activationColor(0, theme)).toBe(p.muscleRest);
    expect(activationColor(1, theme)).toBe(p.hot);
    expect(activationColor(2, theme)).toBe(p.hot);
    expect(activationColor(Number.NaN, theme)).toBe(p.muscleRest);
  });
});

describe("dragToTarget", () => {
  it("maps a straight-ahead ray onto the target plane", () => {
    const t = dragToTarget([0, 0, 100], [0, 0, -1], -333);
    expect(t!.distanceM).toBeCloseTo(0.333, 12);
    expect(t!.directionDeg.x).toBeCloseTo(0, 12);
    expect(t!.directionDeg.y).toBeCloseTo(0, 12);
  });

  it("gives a 20 degree rightward direction for a ray through a point 20 degrees right", () => {
    const z = -400;
    const x = -z * Math.tan((20 * Math.PI) / 180);
    const t = dragToTarget([0, 50, 0], [x, -50, z], z);
    expect(t!.directionDeg.x).toBeCloseTo(20, 9);
    expect(t!.directionDeg.y).toBeCloseTo(0, 9);
  });

  it("returns null for a ray parallel to or pointing away from the plane", () => {
    expect(dragToTarget([0, 0, 0], [1, 0, 0], -300)).toBeNull();
    expect(dragToTarget([0, 0, 0], [0, 0, 1], -300)).toBeNull();
  });
});

describe("insertionArc", () => {
  it("spans the insertion width across the muscle on the globe", async () => {
    const { insertionArc, MARKER_LIFT } = await import("../src/scene/markers");
    const { musclePath, defaultMuscles, QUAT_IDENTITY, GLOBE_RADIUS_MM } = await import("@eye/eye-model");
    const m = defaultMuscles()[0]!;
    const path = musclePath(m, QUAT_IDENTITY);
    const arc = insertionArc(path, m.insertionWidthMm);
    const R = GLOBE_RADIUS_MM * MARKER_LIFT;
    for (const p of arc) expect(Math.hypot(...p)).toBeCloseTo(R, 9);
    let len = 0;
    for (let i = 1; i < arc.length; i++) len += Math.hypot(arc[i]![0] - arc[i - 1]![0], arc[i]![1] - arc[i - 1]![1], arc[i]![2] - arc[i - 1]![2]);
    expect(len).toBeCloseTo(m.insertionWidthMm * MARKER_LIFT, 2);
    // Across the muscle: the arc's chord is perpendicular to the muscle's last segment.
    const n = path.points.length;
    const [p, q] = [path.points[n - 1]!, path.points[n - 2]!];
    const chord = arc[arc.length - 1]!.map((v, i) => v - arc[0]![i]!);
    const seg = q.map((v, i) => v - p[i]!);
    expect(Math.abs(chord[0]! * seg[0]! + chord[1]! * seg[1]! + chord[2]! * seg[2]!) / (Math.hypot(...chord) * Math.hypot(...seg))).toBeLessThan(1e-6);
  });
});
