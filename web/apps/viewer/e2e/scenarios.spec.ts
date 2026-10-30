import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const text = async (page: Page, id: string) => (await page.getByTestId(id).textContent()) ?? "";
const num = async (page: Page, id: string) => Number((await text(page, id)).replace(/−/g, "-"));

test("near-to-far refocus: accommodation relaxes for the far target and returns for the near one", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByTestId("scenario-near-to-far-refocus").click();
  await expect(page.getByTestId("scenario-current")).toContainText("Near-to-far refocus");
  await expect(page.getByTestId("demand")).toHaveText(/^3\.0\d$/);
  await page.getByTestId("scenario-play").click();
  await expect.poll(async () => num(page, "accommodation"), { timeout: 45_000 }).toBeLessThan(0.5);
  await expect.poll(async () => num(page, "accommodation"), { timeout: 45_000 }).toBeGreaterThan(2);
});

test("presbyopia 20 to 60: the amplitude falls with age during playback", async ({ page }) => {
  // Playback advances with the rendered frames (each tick is capped), so a loaded CI machine
  // plays the 12 s sweep slower than real time: wait on the age reaching 60, generously.
  test.setTimeout(150_000);
  await page.goto("/");
  await page.getByTestId("scenario-presbyopia-20-to-60").click();
  await expect(page.getByTestId("age")).toHaveValue("20");
  const young = await num(page, "amplitude");
  expect(young).toBeGreaterThan(5);
  await page.getByTestId("scenario-play").click();
  await expect(page.getByTestId("age")).toHaveValue("60", { timeout: 120_000 });
  expect(await num(page, "amplitude")).toBeLessThan(1.5);
});

test("astigmat corrected vs uncorrected: playback puts the spectacles on", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByTestId("scenario-astigmat-corrected-vs-uncorrected").click();
  await expect.poll(async () => text(page, "refraction"), { timeout: 30_000 }).toMatch(/[−-]1\.\d\d/);
  const uncorrected = await text(page, "refraction");
  await page.getByTestId("scenario-play").click();
  await expect(page.getByText("Refraction (worn)")).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => text(page, "refraction"), { timeout: 15_000 }).not.toBe(uncorrected);
});

test("biomechanics result loaded: the heat map and the induced cylinder appear", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByTestId("scenario-fem-result-loaded").click();
  await expect(page.getByTestId("heatmap-legend")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => text(page, "induced-cylinder"), { timeout: 30_000 }).toMatch(/\d × \d+/);
});

test("an exported scenario imports back to the same state, and the stage exports as a PNG", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("scenario-astigmat-corrected-vs-uncorrected").click();
  await page.getByTestId("target-distance").fill("0.5");
  await expect.poll(async () => text(page, "refraction"), { timeout: 30_000 }).toMatch(/\d/);
  const demand = await text(page, "demand");
  const refraction = await text(page, "refraction");

  await page.getByTestId("scenario-name").fill("Round trip");
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("scenario-export-json").click()]);
  expect(json.suggestedFilename()).toBe("round-trip.json");
  const jsonPath = info.outputPath("round-trip.json");
  await json.saveAs(jsonPath);
  const doc = JSON.parse(readFileSync(jsonPath, "utf8")) as { name: string; scene: { targetDistanceM: number } };
  expect(doc.name).toBe("Round trip");
  expect(doc.scene.targetDistanceM).toBe(0.5);

  const [png] = await Promise.all([page.waitForEvent("download"), page.getByTestId("scenario-export-png").click()]);
  const pngPath = info.outputPath("round-trip.png");
  await png.saveAs(pngPath);
  const bytes = readFileSync(pngPath);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");

  await page.reload();
  await page.getByTestId("scenario-file").setInputFiles(jsonPath);
  await expect(page.getByTestId("scenario-current")).toContainText("Round trip");
  await expect(page.getByTestId("demand")).toHaveText(demand);
  await expect.poll(async () => text(page, "refraction"), { timeout: 30_000 }).toBe(refraction);
});

test("a scenario of an unknown major version is refused with its version named", async ({ page }, info) => {
  await page.goto("/");
  const path = info.outputPath("future.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, JSON.stringify({ schemaVersion: "2.0.0", name: "future" }));
  await page.getByTestId("scenario-file").setInputFiles(path);
  await expect(page.getByTestId("scenario-error")).toContainText("2.0.0");
  await expect(page.getByTestId("scenario-current")).toHaveCount(0);
});
