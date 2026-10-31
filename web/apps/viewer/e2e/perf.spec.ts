import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * Frame-rate and main-thread budgets (spec §6.6; plan Task 6.8, Deviation 3 as revised in the
 * Outcome notes). CI and the cloud container render WebGL in software (SwiftShader), where the
 * app's static stage already takes most of a frame to rasterize, so the frame rate is judged
 * against the app's own idle stage with a worker thread as busy as the optics worker is during
 * a drag (the rasterizer shares the CPU with it), and the 16 ms budget against the main
 * thread's JavaScript per dragged frame, read from a CPU profile (rasterization shows up as
 * native "(program)" time, which is the GPU's work on real hardware). Where the idle stage
 * reaches 61 fps, the literal 55 fps target applies.
 */

/** How long each measurement window runs, ms, and how many idle/drag pairs are measured (test choices). */
const IDLE_MS = 2_500;
const DRAG_MS = 4_000;
const ROUNDS = 4;
const WARM_UP_MS = 1_500;
/** Spec §6.6: 55 fps or better while dragging the target. */
const TARGET_FPS = 55;
/** Below this idle rate the renderer, not the app, sets the pace (Deviation 3). */
const SOFTWARE_FPS = 61;
/** Dragging keeps at least this fraction of the (worker-loaded) idle frame rate when the renderer is the limit. */
const MIN_FRACTION_OF_IDLE = 0.9;
/** Spec §6.6: the main thread never blocks more than 16 ms per frame. */
const FRAME_BUDGET_MS = 16;
/** Profiler sampling interval, µs (a test choice: about 200 samples per software-rendered frame). */
const SAMPLING_US = 1000;
/** Sweep of the dragged target: horizontal amplitude (deg), vertical amplitude (deg), period (ms), distance (m). */
const SWEEP = { xDeg: 15, yDeg: 8, periodMs: 2_000, distanceM: 0.5 };

/** Frames per second over a window: frames over elapsed time (the median interval is quantized to vsync multiples). */
const fpsOf = (intervals: number[]) => (1000 * intervals.length) / intervals.reduce((a, b) => a + b, 0);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? NaN) : ((s[m - 1] ?? NaN) + (s[m] ?? NaN)) / 2;
};

/**
 * Frame intervals (ms) over `ms`, optionally setting the target on every animation frame as a
 * drag does, or with a worker thread spinning for the whole window (`busy`), the load the
 * optics worker puts on the CPU while it answers a request per frame during a drag.
 */
function frameIntervals(page: Page, ms: number, drag: boolean, busy = false): Promise<number[]> {
  return page.evaluate(
    ({ ms, drag, busy, sweep }) =>
      new Promise<number[]>((resolve) => {
        type State = { optics: unknown; setTarget: (t: { distanceM: number; directionDeg: { x: number; y: number } }) => void };
        type Store = { getState: () => State; subscribe: (f: (s: State, p: State) => void) => () => void };
        const store = (window as unknown as { __eyeScene?: Store }).__eyeScene;
        const w = window as unknown as { __replies?: number };
        w.__replies = 0;
        const unsubscribe = store?.subscribe((s, p) => {
          if (s.optics !== p.optics) w.__replies = (w.__replies ?? 0) + 1;
        });
        const spin = busy
          ? new Worker(URL.createObjectURL(new Blob([`onmessage = (e) => { const t = performance.now(); while (performance.now() - t < e.data) {} };`])))
          : null;
        spin?.postMessage(ms + 1_000);
        const stamps: number[] = [];
        const start = performance.now();
        const step = (t: number) => {
          stamps.push(t);
          if (drag && store) {
            const phase = (2 * Math.PI * (t - start)) / sweep.periodMs;
            store.getState().setTarget({
              distanceM: sweep.distanceM,
              directionDeg: { x: sweep.xDeg * Math.sin(phase), y: sweep.yDeg * Math.sin(2 * phase) },
            });
          }
          if (t - start < ms) requestAnimationFrame(step);
          else {
            unsubscribe?.();
            spin?.terminate();
            resolve(stamps.slice(1).map((s, i) => s - (stamps[i] ?? s)));
          }
        };
        requestAnimationFrame(step);
      }),
    { ms, drag, busy, sweep: SWEEP },
  );
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string };
}
interface Profile {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}

/** Native entries of a V8 CPU profile that are not the page's JavaScript ("(garbage collector)" counts as script). */
const NOT_SCRIPT = new Set(["(program)", "(idle)", "(root)"]);

/** Milliseconds of JavaScript (garbage collection included) in a CPU profile. */
function scriptMs(profile: Profile): number {
  const native = new Set(profile.nodes.filter((n) => NOT_SCRIPT.has(n.callFrame.functionName)).map((n) => n.id));
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let us = 0;
  // Each sample's time is the delta to the next one.
  for (let i = 0; i < samples.length - 1; i++) if (!native.has(samples[i] ?? -1)) us += deltas[i + 1] ?? 0;
  return us / 1000;
}

/** Seconds of script execution on the page's main thread so far (CDP Performance metrics). */
async function scriptDurationS(cdp: CDPSession): Promise<number> {
  const { metrics } = (await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] };
  return metrics.find((m) => m.name === "ScriptDuration")?.value ?? NaN;
}

async function profiled<T>(cdp: CDPSession, run: () => Promise<T>): Promise<{ result: T; profile: Profile }> {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: SAMPLING_US });
  await cdp.send("Profiler.start");
  const result = await run();
  const { profile } = (await cdp.send("Profiler.stop")) as { profile: Profile };
  return { result, profile };
}

test("dragging the target keeps the frame rate and the main thread's per-frame budget", async ({ page }, testInfo) => {
  test.setTimeout(240_000);

  // Reference only: what the browser reaches with nothing to draw.
  await page.goto("/?perf=baseline");
  await expect(page.getByTestId("stage").locator("canvas")).toBeVisible();
  const emptyFps = fpsOf(await frameIntervals(page, IDLE_MS, false));

  await page.goto("/?perf=1");
  await expect(page.getByTestId("stage").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("wavefront-map-uncorrected")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => "__eyeScene" in window)).toBe(true);

  // Alternating idle and drag windows, judged by their medians: the container's other load
  // (the optics worker, the software rasterizer's threads) shifts single windows by ±20%.
  // One unmeasured drag first: the first frames of a drag compile and allocate what later ones reuse.
  await frameIntervals(page, WARM_UP_MS, true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const rounds: { idleFps: number; loadedIdleFps: number; dragFps: number; idleJsMs: number; dragJsMs: number; scriptDurationMs: number; frames: number; replies: number }[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const idle = await profiled(cdp, () => frameIntervals(page, IDLE_MS, false));
    const loaded = await frameIntervals(page, IDLE_MS, false, true);
    const before = await scriptDurationS(cdp);
    const drag = await profiled(cdp, () => frameIntervals(page, DRAG_MS, true));
    const after = await scriptDurationS(cdp);
    const replies = await page.evaluate(() => (window as unknown as { __replies?: number }).__replies ?? 0);
    const frames = Math.max(1, drag.result.length);
    rounds.push({
      idleFps: fpsOf(idle.result),
      loadedIdleFps: fpsOf(loaded),
      dragFps: fpsOf(drag.result),
      idleJsMs: scriptMs(idle.profile) / Math.max(1, idle.result.length),
      dragJsMs: scriptMs(drag.profile) / frames,
      scriptDurationMs: ((after - before) * 1000) / frames,
      frames: drag.result.length,
      replies,
    });
  }
  const idleFps = median(rounds.map((r) => r.idleFps));
  const dragFps = median(rounds.map((r) => r.dragFps));
  // Under software rendering the baseline is the idle stage with a worker thread as busy as the
  // optics worker is in a drag: one such thread alone costs the rasterizer ~15% of its frame
  // rate (measured in the cloud container: 5.3 → 4.5 fps), which a GPU would not see.
  const fractionOfIdle = median(rounds.map((r) => r.dragFps / r.loadedIdleFps));
  const jsPerFrameMs = median(rounds.map((r) => r.dragJsMs));

  const fixed = (x: number, d = 1) => +x.toFixed(d);
  const report = {
    emptyCanvasFps: fixed(emptyFps),
    idleStageFps: fixed(idleFps),
    idleStageWithBusyWorkerFps: fixed(median(rounds.map((r) => r.loadedIdleFps))),
    dragFps: fixed(dragFps),
    dragFractionOfLoadedIdle: fixed(fractionOfIdle, 2),
    jsPerIdleFrameMs: fixed(median(rounds.map((r) => r.idleJsMs)), 2),
    jsPerDraggedFrameMs: fixed(jsPerFrameMs, 2),
    rounds: rounds.map((r) => ({ dragFps: fixed(r.dragFps), idleFps: fixed(r.idleFps), loadedIdleFps: fixed(r.loadedIdleFps), dragJsMs: fixed(r.dragJsMs, 2), scriptDurationMs: fixed(r.scriptDurationMs, 2), frames: r.frames, replies: r.replies })),
    canvas: await page.getByTestId("stage").locator("canvas").evaluate((c) => `${(c as HTMLCanvasElement).width}x${(c as HTMLCanvasElement).height}`),
  };
  testInfo.annotations.push({ type: "perf", description: JSON.stringify(report) });
  console.log(`perf: ${JSON.stringify(report)}`);

  for (const r of rounds) expect(r.frames).toBeGreaterThan(5);
  if (idleFps >= SOFTWARE_FPS) expect(dragFps).toBeGreaterThanOrEqual(TARGET_FPS);
  else expect(fractionOfIdle).toBeGreaterThanOrEqual(MIN_FRACTION_OF_IDLE);
  expect(jsPerFrameMs).toBeLessThanOrEqual(FRAME_BUDGET_MS);
});
