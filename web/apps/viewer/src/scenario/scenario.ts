import {
  PRESET_NAMES,
  validateScenario,
  type PresetName,
  type Scenario,
  type ScenarioKeyframe,
  type ScenarioScene,
  type SceneState,
} from "@eye/eye-model";
import type { Eyes, LoadedResult } from "../store/scene";
import type { ClinicalLens } from "../worker/messages";

/** The scenario format this build writes. */
export const SCENARIO_VERSION = "1.0.0";

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioError";
  }
}

/** What a scenario captures from the viewer's state. */
export interface ScenarioInput {
  scene: SceneState;
  eyes: Eyes;
  spectacles: { right: ClinicalLens; left: ClinicalLens } | null;
  corrected: boolean;
  loadedResult: Pick<LoadedResult, "id"> | null;
}

const lensOf = (l: ClinicalLens) => ({
  sphereD: l.sphereD,
  cylinderD: l.cylinderD,
  axisDeg: l.axisDeg,
  vertexMm: l.vertexMm,
  baseCurveD: l.baseCurveD,
  index: l.index,
  centerThicknessMm: l.centerThicknessMm,
});

const distanceOut = (m: number) => (Number.isFinite(m) ? m : null);

/** The viewer state as a Scenario document (spec §6.5), with a fixed key order. */
export function serializeScenario(s: ScenarioInput, meta: { name: string; description: string; timeline?: ScenarioKeyframe[] }): Scenario {
  return {
    schemaVersion: SCENARIO_VERSION,
    name: meta.name,
    description: meta.description,
    scene: {
      targetDistanceM: distanceOut(s.scene.targetDistanceM),
      targetDirectionDeg: { x: s.scene.targetDirectionDeg.x, y: s.scene.targetDirectionDeg.y },
      luminanceCdM2: s.scene.luminanceCdM2,
      ageYears: s.scene.ageYears,
      ipdMm: s.scene.ipdMm,
      preset: s.scene.preset,
    },
    eyes: { left: s.eyes.left, right: s.eyes.right },
    prescription: s.spectacles ? { left: lensOf(s.spectacles.left), right: lensOf(s.spectacles.right) } : null,
    corrected: s.corrected && s.spectacles !== null,
    result: s.loadedResult ? { id: s.loadedResult.id } : null,
    timeline: meta.timeline ?? [],
  };
}

/** The file text of a scenario: two-space indent and a trailing newline. */
export function scenarioJson(sc: Scenario): string {
  return `${JSON.stringify(sc, null, 2)}\n`;
}

/**
 * Parse and check a scenario file: JSON, the schema (with the embedded EyeParameters), a
 * schematic preset this build has, and a biomechanics result the catalog holds. Throws
 * ScenarioError naming the version, key path, preset, or result id.
 */
export function parseScenario(text: string, resultIds: readonly string[]): Scenario {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new ScenarioError(`The scenario is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const r = validateScenario(doc);
  if (!r.ok) throw new ScenarioError(`The scenario is invalid: ${r.errors.join("; ")}`);
  const sc = r.value;
  if (!(PRESET_NAMES as readonly string[]).includes(sc.scene.preset)) {
    throw new ScenarioError(`The scenario names an unknown schematic eye "${sc.scene.preset}" (this build has ${PRESET_NAMES.join(", ")})`);
  }
  if (sc.result !== null && !resultIds.includes(sc.result.id)) {
    throw new ScenarioError(`The scenario names a biomechanics result "${sc.result.id}" that this build does not have`);
  }
  return sc;
}

type Animated = "targetDistanceM" | "targetDirectionDeg" | "luminanceCdM2" | "ageYears";
const ANIMATED: readonly Animated[] = ["targetDistanceM", "targetDirectionDeg", "luminanceCdM2", "ageYears"];

/** The scene fields some keyframe sets (the ones playback drives). */
export function animatedKeys(sc: Scenario): Animated[] {
  return ANIMATED.filter((k) => sc.timeline.some((f) => f.scene?.[k] !== undefined));
}

/** One field's keys: the scenario's own scene at t = 0 unless a keyframe at 0 sets it. */
function track<T>(sc: Scenario, get: (s: Partial<ScenarioScene>) => T | undefined): Array<{ t: number; v: T }> {
  const keys: Array<{ t: number; v: T }> = [];
  for (const f of sc.timeline) {
    const v = f.scene ? get(f.scene) : undefined;
    if (v !== undefined) keys.push({ t: f.timeS, v });
  }
  if (!keys.some((k) => k.t === 0)) keys.unshift({ t: 0, v: get(sc.scene) as T });
  return keys;
}

/** Piecewise-linear in `map` space between keys, held constant outside them. */
function interpolate<T>(keys: Array<{ t: number; v: T }>, t: number, lerp: (a: T, b: T, u: number) => T): T {
  const first = keys[0]!;
  if (t <= first.t) return first.v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (t <= b.t) return b.t === a.t ? b.v : lerp(a.v, b.v, (t - a.t) / (b.t - a.t));
  }
  return keys[keys.length - 1]!.v;
}

const num = (a: number, b: number, u: number) => a + (b - a) * u;
/** Distances interpolate in vergence (diopters): 1/d, with infinity at 0 D. */
const diopters = (m: number | null) => (m === null ? 0 : 1 / m);
const meters = (d: number) => (d <= 0 ? null : 1 / d);

/** The scene and correction a scenario's timeline gives at a playback time (seconds). */
export function sceneAt(sc: Scenario, timeS: number): { scene: ScenarioScene; corrected: boolean } {
  const t = Number.isFinite(timeS) ? timeS : 0;
  const distance = interpolate(track(sc, (s) => s.targetDistanceM), t, (a, b, u) => meters(num(diopters(a), diopters(b), u)));
  const direction = interpolate(track(sc, (s) => s.targetDirectionDeg), t, (a, b, u) => ({ x: num(a.x, b.x, u), y: num(a.y, b.y, u) }));
  const luminance = interpolate(track(sc, (s) => s.luminanceCdM2), t, num);
  const age = interpolate(track(sc, (s) => s.ageYears), t, num);
  let corrected = sc.corrected;
  for (const f of sc.timeline) if (f.timeS <= t && f.corrected !== undefined) corrected = f.corrected;
  return {
    scene: { ...sc.scene, targetDistanceM: distance, targetDirectionDeg: direction, luminanceCdM2: luminance, ageYears: age },
    corrected: corrected && sc.prescription !== null,
  };
}

/** The scene state for a scenario scene; a null distance is a target at infinity. */
export function toSceneState(s: ScenarioScene, timeS: number): SceneState {
  return {
    targetDistanceM: s.targetDistanceM ?? Number.POSITIVE_INFINITY,
    targetDirectionDeg: { x: s.targetDirectionDeg.x, y: s.targetDirectionDeg.y },
    luminanceCdM2: s.luminanceCdM2,
    ageYears: s.ageYears,
    ipdMm: s.ipdMm,
    timeS,
    preset: s.preset as PresetName,
  };
}

/** The last keyframe's time: how long a scenario's timeline runs. */
export function scenarioDurationS(sc: Scenario): number {
  return sc.timeline.reduce((m, f) => Math.max(m, f.timeS), 0);
}
