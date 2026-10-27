import { describe, expect, it } from "vitest";
import { ACTIVATION_TABLE } from "../src/eom/activation";
import { MUSCLE_NAMES } from "../src/eom/geometry";
import { dynamicTargetsFromDirections, initialDynamics } from "../src/gaze/dynamics";
import { eyeDirections } from "../src/gaze/vergence";
import { loadPreset } from "../src/presets/load";
import { validateEyeParameters } from "../src/schema/validate";
import { SCENE_DEFAULTS, defaultScene } from "../src/scene/defaults";
import { SchemaVersionError, deriveBinocular } from "../src/state/derive";
import type { SceneState } from "../src/state/types";

const eye = loadPreset("navarro-1985");
const eyes = { left: eye, right: eye };
const scene = (over: Partial<SceneState> = {}): SceneState => ({ ...defaultScene("navarro-1985"), ...over });
const idx = (n: (typeof MUSCLE_NAMES)[number]) => MUSCLE_NAMES.indexOf(n);
const b = ACTIVATION_TABLE.baseline;

describe("deriveBinocular", () => {
  it("gives mirror-identical muscle states for a midline target", () => {
    const r = deriveBinocular(scene({ targetDistanceM: 0.4, targetDirectionDeg: { x: 0, y: 10 } }), eyes);
    for (let i = 0; i < 6; i++) {
      expect(r.left.eomActivation[i]).toBeCloseTo(r.right.eomActivation[i]!, 12);
      expect(r.left.eomLengthMm[i]).toBeCloseTo(r.right.eomLengthMm[i]!, 12);
    }
    expect(r.left.gazeDeg.xDeg).toBeCloseTo(r.right.gazeDeg.xDeg, 12);
  });

  it("uses the right lateral rectus and the left medial rectus for a target 20 degrees right", () => {
    const r = deriveBinocular(scene({ targetDistanceM: 6, targetDirectionDeg: { x: 20, y: 0 } }), eyes);
    expect(r.right.eomActivation[idx("lateralRectus")]!).toBeGreaterThan(b);
    expect(r.left.eomActivation[idx("medialRectus")]!).toBeGreaterThan(b);
    expect(r.right.eomActivation[idx("medialRectus")]!).toBeLessThan(b);
    expect(r.left.eomActivation[idx("lateralRectus")]!).toBeLessThan(b);
  });

  it("converges and recruits both medial recti as a midline target approaches", () => {
    const far = deriveBinocular(scene({ targetDistanceM: 6 }), eyes);
    const near = deriveBinocular(scene({ targetDistanceM: 0.33 }), eyes);
    expect(near.vergenceDeg).toBeGreaterThan(far.vergenceDeg);
    for (const side of ["left", "right"] as const) {
      expect(near[side].eomActivation[idx("medialRectus")]!).toBeGreaterThan(far[side].eomActivation[idx("medialRectus")]!);
    }
  });

  it("computes each eye's demand from its own distance to the target", () => {
    const r = deriveBinocular(scene({ targetDistanceM: 0.333 }), eyes);
    const want = 1 / Math.hypot(0.333, SCENE_DEFAULTS.ipdMm / 2000);
    expect(r.right.demandD).toBeCloseTo(want, 9);
    expect(r.left.demandD).toBeCloseTo(want, 9);
    expect(r.right.targetDistanceM).toBeCloseTo(Math.hypot(0.333, 0.0315), 12);
  });

  it("follows the dynamic state when one is given", () => {
    const s = scene({ targetDistanceM: 0.33, targetDirectionDeg: { x: 10, y: 0 } });
    const dirs = eyeDirections({ distanceM: 0.33, directionDeg: { x: 10, y: 0 } }, s.ipdMm);
    const dyn = initialDynamics(dynamicTargetsFromDirections(dirs, { left: 1.25, right: 1.5 }));
    const r = deriveBinocular(s, eyes, { dynamics: dyn });
    expect(r.right.accommodationD).toBe(1.5);
    expect(r.left.accommodationD).toBe(1.25);
    expect(r.right.gazeDeg.xDeg).toBeCloseTo(dirs.right.xDeg, 12);
    expect(r.vergenceDeg).toBeCloseTo(dyn.vergenceDeg, 12);
  });

  it("keeps the rest lengths at primary position and the paths consistent with the lengths", () => {
    const r = deriveBinocular(scene({ targetDirectionDeg: { x: 0, y: 0 }, targetDistanceM: Number.POSITIVE_INFINITY }), eyes);
    for (let i = 0; i < 6; i++) {
      expect(r.right.eomLengthMm[i]).toBeCloseTo(r.right.eomRestLengthMm[i]!, 12);
      expect(r.right.eomPaths[i]!.lengthMm).toBe(r.right.eomLengthMm[i]);
      expect(r.right.eomActivation[i]).toBeCloseTo(b, 12);
    }
    expect(r.vergenceDeg).toBe(0);
  });

  it("rejects an unsupported schema version", () => {
    const bad = { ...eye, schemaVersion: "2.0.0" };
    expect(() => deriveBinocular(scene(), { left: eye, right: bad })).toThrow(SchemaVersionError);
  });
});

describe("presets carry muscles and the scene default IPD", () => {
  it("attaches six validated extraocular muscles", () => {
    expect(eye.extraocularMuscles).toHaveLength(6);
    expect(validateEyeParameters(eye).ok).toBe(true);
    expect(eye.interpupillaryDistanceMm).toBe(SCENE_DEFAULTS.ipdMm);
  });
});
