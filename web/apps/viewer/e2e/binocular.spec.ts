import { expect, test, type Page } from "@playwright/test";

const num = async (page: Page, id: string) => {
  const t = (await page.getByTestId(id).textContent()) ?? "";
  return Number(t.replace("−", "-"));
};

const commit = async (page: Page, id: string, value: string) => {
  const box = page.getByTestId(id);
  await box.fill(value);
  await box.press("Enter");
};

test("a target to the right recruits the right lateral and left medial recti", async ({ page }) => {
  test.setTimeout(120_000); // two eyes and twelve muscles regenerate under software WebGL in CI
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  const rlr0 = await num(page, "muscle-right-lateralRectus-activation");
  const lmr0 = await num(page, "muscle-left-medialRectus-activation");
  await commit(page, "target-azimuth", "20");
  await expect.poll(async () => num(page, "muscle-right-lateralRectus-activation")).toBeGreaterThan(rlr0);
  await expect.poll(async () => num(page, "muscle-left-medialRectus-activation")).toBeGreaterThan(lmr0);
  // Their antagonists relax (reciprocal innervation).
  expect(await num(page, "muscle-right-medialRectus-activation")).toBeLessThan(rlr0);
  expect(await num(page, "muscle-left-lateralRectus-activation")).toBeLessThan(lmr0);
  // The right eye turns temporally.
  await expect.poll(async () => Number(((await page.getByTestId("gaze").textContent()) ?? "").split(",")[0]?.replace("−", "-"))).toBeGreaterThan(19);
});

test("vergence grows as the target approaches", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  expect(await num(page, "vergence")).toBeLessThan(1); // 6 m: about 0.6 degrees
  await commit(page, "target-distance", "0.33");
  await expect.poll(async () => num(page, "vergence")).toBeGreaterThan(10); // 2 atan(31.5 / 330) ≈ 10.9
  const mr = await num(page, "muscle-right-medialRectus-activation");
  expect(mr).toBeGreaterThan(0.2); // above the primary-position baseline
});

test("the transport animates toward the static fixation and pausing snaps to it", async ({ page }) => {
  test.setTimeout(150_000); // every animated frame regenerates the muscles under software WebGL in CI
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  await expect(page.getByTestId("transport-time")).toHaveText("0.00 s");
  await page.getByTestId("transport-play").click();
  await expect(page.getByTestId("transport-play")).toHaveAttribute("aria-pressed", "true");
  await commit(page, "target-azimuth", "10");
  await expect.poll(async () => Number.parseFloat((await page.getByTestId("transport-time").textContent()) ?? "0")).toBeGreaterThan(0.5);
  // Saccade (43 ms) and the small vergence change (0.16 s latency, 0.4 s time constant) settle well within 3 s.
  await page.waitForTimeout(3000);
  const playing = await num(page, "muscle-right-lateralRectus-activation");
  await page.getByTestId("transport-play").click();
  await expect(page.getByTestId("transport-play")).toHaveAttribute("aria-pressed", "false");
  const settled = await num(page, "muscle-right-lateralRectus-activation");
  expect(Math.abs(playing - settled)).toBeLessThanOrEqual(0.01);
  // The recorded history can be scrubbed while paused.
  await expect(page.getByTestId("transport-scrub")).toBeEnabled();
});
