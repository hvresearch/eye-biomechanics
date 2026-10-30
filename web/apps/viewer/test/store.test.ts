import { MIN_TARGET_DISTANCE_M, loadPreset } from "@eye/eye-model";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LENS, MAX_DIRECTION_DEG, MAX_PINS, WAVE_REQUEST, autoRxKey, clampDirectionDeg, createSceneStore, eyeOptics, mirrorLens } from "../src/store/scene";
import { handle } from "../src/worker/handle";
import { runEyesJob, type EyesJob, type EyesJobResult } from "../src/worker/jobs";
import { synthetic } from "./syntheticGrid";

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

  it("applies a refractive preset to the right eye and its mirror to the left", async () => {
    const store = createSceneStore();
    await store.getState().setRefractivePreset("astigmat-1.5-atr-corneal");
    const { eyes, decomposition, refractivePreset } = store.getState();
    expect(refractivePreset).toBe("astigmat-1.5-atr-corneal");
    expect(eyes.right.surfaces[0]?.type).toBe("toric");
    expect(eyes.left.surfaces[0]).toEqual(eyes.right.surfaces[0]);
    expect(eyes.left.id).toMatch(/-left$/);
    expect(decomposition?.cylinderCornealD).toBeCloseTo(-1.5, 3);
    await store.getState().setRefractivePreset("presbyope-55");
    expect(store.getState().scene.ageYears).toBe(55);
  });

  it("solves presets and the decomposition in the worker and applies them when they return", async () => {
    const jobs: Array<{ job: EyesJob; resolve: () => void }> = [];
    const store = createSceneStore({
      runJob: (job) => new Promise<EyesJobResult>((resolve) => jobs.push({ job, resolve: () => resolve(runEyesJob(job)) })),
    });
    // The starting decomposition is a worker job too.
    await Promise.resolve();
    expect(jobs.map((j) => j.job.kind)).toEqual(["decomposition"]);
    expect(store.getState().decomposition).toBeNull();
    jobs[0]!.resolve();
    await vi.waitFor(() => expect(store.getState().decomposition).not.toBeNull());
    const before = store.getState().eyes;
    const myope = store.getState().setRefractivePreset("myope-3-axial");
    const astigmat = store.getState().setRefractivePreset("astigmat-1.5-atr-corneal");
    // Nothing changes until the worker answers.
    expect(store.getState().eyes).toBe(before);
    expect(store.getState().refractivePreset).toBe("emmetrope");
    expect(jobs.slice(1).map((j) => j.job)).toEqual([
      { kind: "preset", schematic: "navarro-1985", refractive: "myope-3-axial" },
      { kind: "preset", schematic: "navarro-1985", refractive: "astigmat-1.5-atr-corneal" },
    ]);
    // The newer job wins even when the older one returns last.
    jobs[2]!.resolve();
    await astigmat;
    jobs[1]!.resolve();
    await myope;
    expect(store.getState().refractivePreset).toBe("astigmat-1.5-atr-corneal");
    expect(store.getState().eyes.right.surfaces[0]?.type).toBe("toric");
    expect(store.getState().decomposition?.cylinderCornealD).toBeCloseTo(-1.5, 3);
  });

  it("does not call the paraxial preset solvers from the store", () => {
    const src = readFileSync(resolve(import.meta.dirname, "../src/store/scene.ts"), "utf8");
    for (const fn of ["applyRefractivePreset", "applyRefraction", "decomposeRefraction"]) expect(src).not.toContain(fn);
  });

  it("draws the Snellen E at the data file's 20/20 size", () => {
    const optotypes = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../data/acuity/optotypes.json"), "utf8")) as { letterArcminAt20_20: number };
    expect(WAVE_REQUEST.letterArcmin).toBe(optotypes.letterArcminAt20_20);
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

    it("is dropped when the eye changes and cannot be applied to the new eye", async () => {
      const store = prescribed();
      await store.getState().setRefractivePreset("myope-3-axial");
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

    it("ignores an auto-prescription that arrives for inputs that have since changed", async () => {
      const store = createSceneStore();
      store.getState().requestAutoPrescribe();
      const key = autoRxKey(store.getState());
      await store.getState().setRefractivePreset("myope-3-axial");
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

  it("uses the relaxed far point from the worker for demand (the emmetropic preset's minimum-RMS far point)", () => {
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
    // The paraxially emmetropic schematic eye reads about −0.37 D by minimum-RMS refraction at
    // a 4 mm pupil (spherical aberration), the measure auto-prescribe zeroes.
    expect(fp).toBeLessThan(-0.2);
    expect(fp).toBeGreaterThan(-0.6);
    expect(s.farPointD.right).toBe(fp);
    expect(s.staticBinocular.right.demandD).toBeCloseTo(Math.max(0, 1 / Math.hypot(6, s.scene.ipdMm / 2000) + fp), 12);
    // At 6 m the eye accommodates about 0.17 D before the far point is known, so the accommodated power sits just above relaxed.
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
    await store.getState().clearLoadedResult();
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

describe("the prediction timeline in the store", () => {
  it("computes a trajectory when the grid and profile are set", () => {
    const store = createSceneStore();
    expect(store.getState().prediction.trajectory).toBeNull();
    store.getState().setPredictionGrid(synthetic());
    store.getState().setPredictionProfile({ nearHours: 4, baselineSphereD: 0, baselineCylinderD: 0 });
    const t = store.getState().prediction.trajectory!;
    expect(t.sphere.p50[2]).toBeCloseTo((4 * 84) / 100, 10);
    store.getState().setPredictionProfile({ nearHours: Number.NaN });
    expect(store.getState().prediction.profile.nearHours).toBe(4);
  });

  it("applies the prediction to the right eye's cornea, follows the age, and restores the preset when cleared", async () => {
    const store = createSceneStore();
    const before = store.getState().eyes;
    store.getState().setPredictionGrid(synthetic());
    store.getState().setPredictionProfile({ nearHours: 4, baselineSphereD: 0, baselineCylinderD: -1 });
    await store.getState().setAge(40);
    await store.getState().setPredictionApplied(true);
    const s = store.getState();
    expect(s.prediction.applied).toBe(true);
    expect(s.paramError).toBeNull();
    const cornea = s.eyes.right.surfaces[0]!;
    expect(cornea.type).toBe("toric");
    expect(s.eyes.right.surfaces.slice(1)).toEqual(before.right.surfaces.slice(1));
    expect(s.eyes.left.surfaces[0]).toEqual(cornea);
    // At 40 the median is +1.36 −1.68 × 180: the decomposition sees it all in the cornea.
    expect(s.decomposition?.cylinderCornealD).toBeCloseTo(-1.68, 2);
    await store.getState().setAge(90);
    expect(store.getState().eyes.right.surfaces[0]).not.toEqual(cornea);
    expect(store.getState().decomposition?.cylinderCornealD).toBeCloseTo(-2.68, 2);
    await store.getState().setPredictionApplied(false);
    expect(store.getState().prediction.applied).toBe(false);
    expect(store.getState().eyes.right).toEqual(before.right);
  });

  it("restores the eyes from before the prediction when a result loaded over it is cleared", async () => {
    const { RESULTS } = await import("../src/results/catalog");
    const store = createSceneStore();
    const before = store.getState().eyes;
    store.getState().setPredictionGrid(synthetic());
    store.getState().setPredictionProfile({ nearHours: 4, baselineSphereD: 0, baselineCylinderD: -1 });
    await store.getState().setPredictionApplied(true);
    expect(store.getState().eyes.right).not.toEqual(before.right);
    await store.getState().loadResult(RESULTS.find((r) => r.id === "emmetrope-right-primary-15mmHg")!);
    expect(store.getState().prediction.applied).toBe(false);
    // The left eye drops the prediction too (it mirrored the predicted cornea).
    expect(store.getState().eyes.left).toEqual(before.left);
    await store.getState().clearLoadedResult();
    const s = store.getState();
    expect(s.loadedResult).toBeNull();
    expect(s.prediction.applied).toBe(false);
    expect(s.eyes.right).toEqual(before.right);
    expect(s.eyes.left).toEqual(before.left);
    // Nothing stale: switching the (already off) prediction off again changes nothing.
    await store.getState().setPredictionApplied(false);
    expect(store.getState().eyes.right).toEqual(before.right);
  });

  it("stops applying the prediction when a refractive preset is chosen", async () => {
    const store = createSceneStore();
    store.getState().setPredictionGrid(synthetic());
    await store.getState().setPredictionApplied(true);
    expect(store.getState().prediction.applied).toBe(true);
    await store.getState().setRefractivePreset("emmetrope");
    expect(store.getState().prediction.applied).toBe(false);
  });
});

describe("stage controls in the store", () => {
  it("pins up to four distinct readouts and unpins them", () => {
    const store = createSceneStore();
    const lens = { kind: "structure", key: "lens", side: "right" } as const;
    store.getState().setPinned(lens, true);
    store.getState().setPinned({ ...lens }, true);
    expect(store.getState().pinned).toHaveLength(1);
    for (let i = 0; i < 6; i++) store.getState().setPinned({ kind: "muscle", side: "left", index: i }, true);
    const pinned = store.getState().pinned;
    expect(pinned).toHaveLength(MAX_PINS);
    // The oldest pins give way to the newest.
    expect(pinned[pinned.length - 1]).toEqual({ kind: "muscle", side: "left", index: 5 });
    store.getState().setPinned({ kind: "muscle", side: "left", index: 5 }, false);
    expect(store.getState().pinned).toHaveLength(MAX_PINS - 1);
    store.getState().unpinAll();
    expect(store.getState().pinned).toEqual([]);
  });

  it("snaps the camera, and the sagittal view cuts the eye sagittally", () => {
    const store = createSceneStore();
    expect(store.getState().view).toBeNull();
    store.getState().setView("anterior");
    expect(store.getState().view).toBe("anterior");
    store.getState().setView("sagittal");
    expect(store.getState().cut.orientation).toBe("sagittal");
  });

  it("clamps the cut depth to half the axial length", () => {
    const store = createSceneStore();
    store.getState().setCut({ depthMm: 100 });
    expect(store.getState().cut.depthMm).toBeCloseTo(store.getState().eyes.right.axialLengthMm / 2, 12);
    store.getState().setCut({ side: "left", orientation: "frontal" });
    expect(store.getState().cut).toMatchObject({ side: "left", orientation: "frontal" });
  });
});
