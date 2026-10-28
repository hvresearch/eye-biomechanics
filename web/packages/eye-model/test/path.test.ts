import { describe, expect, it } from "vitest";
import { EOM_TABLE, GLOBE_RADIUS_MM, defaultMuscles, type EomMuscle, type MuscleName } from "../src/eom/geometry";
import { musclePath } from "../src/eom/path";
import { gazeQuaternion } from "../src/gaze/listing";
import { QUAT_IDENTITY } from "../src/math/quat";
import { distance, norm, type Vec3 } from "../src/math/vec";

const muscles = new Map(defaultMuscles().map((m) => [m.name, m] as const));
const get = (n: MuscleName) => muscles.get(n)!;
const len = (n: MuscleName, xDeg: number, yDeg: number) => musclePath(get(n), gazeQuaternion({ xDeg, yDeg })).lengthMm;

describe("musclePath", () => {
  it("gives a medial rectus length near the published muscle plus tendon length", () => {
    // StatPearls: muscle 40.8 mm + tendon 3.7 mm = 44.5 mm. The model is about 11% short because
    // all recti share one annulus point and there are no pulleys (data/eom/README.md and
    // docs/superpowers/plans/2026-10-27-m2-followups.md); 15% bounds that known gap.
    const mrRaw = EOM_TABLE.muscles.find((m) => m.name === "medialRectus")!;
    const published = mrRaw.muscleLengthMm! + mrRaw.tendon.slackLengthMm;
    expect(published).toBeCloseTo(44.5, 9);
    const L = musclePath(get("medialRectus"), QUAT_IDENTITY).lengthMm;
    expect(Math.abs(L - published) / published).toBeLessThan(0.15);
  });

  it("gives a medial rectus arc of contact within the published 6-7 mm (±1 mm)", () => {
    const arc = musclePath(get("medialRectus"), QUAT_IDENTITY).arcMm;
    expect(arc).toBeGreaterThan(5);
    expect(arc).toBeLessThan(8);
  });

  it("shortens each rectus and lengthens its antagonist when the eye rotates 20 degrees toward its action", () => {
    const cases: Array<[MuscleName, MuscleName, number, number]> = [
      ["lateralRectus", "medialRectus", 20, 0],
      ["medialRectus", "lateralRectus", -20, 0],
      ["superiorRectus", "inferiorRectus", 0, 20],
      ["inferiorRectus", "superiorRectus", 0, -20],
    ];
    for (const [agonist, antagonist, x, y] of cases) {
      expect(len(agonist, x, y)).toBeLessThan(len(agonist, 0, 0));
      expect(len(antagonist, x, y)).toBeGreaterThan(len(antagonist, 0, 0));
    }
  });

  it("keeps every path point on or outside the globe", () => {
    for (const m of muscles.values()) {
      for (const [x, y] of [
        [0, 0],
        [30, 0],
        [-30, 20],
        [10, -35],
      ] as const) {
        const p = musclePath(m, gazeQuaternion({ xDeg: x, yDeg: y }));
        for (const pt of p.points) expect(norm(pt)).toBeGreaterThanOrEqual(GLOBE_RADIUS_MM - 1e-9);
        expect(norm(p.pullDir)).toBeCloseTo(1, 12);
      }
    }
  });

  it("pulls the superior oblique along its 51-degree construction direction in primary position", () => {
    const p = musclePath(get("superiorOblique"), QUAT_IDENTITY);
    const horizontal = (Math.atan2(-p.pullDir[0], -p.pullDir[2]) * 180) / Math.PI;
    expect(horizontal).toBeCloseTo(51, 4); // stored origin is rounded to 1e-6 mm
    expect(p.arcMm).toBeGreaterThan(0);
  });

  const synthetic = (insertionMm: Vec3, pulleyMm: Vec3 | null = null): EomMuscle => ({
    name: "lateralRectus",
    antagonist: "medialRectus",
    originMm: [0, 0, 30],
    pulleyMm,
    insertionMm,
    insertionWidthMm: 9,
    tendon: { stiffnessNPerMm: 0, slackLengthMm: 7 },
  });
  const onSphere = (polarFromPosteriorRad: number): Vec3 => [
    GLOBE_RADIUS_MM * Math.sin(polarFromPosteriorRad),
    0,
    GLOBE_RADIUS_MM * Math.cos(polarFromPosteriorRad),
  ];

  it("has no wrap arc when the straight segment does not enter the globe", () => {
    const ins = onSphere(0.5); // faces the origin (tangent angle is acos(12/30) ≈ 1.159 rad)
    const p = musclePath(synthetic(ins), QUAT_IDENTITY);
    expect(p.arcMm).toBe(0);
    expect(p.lengthMm).toBeCloseTo(distance([0, 0, 30], ins), 12);
  });

  it("is continuous across the wrap boundary", () => {
    const phiP = Math.acos(GLOBE_RADIUS_MM / 30);
    const a = musclePath(synthetic(onSphere(phiP - 1e-7)), QUAT_IDENTITY);
    const b = musclePath(synthetic(onSphere(phiP + 1e-7)), QUAT_IDENTITY);
    expect(a.arcMm).toBe(0);
    expect(b.arcMm).toBeGreaterThan(0);
    expect(Math.abs(a.lengthMm - b.lengthMm)).toBeLessThan(1e-5);
  });

  it("wraps over the arc exactly as the tangent-plus-arc formula says", () => {
    const phi = 2.0;
    const p = musclePath(synthetic(onSphere(phi)), QUAT_IDENTITY);
    const phiP = Math.acos(GLOBE_RADIUS_MM / 30);
    expect(p.arcMm).toBeCloseTo(GLOBE_RADIUS_MM * (phi - phiP), 12);
    expect(p.lengthMm).toBeCloseTo(Math.sqrt(30 * 30 - 144) + GLOBE_RADIUS_MM * (phi - phiP), 12);
  });

  it("adds the origin-to-pulley segment and wraps from the pulley", () => {
    const pulley: Vec3 = [0, 0, 20];
    const ins = onSphere(2.0);
    const p = musclePath(synthetic(ins, pulley), QUAT_IDENTITY);
    const phiP = Math.acos(GLOBE_RADIUS_MM / 20);
    expect(p.lengthMm).toBeCloseTo(10 + Math.sqrt(400 - 144) + GLOBE_RADIUS_MM * (2.0 - phiP), 12);
    expect(p.points[1]).toEqual(pulley);
  });

  it("rejects a free end inside the globe", () => {
    expect(() => musclePath({ ...synthetic(onSphere(2)), originMm: [0, 0, 5] }, QUAT_IDENTITY)).toThrow(RangeError);
  });
});
