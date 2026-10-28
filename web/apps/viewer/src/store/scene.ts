import {
  MIN_TARGET_DISTANCE_M,
  PRESET_NAMES,
  REFRACTIVE_PRESETS,
  applyRefractivePreset,
  decomposeRefraction,
  mirrorEye,
  type Decomposition,
  defaultScene,
  deriveBinocular,
  dynamicTargetsFromDirections,
  eyeDirections,
  initialDynamics,
  loadPreset,
  stepDynamics,
  type BinocularState,
  type DynamicState,
  type DynamicTargets,
  type EyeParameters,
  type PerEye,
  type PresetName,
  type SceneState,
} from "@eye/eye-model";
import { SPECTACLE_DEFAULTS, paraxialPower, type Surface } from "@eye/optics";
import { create } from "zustand";
import { OpticsClient, StaleRequestError } from "../worker/client";
import type { ClinicalLens, EyeOptics, OpticsRequest, OpticsResponse, WaveRequest } from "../worker/messages";
import { throttle } from "./throttle";

export const DEFAULT_PRESET: PresetName = "navarro-1985";
/** Rays in the drawn fan of the cutaway (right) eye; odd so the chief ray is included. A drawing choice. */
export const FAN_RAYS = 15;
/**
 * Wave optics of the right (cutaway) eye: the spec's 64 × 64 pupil grid and 256 PSF grid, at
 * 555 nm, with a 20/20 Snellen E (5 arcmin) as the retinal-image target.
 */
export const WAVE_REQUEST: WaveRequest = { gridN: 64, psfN: 256, polychromatic: false, letterArcmin: 5, autoPrescribe: false };
/** Minimum interval between worker requests while inputs change, ms (one frame). */
const REQUEST_INTERVAL_MS = 16;
/** Target directions span the comfortable oculomotor range, degrees (a UI bound, not physiology). */
export const MAX_DIRECTION_DEG = 40;
/** Seconds of oculomotor history kept for scrubbing. A UI choice. */
export const HISTORY_S = 20;
/** Longest step the animation takes in one frame, s (a backgrounded tab must not jump). */
const MAX_TICK_S = 0.1;

export type Side = "left" | "right";
export type Eyes = { left: EyeParameters; right: EyeParameters };

export interface HistorySample {
  timeS: number;
  version: DynamicState["version"];
  vergenceDeg: number;
  verticalVergenceDeg: number;
  accommodationD: PerEye;
}

/** Paraxial far point in one meridian, for presets and the decomposition (main thread; well under 1 ms per call). */
export const farPointOf = (s: Surface[], meridianDeg = 0) => paraxialPower(s, 1, { meridianDeg }).farPointD;

/** A plano lens with the default design, the starting point of the Spectacles panel. */
export const DEFAULT_LENS: ClinicalLens = {
  sphereD: 0,
  cylinderD: 0,
  axisDeg: 180,
  vertexMm: SPECTACLE_DEFAULTS.vertexMm,
  baseCurveD: SPECTACLE_DEFAULTS.baseCurveD,
  index: SPECTACLE_DEFAULTS.index,
  centerThicknessMm: SPECTACLE_DEFAULTS.centerThicknessMm,
};

/** The left eye's copy of a right-eye lens: the mirror image has its TABO axis at 180° minus the right's. */
export function mirrorLens(lens: ClinicalLens): ClinicalLens {
  const axis = 180 - lens.axisDeg;
  return { ...lens, axisDeg: axis <= 0 ? axis + 180 : axis };
}

export type PsfScale = "linear" | "log";

export type Hover = { kind: "structure"; label: string } | { kind: "muscle"; side: Side; index: number };

export interface SceneStore {
  scene: SceneState;
  eyes: Eyes;
  /** Each eye's relaxed far point from the last worker response (0 until then). */
  farPointD: PerEye;
  /** Where the eyes are headed: the static fixation of the target. */
  staticBinocular: BinocularState;
  /** What is shown: static when paused, the dynamics while playing, a history sample while scrubbing. */
  binocular: BinocularState;
  optics: OpticsResponse | null;
  pending: boolean;
  /** Invalid document or parameter (kept until the parameters change). */
  paramError: string | null;
  /** Optics worker failure (kept until the next worker success). */
  workerError: string | null;
  dynamics: DynamicState;
  playing: boolean;
  history: HistorySample[];
  scrubS: number | null;
  hovered: Hover | null;
  setTargetDistance: (m: number) => void;
  setTargetDirection: (deg: { x: number; y: number }) => void;
  /** Distance and direction at once (dragging the target in the stage). */
  setTarget: (t: { distanceM: number; directionDeg: { x: number; y: number } }) => void;
  setAge: (years: number) => void;
  setIpd: (mm: number) => void;
  setPreset: (name: PresetName) => void;
  /** Refractive-error preset applied to the schematic eye (right eye; the left is its mirror). */
  refractivePreset: string;
  setRefractivePreset: (name: string) => void;
  /** Copy the right eye's document and lens to the left eye, mirrored. */
  mirrorRightToLeft: () => void;
  setLuminance: (cdM2: number) => void;
  /** Corneal, lenticular, and axial parts of the right eye's refraction (paraxial). */
  decomposition: Decomposition | null;
  spectacles: { right: ClinicalLens; left: ClinicalLens } | null;
  /** Set the right eye's lens (the left gets its mirror), or remove the spectacles. */
  setSpectacles: (lens: ClinicalLens | null) => void;
  /** Whether the spectacles are worn (they then drive the defocus, demand, and drawn rays). */
  corrected: boolean;
  setCorrected: (on: boolean) => void;
  /** An auto-prescription has been asked for and not yet returned. */
  autoPending: boolean;
  requestAutoPrescribe: () => void;
  /** Copy the right eye's auto-prescription into the spectacles. */
  useAutoRx: () => void;
  psfScale: PsfScale;
  setPsfScale: (s: PsfScale) => void;
  polychromatic: boolean;
  setPolychromatic: (on: boolean) => void;
  setPlaying: (on: boolean) => void;
  tick: (dtS: number) => void;
  scrub: (timeS: number | null) => void;
  setHovered: (h: Hover | null) => void;
  /**
   * Show a worker response. `key` is `autoRxKey` of the state the request was made from; an
   * auto-prescription computed for inputs that have changed since is dropped.
   */
  applyOptics: (res: OpticsResponse, key?: string) => void;
}

/** The optics of one eye from a response, if present. */
export function eyeOptics(optics: OpticsResponse | null, side: Side): EyeOptics | null {
  return optics?.eyes.find((e) => e.side === side) ?? null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function staticTargets(scene: SceneState, b: BinocularState): DynamicTargets {
  const dirs = eyeDirections({ distanceM: scene.targetDistanceM, directionDeg: scene.targetDirectionDeg }, scene.ipdMm);
  return dynamicTargetsFromDirections(dirs, { left: b.left.accommodationD, right: b.right.accommodationD });
}

function clampDistance(m: number): number {
  if (Number.isNaN(m)) return MIN_TARGET_DISTANCE_M;
  return Math.max(MIN_TARGET_DISTANCE_M, m);
}

/** Clamp a target direction to ±MAX_DIRECTION_DEG on each axis (NaN → 0). */
export function clampDirectionDeg(deg: { x: number; y: number }): { x: number; y: number } {
  const c = (v: number) => (Number.isNaN(v) ? 0 : Math.min(MAX_DIRECTION_DEG, Math.max(-MAX_DIRECTION_DEG, v)));
  return { x: c(deg.x), y: c(deg.y) };
}

/** Both eyes for a schematic eye and refractive preset: the right eye solved, the left its mirror. */
function presetEyes(schematic: PresetName, refractive: string): Eyes {
  const right = applyRefractivePreset(loadPreset(schematic), refractive, farPointOf, "right");
  return { right, left: mirrorEye(right, "left") };
}

/** The decomposition readout relative to the schematic eye, or null when it cannot be computed. */
function decompose(eye: EyeParameters, schematic: PresetName): Decomposition | null {
  try {
    return decomposeRefraction(eye, loadPreset(schematic), farPointOf);
  } catch {
    return null;
  }
}

/**
 * What an auto-prescription depends on: the right eye's document, the scene (target, pupil
 * inputs, age), and the lens design (not its powers). A kept auto-prescription is shown only
 * while this is unchanged.
 */
export function autoRxKey(s: Pick<SceneStore, "eyes" | "scene" | "spectacles">): string {
  const lens = s.spectacles?.right ?? DEFAULT_LENS;
  return JSON.stringify([s.eyes.right, s.scene, lens.vertexMm, lens.baseCurveD, lens.index, lens.centerThicknessMm]);
}

/** Keep the last auto-prescription visible on later responses (they do not recompute it). */
function withAutoRx(res: OpticsResponse, autoRx: NonNullable<EyeOptics["wave"]>["autoRx"]): OpticsResponse {
  return {
    ...res,
    eyes: res.eyes.map((e) => (e.side === "right" && e.wave ? { ...e, wave: { ...e.wave, autoRx } } : e)),
  };
}

let sharedClient: OpticsClient | null = null;
function getClient(): OpticsClient | null {
  if (typeof Worker === "undefined") return null; // unit tests without a browser
  sharedClient ??= new OpticsClient();
  return sharedClient;
}

/**
 * The viewer's state. Eye-model derivation (gaze, muscles, accommodation controller,
 * dynamics) runs on the main thread; every optics computation (lens solve, surfaces,
 * paraxial power, defocus, ray fan) runs in the worker.
 */
export function createSceneStore(init: { eyes?: Eyes } = {}) {
  return create<SceneStore>((set, get) => {
    const fallbackEyes: Eyes = { left: loadPreset(DEFAULT_PRESET), right: loadPreset(DEFAULT_PRESET) };
    const scene0 = defaultScene(DEFAULT_PRESET);
    const zero: PerEye = { left: 0, right: 0 };

    // The initial derivation runs inside the same error handling as every update, so a bad
    // starting document shows the banner over a working default eye instead of a blank app.
    let eyes0 = init.eyes ?? fallbackEyes;
    let paramError: string | null = null;
    let static0: BinocularState;
    try {
      static0 = deriveBinocular(scene0, eyes0, { farPointD: zero });
    } catch (e) {
      paramError = message(e);
      eyes0 = fallbackEyes;
      static0 = deriveBinocular(scene0, eyes0, { farPointD: zero });
    }

    const request = throttle(() => {
      const worker = getClient();
      if (!worker) return;
      const { binocular: b, eyes, spectacles, corrected, polychromatic, autoPending } = get();
      const key = autoRxKey(get());
      const wave: WaveRequest = { ...WAVE_REQUEST, polychromatic, autoPrescribe: autoPending };
      const body: Omit<OpticsRequest, "id"> = {
        eyes: (["right", "left"] as const).map((side) => ({
          side,
          params: eyes[side],
          accommodationD: b[side].accommodationD,
          amplitudeD: b[side].amplitudeD,
          objectDistanceM: b[side].targetDistanceM,
          pupilSemiDiamMm: b[side].pupilMm / 2,
          fanRays: side === "right" ? FAN_RAYS : 0,
          spectacles: spectacles?.[side] ?? null,
          corrected,
          wave: side === "right" ? wave : null,
        })),
      };
      worker
        .request(body)
        .then((res) => get().applyOptics(res, key))
        .catch((e: unknown) => {
          if (e instanceof StaleRequestError) return;
          set({ pending: false, workerError: message(e) });
        });
    }, REQUEST_INTERVAL_MS);

    const schedule = () => {
      set({ pending: true });
      request();
    };

    /** `autoRxKey` of the auto-prescription shown, or null when none is. */
    let shownAutoKey: string | null = null;
    /** Hide the shown auto-prescription once the inputs it was computed for have changed. */
    const dropStaleAutoRx = () => {
      const s = get();
      if (shownAutoKey === null || shownAutoKey === autoRxKey(s)) return;
      shownAutoKey = null;
      if (s.optics) set({ optics: withAutoRx(s.optics, null) });
    };

    /** Re-derive after a scene or document change; the shown state snaps to the new targets. */
    const update = (scene: SceneState, eyes = get().eyes) => {
      try {
        const staticBinocular = deriveBinocular(scene, eyes, { farPointD: get().farPointD });
        const playing = get().playing;
        const dynamics = playing ? get().dynamics : initialDynamics(staticTargets(scene, staticBinocular), get().dynamics.timeS);
        set({
          scene,
          eyes,
          staticBinocular,
          // While playing, the shown state stays on the dynamics; the new targets are chased from the next tick.
          binocular: playing ? deriveBinocular(scene, eyes, { farPointD: get().farPointD, dynamics }) : staticBinocular,
          dynamics,
          scrubS: null,
          paramError: null,
        });
        dropStaleAutoRx();
        schedule();
      } catch (e) {
        set({ paramError: message(e) });
      }
    };

    if (typeof Worker !== "undefined") queueMicrotask(schedule);

    return {
      scene: scene0,
      refractivePreset: "emmetrope",
      decomposition: decompose(eyes0.right, scene0.preset),
      spectacles: null,
      corrected: false,
      autoPending: false,
      psfScale: "log",
      polychromatic: false,
      eyes: eyes0,
      farPointD: zero,
      staticBinocular: static0,
      binocular: static0,
      optics: null,
      pending: true,
      paramError,
      workerError: null,
      dynamics: initialDynamics(staticTargets(scene0, static0)),
      playing: false,
      history: [],
      scrubS: null,
      hovered: null,

      setTargetDistance: (m) => update({ ...get().scene, targetDistanceM: clampDistance(m) }),
      setTargetDirection: (deg) => update({ ...get().scene, targetDirectionDeg: clampDirectionDeg(deg) }),
      setTarget: (t) =>
        update({
          ...get().scene,
          targetDistanceM: clampDistance(t.distanceM),
          targetDirectionDeg: clampDirectionDeg(t.directionDeg),
        }),
      setAge: (years) => update({ ...get().scene, ageYears: years }),
      setIpd: (mm) => update({ ...get().scene, ipdMm: mm }),
      setPreset: (name) => {
        if (!PRESET_NAMES.includes(name)) return;
        try {
          const eyes = presetEyes(name, get().refractivePreset);
          set({ decomposition: decompose(eyes.right, name) });
          update({ ...get().scene, preset: name }, eyes);
        } catch (e) {
          set({ paramError: message(e) });
        }
      },
      setRefractivePreset: (name) => {
        const preset = REFRACTIVE_PRESETS.find((p) => p.name === name);
        if (!preset) return;
        try {
          const scene = get().scene;
          const eyes = presetEyes(scene.preset, name);
          set({ refractivePreset: name, decomposition: decompose(eyes.right, scene.preset) });
          update({ ...scene, ageYears: preset.ageYears ?? scene.ageYears }, eyes);
        } catch (e) {
          set({ paramError: message(e) });
        }
      },
      mirrorRightToLeft: () => {
        const { eyes, spectacles } = get();
        if (spectacles) set({ spectacles: { right: spectacles.right, left: mirrorLens(spectacles.right) } });
        update(get().scene, { right: eyes.right, left: mirrorEye(eyes.right, "left") });
      },
      setLuminance: (cdM2) => update({ ...get().scene, luminanceCdM2: Number.isFinite(cdM2) ? Math.max(0, cdM2) : get().scene.luminanceCdM2 }),
      setSpectacles: (lens) => {
        set({ spectacles: lens ? { right: lens, left: mirrorLens(lens) } : null, ...(lens ? {} : { corrected: false }) });
        dropStaleAutoRx();
        schedule();
      },
      setCorrected: (on) => {
        set({ corrected: on && get().spectacles !== null });
        schedule();
      },
      requestAutoPrescribe: () => {
        set({ autoPending: true });
        schedule();
      },
      useAutoRx: () => {
        const auto = eyeOptics(get().optics, "right")?.wave?.autoRx;
        if (!auto) return;
        const { residualRmsMicrons: _r, ...lens } = auto;
        get().setSpectacles(lens);
      },
      setPsfScale: (psfScale) => set({ psfScale }),
      setPolychromatic: (on) => {
        set({ polychromatic: on });
        schedule();
      },

      setPlaying: (on) => {
        const { scene, staticBinocular, dynamics } = get();
        if (on) {
          set({ playing: true, scrubS: null, binocular: staticBinocular });
          return;
        }
        // Pausing snaps to the static fixation (the transport's "static" mode).
        set({
          playing: false,
          binocular: staticBinocular,
          dynamics: initialDynamics(staticTargets(scene, staticBinocular), dynamics.timeS),
        });
        schedule();
      },

      tick: (dtS) => {
        const s = get();
        if (!s.playing) return;
        const dt = Math.min(MAX_TICK_S, Math.max(0, dtS));
        if (dt === 0) return;
        const dynamics = stepDynamics(s.dynamics, staticTargets(s.scene, s.staticBinocular), dt);
        const sample: HistorySample = {
          timeS: dynamics.timeS,
          version: dynamics.version,
          vergenceDeg: dynamics.vergenceDeg,
          verticalVergenceDeg: dynamics.verticalVergenceDeg,
          accommodationD: dynamics.accommodationD,
        };
        const history = [...s.history, sample].filter((h) => h.timeS >= dynamics.timeS - HISTORY_S);
        try {
          const binocular = deriveBinocular(s.scene, s.eyes, { farPointD: s.farPointD, dynamics });
          set({ dynamics, history, binocular });
          schedule();
        } catch (e) {
          set({ dynamics, history, paramError: message(e) });
        }
      },

      scrub: (timeS) => {
        const s = get();
        if (timeS === null || s.playing || s.history.length === 0) {
          set({ scrubS: null, binocular: s.playing ? s.binocular : s.staticBinocular });
          if (!s.playing) schedule();
          return;
        }
        let best = s.history[0]!;
        for (const h of s.history) if (Math.abs(h.timeS - timeS) < Math.abs(best.timeS - timeS)) best = h;
        const dyn: DynamicState = { ...initialDynamics(staticTargets(s.scene, s.staticBinocular), best.timeS), ...best };
        try {
          set({ scrubS: best.timeS, binocular: deriveBinocular(s.scene, s.eyes, { farPointD: s.farPointD, dynamics: dyn }) });
          schedule();
        } catch (e) {
          set({ paramError: message(e) });
        }
      },

      setHovered: (h) => set({ hovered: h }),

      applyOptics: (res, key) => {
        const s = get();
        const fp: PerEye = {
          left: eyeOptics(res, "left")?.farPointD ?? s.farPointD.left,
          right: eyeOptics(res, "right")?.farPointD ?? s.farPointD.right,
        };
        // Worker success clears only worker errors; a parameter error stays until the parameters change.
        // An auto-prescription keeps being asked for until a response carries one for the current
        // inputs; a kept one stays only while those inputs are unchanged.
        const current = autoRxKey(s);
        const auto = eyeOptics(res, "right")?.wave?.autoRx ?? null;
        const fresh = auto !== null && (key === undefined || key === current);
        const prevAuto = shownAutoKey === current ? (eyeOptics(s.optics, "right")?.wave?.autoRx ?? null) : null;
        let keep: OpticsResponse;
        if (fresh) {
          keep = res;
          shownAutoKey = current;
        } else if (prevAuto !== null && !s.autoPending) {
          keep = withAutoRx(res, prevAuto);
        } else {
          keep = auto === null ? res : withAutoRx(res, null);
          shownAutoKey = null;
        }
        set({ optics: keep, pending: false, workerError: null, ...(fresh ? { autoPending: false } : {}) });
        if (Math.abs(fp.left - s.farPointD.left) > 1e-9 || Math.abs(fp.right - s.farPointD.right) > 1e-9) {
          // The relaxed far point sets demand (spec §4.2); re-derive once it is known.
          set({ farPointD: fp });
          if (s.paramError === null) update(s.scene, s.eyes);
        }
      },
    };
  });
}

export const useScene = createSceneStore();
