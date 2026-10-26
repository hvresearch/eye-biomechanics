import { loadPreset, PRESET_NAMES, type EyeParameters, type PresetName, type SceneState } from "@eye/eye-model";
import { create } from "zustand";
import { OpticsClient, StaleRequestError } from "../worker/client";
import type { OpticsResponse } from "../worker/messages";
import { derive, type Derived } from "./derive";

export const DEFAULT_PRESET: PresetName = "navarro-1985";
/** Rays in the drawn fan (odd so the chief ray is included). A drawing choice. */
export const FAN_RAYS = 15;
/** Debounce for worker requests while a slider is dragged, ms. */
const DEBOUNCE_MS = 16;

export interface SceneStore {
  scene: SceneState;
  params: EyeParameters;
  derived: Derived;
  optics: OpticsResponse | null;
  pending: boolean;
  error: string | null;
  hovered: string | null;
  setTargetDistance: (m: number) => void;
  setAge: (years: number) => void;
  setPreset: (name: PresetName) => void;
  setHovered: (name: string | null) => void;
}

const initialScene: SceneState = {
  targetDistanceM: 6,
  targetDirectionDeg: { x: 0, y: 0 },
  luminanceCdM2: 100,
  ageYears: 30,
  ipdMm: 63,
  timeS: 0,
  preset: DEFAULT_PRESET,
};

let client: OpticsClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function getClient(): OpticsClient | null {
  if (typeof Worker === "undefined") return null; // unit tests without a browser
  client ??= new OpticsClient();
  return client;
}

export const useScene = create<SceneStore>((set, get) => {
  const params = loadPreset(DEFAULT_PRESET);
  const derived = derive(initialScene, params);

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    set({ pending: true });
    timer = setTimeout(() => {
      timer = null;
      const worker = getClient();
      if (!worker) return;
      const { derived: d, scene } = get();
      worker
        .request({
          surfaces: d.surfaces,
          objectDistanceM: scene.targetDistanceM,
          pupilSemiDiamMm: d.eye.pupilMm / 2,
          fanRays: FAN_RAYS,
        })
        .then((optics) => set({ optics, pending: false, error: null }))
        .catch((e: unknown) => {
          if (e instanceof StaleRequestError) return;
          set({ pending: false, error: e instanceof Error ? e.message : String(e) });
        });
    }, DEBOUNCE_MS);
  };

  const update = (scene: SceneState, nextParams = get().params) => {
    try {
      set({ scene, params: nextParams, derived: derive(scene, nextParams), error: null });
      schedule();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  if (typeof Worker !== "undefined") queueMicrotask(schedule);

  return {
    scene: initialScene,
    params,
    derived,
    optics: null,
    pending: true,
    error: null,
    hovered: null,
    setTargetDistance: (m) => update({ ...get().scene, targetDistanceM: m }),
    setAge: (years) => update({ ...get().scene, ageYears: years }),
    setPreset: (name) => {
      if (!PRESET_NAMES.includes(name)) return;
      try {
        update({ ...get().scene, preset: name }, loadPreset(name));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },
    setHovered: (name) => set({ hovered: name }),
  };
});
