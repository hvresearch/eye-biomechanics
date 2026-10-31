import { describe, expect, it } from "vitest";
import { createSceneStore } from "../src/store/scene";
import { runEyesJob, type EyesJob, type EyesJobResult } from "../src/worker/jobs";

/** Main-thread budget per update (one 60 fps frame, CLAUDE.md), ms. */
const BUDGET_MS = 16;
/** Timed calls per path and warm-up calls before them. */
const RUNS = 20;
const WARMUP = 3;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

function report(name: string, times: number[]): number {
  const m = median(times);
  process.stdout.write(`${name}: median ${m.toFixed(2)} ms, max ${Math.max(...times).toFixed(2)} ms\n`);
  return m;
}

/**
 * The store's update paths as the UI calls them. The worker's jobs (preset solving, the
 * decomposition) run in the worker in the app, so the preset path is timed with their results
 * computed beforehand: what is measured is the main thread applying them (re-deriving both eyes).
 */
describe("main-thread budget", () => {
  it(`keeps setAge under ${BUDGET_MS} ms (median of ${RUNS})`, () => {
    const store = createSceneStore();
    const times: number[] = [];
    for (let k = -WARMUP; k < RUNS; k++) {
      const t0 = performance.now();
      void store.getState().setAge(20 + (k + WARMUP) * 1.5);
      if (k >= 0) times.push(performance.now() - t0);
    }
    expect(report("setAge", times)).toBeLessThan(BUDGET_MS);
  });

  it(`keeps setTargetDistance under ${BUDGET_MS} ms (median of ${RUNS})`, () => {
    const store = createSceneStore();
    const times: number[] = [];
    for (let k = -WARMUP; k < RUNS; k++) {
      const t0 = performance.now();
      store.getState().setTargetDistance(0.3 + (k + WARMUP) * 0.1);
      if (k >= 0) times.push(performance.now() - t0);
    }
    expect(report("setTargetDistance", times)).toBeLessThan(BUDGET_MS);
  });

  it(`keeps applying setRefractivePreset under ${BUDGET_MS} ms (median of ${RUNS})`, async () => {
    const cache = new Map<string, EyesJobResult>();
    const runJob = (job: EyesJob) => {
      const key = JSON.stringify(job);
      let r = cache.get(key);
      if (!r) {
        r = runEyesJob(job);
        cache.set(key, r);
      }
      return Promise.resolve(r);
    };
    const names = ["astigmat-1.5-atr-corneal", "emmetrope"];
    // Fill the cache so the timed calls apply results without computing them.
    const store = createSceneStore({ runJob });
    for (const n of names) await store.getState().setRefractivePreset(n);
    const times: number[] = [];
    for (let k = -WARMUP; k < RUNS; k++) {
      const t0 = performance.now();
      await store.getState().setRefractivePreset(names[(k + WARMUP) % 2]!);
      if (k >= 0) times.push(performance.now() - t0);
    }
    expect(report("setRefractivePreset (apply)", times)).toBeLessThan(BUDGET_MS);
  });
});
