import {
  MIN_TARGET_DISTANCE_M,
  PRESET_NAMES,
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
import { create } from "zustand";
import { OpticsClient, StaleRequestError } from "../worker/client";
import type { EyeOptics, OpticsRequest, OpticsResponse } from "../worker/messages";
import { throttle } from "./throttle";

export const DEFAULT_PRESET: PresetName = "navarro-1985";
/** Rays in the drawn fan of the cutaway (right) eye; odd so the chief ray is included. A drawing choice. */
export const FAN_RAYS = 15;
/** Minimum interval between worker requests while inputs change, ms (one frame). */
const REQUEST_INTERVAL_MS = 16;
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
  setAge: (years: number) => void;
  setIpd: (mm: number) => void;
  setPreset: (name: PresetName) => void;
  setPlaying: (on: boolean) => void;
  tick: (dtS: number) => void;
  scrub: (timeS: number | null) => void;
  setHovered: (h: Hover | null) => void;
  applyOptics: (res: OpticsResponse) => void;
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
      const { binocular: b, eyes } = get();
      const body: Omit<OpticsRequest, "id"> = {
        eyes: (["right", "left"] as const).map((side) => ({
          side,
          params: eyes[side],
          accommodationD: b[side].accommodationD,
          objectDistanceM: b[side].targetDistanceM,
          pupilSemiDiamMm: b[side].pupilMm / 2,
          fanRays: side === "right" ? FAN_RAYS : 0,
        })),
      };
      worker
        .request(body)
        .then((res) => get().applyOptics(res))
        .catch((e: unknown) => {
          if (e instanceof StaleRequestError) return;
          set({ pending: false, workerError: message(e) });
        });
    }, REQUEST_INTERVAL_MS);

    const schedule = () => {
      set({ pending: true });
      request();
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
        schedule();
      } catch (e) {
        set({ paramError: message(e) });
      }
    };

    if (typeof Worker !== "undefined") queueMicrotask(schedule);

    return {
      scene: scene0,
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
      setTargetDirection: (deg) => update({ ...get().scene, targetDirectionDeg: { x: deg.x, y: deg.y } }),
      setAge: (years) => update({ ...get().scene, ageYears: years }),
      setIpd: (mm) => update({ ...get().scene, ipdMm: mm }),
      setPreset: (name) => {
        if (!PRESET_NAMES.includes(name)) return;
        try {
          const doc = loadPreset(name);
          update({ ...get().scene, preset: name }, { left: doc, right: doc });
        } catch (e) {
          set({ paramError: message(e) });
        }
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

      applyOptics: (res) => {
        const s = get();
        const fp: PerEye = {
          left: eyeOptics(res, "left")?.farPointD ?? s.farPointD.left,
          right: eyeOptics(res, "right")?.farPointD ?? s.farPointD.right,
        };
        // Worker success clears only worker errors; a parameter error stays until the parameters change.
        set({ optics: res, pending: false, workerError: null });
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
