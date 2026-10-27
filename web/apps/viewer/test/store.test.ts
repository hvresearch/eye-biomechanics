import { MIN_TARGET_DISTANCE_M, loadPreset } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { createSceneStore } from "../src/store/scene";
import { handle } from "../src/worker/handle";

describe("scene store", () => {
  it("clamps the target distance once and stores the clamped value", () => {
    const store = createSceneStore();
    store.getState().setTargetDistance(0);
    expect(store.getState().scene.targetDistanceM).toBe(MIN_TARGET_DISTANCE_M);
    store.getState().setTargetDistance(Number.NaN);
    expect(store.getState().scene.targetDistanceM).toBe(MIN_TARGET_DISTANCE_M);
  });

  it("reports an unsupported schema version in the parameter error, keeping a working eye", () => {
    const bad = { ...loadPreset("navarro-1985"), schemaVersion: "2.0.0" };
    const store = createSceneStore({ eyes: { left: bad, right: bad } });
    const s = store.getState();
    expect(s.paramError).toMatch(/2\.0\.0/);
    expect(s.workerError).toBeNull();
    expect(s.binocular.right.eomActivation).toHaveLength(6);
  });

  it("does not let a worker success clear a parameter error", () => {
    const bad = { ...loadPreset("navarro-1985"), schemaVersion: "2.0.0" };
    const store = createSceneStore({ eyes: { left: bad, right: bad } });
    const good = loadPreset("navarro-1985");
    const res = handle({
      id: 1,
      eyes: [{ side: "right", params: good, accommodationD: 0, objectDistanceM: 6, pupilSemiDiamMm: 2, fanRays: 3 }],
    });
    store.getState().applyOptics(res);
    expect(store.getState().paramError).toMatch(/2\.0\.0/);
    expect(store.getState().optics).toBe(res);
  });

  it("uses the relaxed far point from the worker for demand (0.17 D at 6 m for the emmetropic preset)", () => {
    const store = createSceneStore();
    const eye = loadPreset("navarro-1985");
    const b = store.getState().staticBinocular;
    const res = handle({
      id: 1,
      eyes: (["right", "left"] as const).map((side) => ({
        side,
        params: eye,
        accommodationD: b[side].accommodationD,
        objectDistanceM: b[side].targetDistanceM,
        pupilSemiDiamMm: 2,
        fanRays: 0,
      })),
    });
    store.getState().applyOptics(res);
    const s = store.getState();
    const fp = res.eyes[0]!.farPointD;
    expect(Math.abs(fp)).toBeLessThan(0.05);
    expect(s.farPointD.right).toBe(fp);
    expect(s.staticBinocular.right.demandD).toBeCloseTo(1 / Math.hypot(6, s.scene.ipdMm / 2000) + fp, 12);
    // At 6 m the eye accommodates about 0.17 D, so the accommodated power sits just above relaxed.
    expect(res.eyes[0]!.paraxialPowerD).toBeGreaterThan(60.42);
    expect(res.eyes[0]!.paraxialPowerD).toBeLessThan(60.9);
  });

  it("derives both eyes and vergence, and converges for a near target", () => {
    const store = createSceneStore();
    const far = store.getState().binocular.vergenceDeg;
    store.getState().setTargetDistance(0.33);
    expect(store.getState().binocular.vergenceDeg).toBeGreaterThan(far + 5);
  });

  it("animates toward the targets while playing and snaps to them when paused", () => {
    const store = createSceneStore();
    store.getState().setPlaying(true);
    store.getState().setTargetDirection({ x: 20, y: 0 });
    store.getState().tick(0.01);
    const mid = store.getState().binocular.right.gazeDeg.xDeg;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(19);
    // The saccade lands in 65 ms; the small vergence change of an eccentric target settles with
    // its latency and time constant, so run 4 s (about 10 time constants).
    for (let i = 0; i < 200; i++) store.getState().tick(0.02);
    expect(store.getState().binocular.right.gazeDeg.xDeg).toBeCloseTo(store.getState().staticBinocular.right.gazeDeg.xDeg, 4);
    expect(store.getState().history.length).toBeGreaterThan(10);
    store.getState().setPlaying(false);
    expect(store.getState().binocular.right.gazeDeg.xDeg).toBe(store.getState().staticBinocular.right.gazeDeg.xDeg);
  });

  it("scrubs back through the recorded history while paused", () => {
    const store = createSceneStore();
    store.getState().setPlaying(true);
    store.getState().setTargetDirection({ x: 20, y: 0 });
    for (let i = 0; i < 30; i++) store.getState().tick(0.01);
    store.getState().setPlaying(false);
    const t0 = store.getState().history[0]!.timeS;
    store.getState().scrub(t0);
    expect(store.getState().scrubS).toBe(t0);
    expect(store.getState().binocular.right.gazeDeg.xDeg).toBeLessThan(5);
    store.getState().setTargetDirection({ x: 0, y: 0 });
    expect(store.getState().scrubS).toBeNull();
  });
});
