import { MIN_TARGET_DISTANCE_M, loadPreset } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { DEFAULT_LENS, MAX_DIRECTION_DEG, autoRxKey, clampDirectionDeg, createSceneStore, eyeOptics, mirrorLens } from "../src/store/scene";
import { handle } from "../src/worker/handle";

describe("scene store", () => {
  it("clamps the target distance once and stores the clamped value", () => {
    const store = createSceneStore();
    store.getState().setTargetDistance(0);
    expect(store.getState().scene.targetDistanceM).toBe(MIN_TARGET_DISTANCE_M);
    store.getState().setTargetDistance(Number.NaN);
    expect(store.getState().scene.targetDistanceM).toBe(MIN_TARGET_DISTANCE_M);
  });

  it("clamps target directions to the inspector's range, from a drag or a field", () => {
    const store = createSceneStore();
    store.getState().setTarget({ distanceM: 1, directionDeg: { x: 70, y: -55 } });
    expect(store.getState().scene.targetDirectionDeg).toEqual({ x: MAX_DIRECTION_DEG, y: -MAX_DIRECTION_DEG });
    store.getState().setTargetDirection({ x: -41, y: 12 });
    expect(store.getState().scene.targetDirectionDeg).toEqual({ x: -MAX_DIRECTION_DEG, y: 12 });
    expect(clampDirectionDeg({ x: Number.NaN, y: 3 })).toEqual({ x: 0, y: 3 });
  });

  it("applies a refractive preset to the right eye and its mirror to the left", () => {
    const store = createSceneStore();
    store.getState().setRefractivePreset("astigmat-1.5-atr-corneal");
    const { eyes, decomposition, refractivePreset } = store.getState();
    expect(refractivePreset).toBe("astigmat-1.5-atr-corneal");
    expect(eyes.right.surfaces[0]?.type).toBe("toric");
    expect(eyes.left.surfaces[0]).toEqual(eyes.right.surfaces[0]);
    expect(eyes.left.id).toMatch(/-left$/);
    expect(decomposition?.cylinderCornealD).toBeCloseTo(-1.5, 3);
    store.getState().setRefractivePreset("presbyope-55");
    expect(store.getState().scene.ageYears).toBe(55);
  });

  it("changes the pupil with luminance", () => {
    const store = createSceneStore();
    const before = store.getState().binocular.right.pupilMm;
    store.getState().setLuminance(1000);
    expect(store.getState().binocular.right.pupilMm).toBeLessThan(before);
  });

  it("keeps the left lens the mirror of the right and removes correction with the lens", () => {
    const store = createSceneStore();
    store.getState().setSpectacles({ ...DEFAULT_LENS, sphereD: -1, cylinderD: -0.5, axisDeg: 30 });
    expect(store.getState().spectacles?.left.axisDeg).toBe(150);
    expect(mirrorLens({ ...DEFAULT_LENS, axisDeg: 180 }).axisDeg).toBe(180);
    store.getState().setCorrected(true);
    expect(store.getState().corrected).toBe(true);
    store.getState().setSpectacles(null);
    expect(store.getState().corrected).toBe(false);
    store.getState().setCorrected(true);
    expect(store.getState().corrected).toBe(false);
  });

  it("copies the auto-prescription into the spectacles and keeps it on later responses", () => {
    const store = createSceneStore();
    const eye = loadPreset("navarro-1985");
    const autoRx = { ...DEFAULT_LENS, sphereD: -2.25, cylinderD: -0.5, axisDeg: 90, residualRmsMicrons: 0.02 };
    const res = handle({
      id: 1,
      eyes: [{ side: "right", params: eye, accommodationD: 0, objectDistanceM: 6, pupilSemiDiamMm: 1.5, fanRays: 0, wave: { gridN: 16, psfN: 64, polychromatic: false, letterArcmin: 5, autoPrescribe: false } }],
    });
    const withAuto = { ...res, eyes: res.eyes.map((e) => ({ ...e, wave: e.wave ? { ...e.wave, autoRx } : null })) };
    store.getState().requestAutoPrescribe();
    expect(store.getState().autoPending).toBe(true);
    store.getState().applyOptics(withAuto);
    expect(store.getState().autoPending).toBe(false);
    store.getState().applyOptics(res);
    store.getState().useAutoRx();
    expect(store.getState().spectacles?.right).toEqual({ ...DEFAULT_LENS, sphereD: -2.25, cylinderD: -0.5, axisDeg: 90 });
  });

  describe("a kept auto-prescription belongs to the eye, scene, and lens design it was computed for", () => {
    const eye = loadPreset("navarro-1985");
    const autoRx = { ...DEFAULT_LENS, sphereD: -2.25, cylinderD: -0.5, axisDeg: 90, residualRmsMicrons: 0.02 };
    const res = handle({
      id: 1,
      eyes: [{ side: "right", params: eye, accommodationD: 0, objectDistanceM: 6, pupilSemiDiamMm: 1.5, fanRays: 0, wave: { gridN: 16, psfN: 64, polychromatic: false, letterArcmin: 5, autoPrescribe: false } }],
    });
    const withAuto = { ...res, eyes: res.eyes.map((e) => ({ ...e, wave: e.wave ? { ...e.wave, autoRx } : null })) };
    const shown = (store: ReturnType<typeof createSceneStore>) => eyeOptics(store.getState().optics, "right")?.wave?.autoRx ?? null;
    const prescribed = () => {
      const store = createSceneStore();
      store.getState().requestAutoPrescribe();
      store.getState().applyOptics(withAuto);
      expect(shown(store)).not.toBeNull();
      return store;
    };

    it("is dropped when the eye changes and cannot be applied to the new eye", () => {
      const store = prescribed();
      store.getState().setRefractivePreset("myope-3-axial");
      expect(shown(store)).toBeNull();
      store.getState().applyOptics(res);
      expect(shown(store)).toBeNull();
      store.getState().useAutoRx();
      expect(store.getState().spectacles).toBeNull();
    });

    it("is dropped when the scene changes", () => {
      const store = prescribed();
      store.getState().setTargetDistance(0.5);
      expect(shown(store)).toBeNull();
    });

    it("is dropped when the lens design changes, but not when only its powers change", () => {
      const store = prescribed();
      store.getState().setSpectacles({ ...DEFAULT_LENS, sphereD: -1 });
      expect(shown(store)).not.toBeNull();
      store.getState().setSpectacles({ ...DEFAULT_LENS, sphereD: -1, vertexMm: DEFAULT_LENS.vertexMm + 2 });
      expect(shown(store)).toBeNull();
    });

    it("ignores an auto-prescription that arrives for inputs that have since changed", () => {
      const store = createSceneStore();
      store.getState().requestAutoPrescribe();
      const key = autoRxKey(store.getState());
      store.getState().setRefractivePreset("myope-3-axial");
      store.getState().applyOptics(withAuto, key);
      expect(shown(store)).toBeNull();
      // Still owed: the next request asks again for the new eye.
      expect(store.getState().autoPending).toBe(true);
    });
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

describe("biomechanics results in the store", () => {
  it("loads a result into the right eye and restores the preset on clear", async () => {
    const { RESULTS } = await import("../src/results/catalog");
    const store = createSceneStore();
    const before = store.getState().eyes.right;
    const entry = RESULTS.find((r) => r.id === "emmetrope-right-primary-15mmHg")!;
    await store.getState().loadResult(entry);
    const s = store.getState();
    expect(s.loadError).toBeNull();
    expect(s.loadedResult?.id).toBe(entry.id);
    expect(s.eyes.right.id).toBe("navarro-1985-relaxed-fem");
    expect(s.loadedResult?.deformation?.maxUm).toBeGreaterThan(0);
    store.getState().clearLoadedResult();
    expect(store.getState().loadedResult).toBeNull();
    expect(store.getState().eyes.right).toEqual(before);
  });

  it("clamps the exaggeration to 1–200", () => {
    const store = createSceneStore();
    store.getState().setExaggeration(500);
    expect(store.getState().exaggeration).toBe(200);
    store.getState().setExaggeration(0);
    expect(store.getState().exaggeration).toBe(1);
    store.getState().setExaggeration(Number.NaN);
    expect(store.getState().exaggeration).toBe(1);
  });

  it("reports a bad file without touching the eyes", async () => {
    const store = createSceneStore();
    const before = store.getState().eyes;
    await store.getState().loadEyeFiles([new File([JSON.stringify({ schemaVersion: "2.0.0" })], "x.eye.json")]);
    expect(store.getState().loadError).toMatch(/2\.0\.0/);
    expect(store.getState().eyes).toBe(before);
  });
});
