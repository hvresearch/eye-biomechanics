import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

interface Grid {
  axes: { ages: number[]; nearHours: number[]; baselineSphereD: number[]; baselineCylinderD: number[] };
  onset: { refraction: { p50: (number | null)[][][] }; acuity: { p50: (number | null)[][][] } };
}

/** The newest committed prediction grid (the one the viewer loads). */
function committedGrid(): Grid {
  const dir = resolve(import.meta.dirname, "../../../../data/results/predictions");
  const last = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().pop()!;
  return JSON.parse(readFileSync(resolve(dir, last), "utf8")) as Grid;
}

/** A grid node whose median trajectory has (or has no) onset of either kind. */
function nodeWhere(g: Grid, hasOnset: boolean) {
  const a = g.axes;
  for (let i = 0; i < a.nearHours.length; i++) {
    for (let j = 0; j < a.baselineSphereD.length; j++) {
      for (let k = 0; k < a.baselineCylinderD.length; k++) {
        const any = g.onset.refraction.p50[i]![j]![k] !== null || g.onset.acuity.p50[i]![j]![k] !== null;
        if (any === hasOnset) return { nearHours: a.nearHours[i]!, sphere: a.baselineSphereD[j]!, cylinder: a.baselineCylinderD[k]! };
      }
    }
  }
  return null;
}

const text = async (page: Page, id: string) => (await page.getByTestId(id).textContent()) ?? "";

async function setField(page: Page, id: string, value: number) {
  const f = page.getByTestId(id);
  await f.fill(String(value));
  await f.press("Enter");
  await f.blur();
}

/** Click the chart at an age (the chart's x scale: 30 to 292 of 300 user units spans its first to last age). */
async function clickAge(page: Page, age: number, ages: number[]) {
  const chart = page.getByTestId("timeline-chart");
  const box = (await chart.boundingBox())!;
  const a0 = ages[0]!;
  const a1 = ages[ages.length - 1]!;
  const u = 30 + ((age - a0) / (a1 - a0)) * (300 - 30 - 8);
  await chart.click({ position: { x: (u / 300) * box.width, y: box.height / 2 } });
}

/**
 * A copy of the grid in which one node has no onset of either kind, served in place of the
 * committed grid's chunk when the committed grid has no such node (the grid changes with each
 * calibration; data/results/README.md).
 */
function withQuietNode(g: Grid): { grid: Grid; node: { nearHours: number; sphere: number; cylinder: number } } {
  const copy = JSON.parse(JSON.stringify(g)) as Grid;
  const a = copy.axes;
  const [i, j, k] = [0, a.baselineSphereD.indexOf(0), 0];
  for (const kind of ["refraction", "acuity"] as const) {
    for (const q of ["p05", "p50", "p95"] as const) {
      (copy.onset[kind] as Record<string, (number | null)[][][]>)[q]![i]![j]![k] = null;
    }
  }
  return { grid: copy, node: { nearHours: a.nearHours[i]!, sphere: a.baselineSphereD[j]!, cylinder: a.baselineCylinderD[k]! } };
}

test("the timeline's age cursor changes the predicted cylinder, and an onset marker shows for a crossing profile", async ({ page }) => {
  // Seven field edits and two age changes, each re-deriving the eyes and the optics.
  test.setTimeout(150_000);
  const grid = committedGrid();
  await page.goto("/");
  const timeline = page.getByTestId("timeline");
  await timeline.scrollIntoViewIfNeeded();
  await expect(page.getByTestId("timeline-chart")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("timeline-stance")).toContainText("a hypothesis test, not a clinical prediction");
  await expect(page.getByTestId("timeline-stance")).toContainText("The shift comes only in part, with a poor fit to children, from the elastic lid load on tissue that stiffens with age: not a confirmation");
  await expect(page.getByTestId("timeline-stance")).toContainText("Onsets: cylinder of 0.75 D or more, sphere beyond ±0.50 D, or acuity worse than 20/40.");

  const maxHours = grid.axes.nearHours[grid.axes.nearHours.length - 1]!;
  await setField(page, "near-hours", maxHours);
  await clickAge(page, 10, grid.axes.ages);
  await expect(page.getByTestId("age")).toHaveValue("10");
  const at10 = await text(page, "timeline-rx");
  await clickAge(page, 60, grid.axes.ages);
  await expect(page.getByTestId("age")).toHaveValue("60");
  await expect.poll(async () => text(page, "timeline-rx")).not.toBe(at10);
  const cyl = (s: string) => /([+−-]?\d+\.\d+) × \d+$/.exec(s)?.[1];
  expect(cyl(await text(page, "timeline-rx"))).not.toBe(cyl(at10));

  const crossing = nodeWhere(grid, true);
  expect(crossing, "the committed grid has a subject with an onset").not.toBeNull();
  await setField(page, "near-hours", crossing!.nearHours);
  await setField(page, "baseline-sphere", crossing!.sphere);
  await setField(page, "baseline-cylinder", crossing!.cylinder);
  await expect(page.locator('[data-testid^="onset-"]').first()).toBeVisible();
  await expect(page.getByTestId("timeline-onset")).not.toContainText("no onset by 90");
});

test("a profile that crosses no threshold shows no marker and says so", async ({ page }) => {
  test.setTimeout(120_000);
  const committed = committedGrid();
  const found = nodeWhere(committed, false);
  const { grid, node } = found ? { grid: committed, node: found } : withQuietNode(committed);
  await page.route("**/assets/v1-*.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `export default ${JSON.stringify(grid)};` }),
  );
  await page.goto("/");
  await expect(page.getByTestId("timeline-chart")).toBeVisible({ timeout: 30_000 });
  await setField(page, "near-hours", node.nearHours);
  await setField(page, "baseline-sphere", node.sphere);
  await setField(page, "baseline-cylinder", node.cylinder);
  await expect(page.locator('[data-testid^="onset-"]')).toHaveCount(0);
  await expect(page.getByTestId("timeline-onset")).toHaveText("no onset by 90");
});

test("applying the prediction reshapes the right cornea and clearing it restores the eye", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("timeline-chart")).toBeVisible({ timeout: 30_000 });
  await setField(page, "baseline-cylinder", -1);
  const decomposition = page.locator(".decomposition");
  const before = await decomposition.textContent();
  await page.getByTestId("apply-prediction").check();
  await expect(page.getByTestId("apply-prediction")).toBeChecked();
  await expect(page.getByTestId("error")).toHaveCount(0);
  // About a diopter of cylinder, all of it corneal.
  await expect(decomposition).not.toHaveText(before ?? "");
  await expect(decomposition).toContainText(/Corneal.*[−-][01]\.\d\d cyl/);
  await page.getByTestId("apply-prediction").uncheck();
  await expect(page.getByTestId("apply-prediction")).not.toBeChecked();
  await expect(decomposition).toHaveText(before ?? "");
});
