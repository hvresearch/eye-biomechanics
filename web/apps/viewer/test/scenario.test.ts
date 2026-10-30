import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCENE_DEFAULTS, type Scenario } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { RESULTS } from "../src/results/catalog";
import { SCENARIOS } from "../src/scenario/catalog";
import { ScenarioError, animatedKeys, parseScenario, sceneAt, scenarioDurationS, scenarioJson, serializeScenario, toSceneState } from "../src/scenario/scenario";
import { DEFAULT_LENS, createSceneStore, eyeOptics } from "../src/store/scene";
import { handle } from "../src/worker/handle";

const DIR = resolve(import.meta.dirname, "../../../../data/scenarios");
const RESULT_IDS = RESULTS.map((r) => r.id);

function base(): Scenario {
  const s = createSceneStore().getState();
  return serializeScenario(s.scenarioInput(), { name: "test", description: "a test scenario" });
}

describe("scenario serialize and parse", () => {
  it("round-trips the scene, both eyes, the prescription, the correction, and the result id", () => {
    const store = createSceneStore();
    store.getState().setRefractivePreset("astigmat-1.5-atr-corneal");
    store.getState().setTarget({ distanceM: 0.5, directionDeg: { x: 5, y: -3 } });
    store.getState().setSpectacles({ ...DEFAULT_LENS, sphereD: 0.25, cylinderD: -1.5, axisDeg: 90 });
    store.getState().setCorrected(true);
    const sc = serializeScenario(store.getState().scenarioInput(), { name: "rt", description: "round trip", timeline: [{ timeS: 0 }, { timeS: 2, scene: { targetDistanceM: null } }] });
    const text = scenarioJson(sc);
    const back = parseScenario(text, RESULT_IDS);
    expect(back).toEqual(sc);
    expect(scenarioJson(back)).toBe(text);
    expect(back.corrected).toBe(true);
    expect(back.prescription?.right).toEqual({ ...DEFAULT_LENS, sphereD: 0.25, cylinderD: -1.5, axisDeg: 90 });
    expect(back.eyes.right).toEqual(store.getState().eyes.right);
  });

  it("writes a target at infinity as null and reads it back as Infinity", () => {
    const store = createSceneStore();
    store.getState().setTargetDistance(Number.POSITIVE_INFINITY);
    const sc = serializeScenario(store.getState().scenarioInput(), { name: "inf", description: "" });
    expect(sc.scene.targetDistanceM).toBeNull();
    expect(scenarioJson(sc)).toContain('"targetDistanceM": null');
    expect(toSceneState(sc.scene, 0).targetDistanceM).toBe(Number.POSITIVE_INFINITY);
  });

  it("names the version, the key path, the preset, and the result id it rejects", () => {
    const sc = base();
    const bad = (doc: unknown) => () => parseScenario(JSON.stringify(doc), RESULT_IDS);
    expect(bad({ ...sc, schemaVersion: "2.0.0" })).toThrow(/2\.0\.0/);
    expect(bad({ ...sc, scene: { ...sc.scene, zoom: 1 } })).toThrow(/\/scene .*'zoom'/);
    expect(bad({ ...sc, scene: { ...sc.scene, preset: "gullstrand" } })).toThrow(/"gullstrand"/);
    expect(bad({ ...sc, result: { id: "no-such-result" } })).toThrow(/"no-such-result"/);
    expect(bad({ ...sc, timeline: [{ timeS: 3 }, { timeS: 1 }] })).toThrow(/\/timeline\/1/);
    expect(() => parseScenario("{", RESULT_IDS)).toThrow(ScenarioError);
  });
});

describe("keyframe interpolation", () => {
  const sc: Scenario = {
    ...base(),
    scene: { ...base().scene, targetDistanceM: 0.25, ageYears: 20 },
    timeline: [
      { timeS: 1, scene: { targetDistanceM: 1 } },
      { timeS: 3, scene: { targetDistanceM: null, ageYears: 60 } },
    ],
  };

  it("starts at the scenario's own scene and holds the last keyframe after the end", () => {
    expect(sceneAt(sc, -1).scene.targetDistanceM).toBe(0.25);
    expect(sceneAt(sc, 0).scene.targetDistanceM).toBe(0.25);
    expect(sceneAt(sc, 10).scene.targetDistanceM).toBeNull();
    expect(sceneAt(sc, 10).scene.ageYears).toBe(60);
    expect(scenarioDurationS(sc)).toBe(3);
  });

  it("interpolates distance in diopters, never producing NaN, and other fields linearly", () => {
    expect(1 / sceneAt(sc, 0.5).scene.targetDistanceM!).toBeCloseTo(2.5, 12); // 4 D → 1 D
    expect(1 / sceneAt(sc, 2).scene.targetDistanceM!).toBeCloseTo(0.5, 12); // 1 D → 0 D
    expect(sceneAt(sc, 1.5).scene.ageYears).toBeCloseTo(20 + 40 * (1.5 / 3), 12);
    for (const t of [0, 0.5, 1, 2.999, 3, Number.NaN]) {
      const d = sceneAt(sc, t).scene.targetDistanceM;
      expect(d === null || Number.isFinite(d)).toBe(true);
    }
  });

  it("is constant with a single keyframe and steps the correction", () => {
    const one: Scenario = { ...sc, timeline: [{ timeS: 2, scene: { ageYears: 40 } }] };
    expect(sceneAt(one, 5).scene.ageYears).toBe(40);
    expect(sceneAt(one, 2).scene.ageYears).toBe(40);
    const rx = { ...DEFAULT_LENS };
    const toggled: Scenario = { ...sc, prescription: { left: rx, right: rx }, timeline: [{ timeS: 1, corrected: true }, { timeS: 2, corrected: false }] };
    expect([0.5, 1, 1.5, 2, 3].map((t) => sceneAt(toggled, t).corrected)).toEqual([false, true, true, false, false]);
    expect(sceneAt({ ...toggled, prescription: null }, 1.5).corrected).toBe(false);
    expect(animatedKeys(sc)).toEqual(["targetDistanceM", "ageYears"]);
  });
});

describe("scenario playback in the store", () => {
  it("drives the scene from the timeline while playing", async () => {
    const store = createSceneStore();
    const sc: Scenario = { ...base(), timeline: [{ timeS: 0, scene: { targetDistanceM: 0.33 } }, { timeS: 1, scene: { targetDistanceM: 6 } }] };
    await store.getState().loadScenario(sc);
    expect(store.getState().scene.targetDistanceM).toBeCloseTo(0.33, 12);
    store.getState().setPlaying(true);
    for (let i = 0; i < 30; i++) store.getState().tick(0.05);
    expect(store.getState().scene.targetDistanceM).toBe(6);
    store.getState().restartScenario();
    expect(store.getState().scene.targetDistanceM).toBeCloseTo(0.33, 12);
  });

  it("refuses a scenario whose result entry is missing, changing nothing", async () => {
    const store = createSceneStore();
    const before = store.getState().eyes;
    await store.getState().loadScenario({ ...base(), result: { id: "missing" } });
    expect(store.getState().loadError).toMatch(/"missing"/);
    expect(store.getState().eyes).toBe(before);
    expect(store.getState().scenario).toBeNull();
  });
});

/** Build the four bundled scenarios (spec §6.5) from the store; `WRITE_SCENARIOS=1` rewrites the files. */
async function buildScenarios(): Promise<Record<string, Scenario>> {
  const out: Record<string, Scenario> = {};

  const refocus = createSceneStore();
  refocus.getState().setRefractivePreset("emmetrope");
  refocus.getState().setAge(25);
  refocus.getState().setTargetDistance(0.33);
  out["near-to-far-refocus"] = serializeScenario(refocus.getState().scenarioInput(), {
    name: "Near-to-far refocus",
    description:
      "An emmetrope aged 25 looks from a 0.33 m target to one at 6 m and back. Play the transport: vergence and accommodation follow the target with their latencies and time constants.",
    timeline: [
      { timeS: 0, scene: { targetDistanceM: 0.33 } },
      { timeS: 1, scene: { targetDistanceM: 0.33 } },
      { timeS: 1.05, scene: { targetDistanceM: 6 } },
      { timeS: 4, scene: { targetDistanceM: 6 } },
      { timeS: 4.05, scene: { targetDistanceM: 0.33 } },
      { timeS: 7, scene: { targetDistanceM: 0.33 } },
    ],
  });

  const presby = createSceneStore();
  presby.getState().setRefractivePreset("emmetrope");
  presby.getState().setAge(20);
  presby.getState().setTargetDistance(0.4);
  out["presbyopia-20-to-60"] = serializeScenario(presby.getState().scenarioInput(), {
    name: "Presbyopia 20 to 60",
    description:
      "An emmetrope reading at 0.4 m while the subject's age sweeps from 20 to 60 years over 12 s of playback. The eye is re-derived at each age (accommodative amplitude and pupil from their age tables); no growth or remodeling is involved. The accommodation readout clips to the amplitude once it falls below the 2.5 D demand.",
    timeline: [
      { timeS: 0, scene: { ageYears: 20 } },
      { timeS: 12, scene: { ageYears: 60 } },
    ],
  });

  const astig = createSceneStore();
  astig.getState().setRefractivePreset("astigmat-1.5-atr-corneal");
  astig.getState().setTargetDistance(SCENE_DEFAULTS.targetDistanceM);
  const s = astig.getState();
  const b = s.binocular.right;
  const res = handle({
    id: 1,
    eyes: [
      {
        side: "right",
        params: s.eyes.right,
        accommodationD: b.accommodationD,
        amplitudeD: b.amplitudeD,
        objectDistanceM: b.targetDistanceM,
        pupilSemiDiamMm: b.pupilMm / 2,
        fanRays: 0,
        wave: { gridN: 64, psfN: 64, polychromatic: false, letterArcmin: 5, autoPrescribe: true },
      },
    ],
  });
  const auto = eyeOptics(res, "right")?.wave?.autoRx;
  if (!auto) throw new Error("no auto-prescription for the astigmat");
  const { residualRmsMicrons: _r, ...lens } = auto;
  s.setSpectacles(lens);
  out["astigmat-corrected-vs-uncorrected"] = serializeScenario(astig.getState().scenarioInput(), {
    name: "Astigmat corrected vs uncorrected",
    description:
      "The 1.5 D against-the-rule corneal astigmat with its auto-prescribed spectacles, worn and removed every 3 s of playback. Compare the cylinder readout and the retinal image corrected and uncorrected.",
    timeline: [
      { timeS: 0, corrected: false },
      { timeS: 3, corrected: true },
      { timeS: 6, corrected: false },
      { timeS: 9, corrected: true },
    ],
  });

  const fem = createSceneStore();
  const entry = RESULTS.find((r) => r.id === "emmetrope-right-primary-15mmHg");
  if (!entry) throw new Error("the committed FEM result is missing");
  await fem.getState().loadResult(entry);
  out["fem-result-loaded"] = serializeScenario(fem.getState().scenarioInput(), {
    name: "Biomechanics result loaded",
    description:
      "The committed elastic FEM result (Navarro 1985 eye, primary gaze, IOP 15 mmHg, muscles and lids) in the right eye, with the displacement heat map. The induced sphere and cylinder are relative to the IOP-only state.",
  });
  return out;
}

describe("bundled scenarios", async () => {
  const built = await buildScenarios();
  if (process.env.WRITE_SCENARIOS === "1") {
    for (const [name, sc] of Object.entries(built)) writeFileSync(resolve(DIR, `${name}.json`), scenarioJson(sc));
  }

  it.each(Object.keys(built))("%s is committed as built from the current code", (name) => {
    const path = resolve(DIR, `${name}.json`);
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(parseScenario(text, RESULT_IDS)).toEqual(built[name]);
  });

  it("are all in the viewer's catalog", () => {
    expect(SCENARIOS.map((s) => s.id).sort()).toEqual(Object.keys(built).sort());
    for (const s of SCENARIOS) expect(() => parseScenario(s.text, RESULT_IDS)).not.toThrow();
  });

  it("change what they are meant to change", () => {
    const refocus = built["near-to-far-refocus"]!;
    expect(sceneAt(refocus, 2).scene.targetDistanceM).toBe(6);
    const presby = built["presbyopia-20-to-60"]!;
    expect(sceneAt(presby, 12).scene.ageYears).toBe(60);
    const astig = built["astigmat-corrected-vs-uncorrected"]!;
    expect(astig.prescription?.right.cylinderD).toBeLessThan(-1);
    expect(sceneAt(astig, 4).corrected).toBe(true);
    expect(built["fem-result-loaded"]!.result?.id).toBe("emmetrope-right-primary-15mmHg");
    expect(built["fem-result-loaded"]!.eyes.right.id).not.toBe("emmetrope-right-primary-15mmHg");
  });
});
