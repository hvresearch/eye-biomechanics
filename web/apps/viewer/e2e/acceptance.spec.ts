import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Master plan "Verification (end to end)" item 4, read from the UI (M6 plan, Task 6.9). Each
 * test attaches the numbers it read, so a run's report records them for the PR body.
 *
 * Distances beyond the inspector's 6 m and an exact pupil diameter are set through the store,
 * which `main.tsx` exposes as `window.__eyeScene` for any `?perf` value other than "baseline".
 */

/** Pupil diameter of the acceptance case (mm) and the tolerance the luminance search stops at. */
const ACCEPTANCE_PUPIL_MM = 3;
const PUPIL_TOLERANCE_MM = 0.01;

const text = async (page: Page, id: string) => (await page.getByTestId(id).textContent()) ?? "";
const num = (s: string) => Number(s.replace(/−/g, "-").replace(/[^0-9.+-]/g, ""));

interface StoreHandle {
  getState(): {
    setTargetDistance(m: number): void;
    setLuminance(cdM2: number): void;
    binocular: { right: { pupilMm: number } };
    pending: boolean;
  };
}

/** Bisect the scene luminance until the right pupil is the acceptance diameter; returns cd/m². */
async function setPupil(page: Page, mm: number): Promise<{ luminance: number; pupilMm: number }> {
  return page.evaluate(
    ({ mm, tol }) => {
      const s = (window as unknown as { __eyeScene: StoreHandle }).__eyeScene;
      // Pupil diameter falls with luminance; search log luminance over 1e-3 to 1e5 cd/m².
      let lo = -3;
      let hi = 5;
      let mid = 0;
      for (let i = 0; i < 60; i++) {
        mid = (lo + hi) / 2;
        s.getState().setLuminance(10 ** mid);
        const d = s.getState().binocular.right.pupilMm;
        if (Math.abs(d - mm) < tol) break;
        if (d > mm) lo = mid;
        else hi = mid;
      }
      return { luminance: 10 ** mid, pupilMm: s.getState().binocular.right.pupilMm };
    },
    { mm, tol: PUPIL_TOLERANCE_MM / 2 },
  );
}

async function settled(page: Page) {
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __eyeScene: StoreHandle }).__eyeScene.getState().pending), { timeout: 30_000 }).toBe(false);
}

/**
 * Master plan criterion: |defocus| < 0.1 D and Strehl > 0.8. Not met (M6 plan, Outcome notes,
 * Task 6.9): the default schematic eye is emmetropic paraxially, but at a 3 mm pupil its
 * minimum-RMS refraction is about −0.25 D with about −0.2 D of oblique astigmatism at the fovea
 * (angle alpha), and a relaxed eye cannot accommodate below zero for a target at infinity. The
 * test records the numbers and guards them against regression; the owner decides whether the
 * criterion or the preset's definition of emmetropia changes.
 */
test("relaxed emmetrope at infinity, 3 mm pupil: defocus and Strehl recorded (master plan criterion not met)", async ({ page }, info) => {
  await page.goto("/?perf=acceptance");
  await expect(page.getByTestId("strehl-uncorrected")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __eyeScene: StoreHandle }).__eyeScene.getState().setTargetDistance(Infinity));
  const pupil = await setPupil(page, ACCEPTANCE_PUPIL_MM);
  await settled(page);
  await expect(page.getByTestId("pupil")).toContainText("3.0");
  const defocus = num(await text(page, "defocus"));
  const strehl = num(await text(page, "strehl-uncorrected"));
  const accommodation = num(await text(page, "accommodation"));
  const refraction = await text(page, "refraction-uncorrected");
  const rms = num(await text(page, "rms-uncorrected"));
  await info.attach("emmetrope-infinity", { body: JSON.stringify({ ...pupil, defocus, strehl, accommodation, refraction, rms }), contentType: "application/json" });
  expect(accommodation).toBeLessThan(0.05);
  // Myopic by the minimum-RMS sphere it cannot relax below (about −0.18 D measured).
  expect(defocus).toBeLessThan(0);
  expect(defocus).toBeGreaterThan(-0.3);
  // 0.44 measured; the bound catches a regression, not the master plan's 0.8.
  expect(strehl).toBeGreaterThan(0.35);
  expect(strehl).toBeLessThanOrEqual(1);
});

test("age 60 at 0.33 m: accommodation clipped to the amplitude, defocus > 1.5 D", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  await page.getByTestId("target-distance").fill("0.33");
  await page.getByTestId("target-distance").press("Enter");
  await page.getByTestId("age").fill("60");
  await page.getByTestId("age").press("Enter");
  await expect(page.getByTestId("amplitude")).toHaveText(/^0\.\d\d$/);
  await expect.poll(async () => num(await text(page, "defocus")), { timeout: 30_000 }).toBeGreaterThan(1.5);
  const amplitude = num(await text(page, "amplitude"));
  const accommodation = num(await text(page, "accommodation"));
  const demand = num(await text(page, "demand"));
  const defocus = num(await text(page, "defocus"));
  await info.attach("presbyope-near", { body: JSON.stringify({ amplitude, accommodation, demand, defocus }), contentType: "application/json" });
  expect(demand).toBeGreaterThan(amplitude);
  // Readouts are rounded to 0.01 D.
  expect(Math.abs(accommodation - amplitude)).toBeLessThanOrEqual(0.011);
});

test("astigmat preset −1.5 D cylinder at 90° over the emmetrope's own; auto-prescription leaves residual RMS below 0.05 µm", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByTestId("refraction-uncorrected")).toBeVisible({ timeout: 30_000 });
  const emmRx = (await text(page, "refraction-uncorrected")).replace(/−/g, "-");
  const emmCyl = Number(/\/\s*([+-]?[\d.]+)/.exec(emmRx)?.[1] ?? "0");
  await page.getByTestId("refractive-preset").selectOption("astigmat-1.5-atr-corneal");
  await expect.poll(async () => (await text(page, "refraction-uncorrected")).includes("×"), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => num((/\/\s*([−+-]?[\d.]+)/.exec(await text(page, "refraction-uncorrected")) ?? ["", "0"])[1]!), { timeout: 30_000 }).toBeLessThan(-1);
  const rx = (await text(page, "refraction-uncorrected")).replace(/−/g, "-");
  const m = /([+-]?[\d.]+)\s*\/\s*([+-]?[\d.]+)\s*×\s*(\d+)/.exec(rx)!;
  const cyl = Number(m[2]);
  const axis = Number(m[3]);
  await page.getByTestId("spectacles-on").check();
  await page.getByTestId("auto-prescribe").click();
  await expect(page.getByTestId("use-auto-rx")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("use-auto-rx").click();
  await page.getByTestId("corrected").check();
  await expect(page.getByTestId("rms-corrected")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => num(await text(page, "rms-corrected")), { timeout: 30_000 }).toBeLessThan(0.1);
  const rmsCorrected = num(await text(page, "rms-corrected"));
  const rmsUncorrected = num(await text(page, "rms-uncorrected"));
  const pupilMm = num(await text(page, "pupil"));
  await info.attach("astigmat", { body: JSON.stringify({ emmRx, rx, cyl, relativeCyl: cyl - emmCyl, axis, pupilMm, rmsUncorrected, rmsCorrected }), contentType: "application/json" });
  // The preset is the against-the-rule astigmat: minus cylinder at 90° (M3 plan, Deviation 4: the
  // master plan's "axis 180" describes with-the-rule astigmatism). Its −1.5 D is added to the
  // emmetrope's own small foveal astigmatism (about −0.2 D at 90°), so compare with that.
  expect(Math.abs(cyl - emmCyl - -1.5)).toBeLessThan(0.1);
  expect(Math.abs(axis - 90)).toBeLessThanOrEqual(2);
  expect(rmsCorrected).toBeLessThan(0.05);
});

interface Grid {
  axes: { ages: number[]; nearHours: number[]; baselineSphereD: number[]; baselineCylinderD: number[] };
  onset: { refraction: { p50: (number | null)[][][] } };
}

function committedGrid(): Grid {
  const dir = resolve(import.meta.dirname, "../../../../data/results/predictions");
  const last = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().pop()!;
  return JSON.parse(readFileSync(resolve(dir, last), "utf8")) as Grid;
}

async function setField(page: Page, id: string, value: number) {
  const f = page.getByTestId(id);
  await f.fill(String(value));
  await f.press("Enter");
  await f.blur();
}

const onsetAge = async (page: Page) => {
  const t = await text(page, "timeline-onset");
  const m = /refraction at (\d+\.\d) y/.exec(t);
  return m ? Number(m[1]) : null;
};

test("timeline: high near-work shows an earlier onset than zero near-work", async ({ page }, info) => {
  test.setTimeout(120_000);
  const grid = committedGrid();
  const a = grid.axes;
  const maxHours = a.nearHours[a.nearHours.length - 1]!;
  // The emmetropic, cylinder-free baseline.
  const j = a.baselineSphereD.indexOf(0);
  const k = a.baselineCylinderD.findIndex((c) => c === 0);
  const gridZero = grid.onset.refraction.p50[0]![j]![k]!;
  const gridHigh = grid.onset.refraction.p50[a.nearHours.length - 1]![j]![k]!;
  await page.goto("/");
  await expect(page.getByTestId("timeline-chart")).toBeVisible({ timeout: 30_000 });
  await setField(page, "baseline-sphere", 0);
  await setField(page, "baseline-cylinder", 0);
  await setField(page, "near-hours", 0);
  await expect.poll(async () => onsetAge(page), { timeout: 30_000 }).not.toBeNull();
  const zero = (await onsetAge(page))!;
  await setField(page, "near-hours", maxHours);
  await expect.poll(async () => onsetAge(page), { timeout: 30_000 }).not.toBe(zero);
  const high = (await onsetAge(page))!;
  await expect(page.locator('[data-testid^="onset-"]').first()).toBeVisible();
  await info.attach("onsets", { body: JSON.stringify({ maxHours, zero, high, gridZero, gridHigh }), contentType: "application/json" });
  expect(high).toBeLessThan(zero);
});
