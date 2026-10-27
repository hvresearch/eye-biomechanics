import { expect, test, type Page } from "@playwright/test";

const num = async (page: Page, id: string) => {
  const t = (await page.getByTestId(id).textContent()) ?? "";
  return Number(t.replace("−", "-"));
};

test("vertical slice: target distance drives accommodation and defocus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("stage")).toBeVisible();

  // The defocus readout shows a number once the worker has answered.
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  expect(Number.isFinite(await num(page, "defocus"))).toBe(true);
  expect(await num(page, "accommodation")).toBeLessThan(0.3); // 6 m is 0.17 D of demand

  // Bring the target from 6 m to 0.33 m: a 30-year-old accommodates and stays in focus.
  await page.getByTestId("target-distance").fill("0.33");
  await expect(page.getByTestId("demand")).toHaveText(/^3\.0\d$/);
  const acc = await num(page, "accommodation");
  expect(acc).toBeGreaterThan(2);
  await expect
    .poll(async () => Math.abs(await num(page, "defocus")), { timeout: 15_000 })
    .toBeLessThan(0.6);

  // A 60-year-old at the same distance is presbyopic: large hyperopic defocus.
  await page.getByTestId("age").fill("60");
  await expect(page.getByTestId("amplitude")).toHaveText(/^0\.\d\d$/);
  await expect.poll(async () => num(page, "defocus"), { timeout: 15_000 }).toBeGreaterThan(1.5);
});

test("selecting the untranscribed preset shows an error and keeps the eye", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  const powerBefore = await page.getByTestId("power").textContent();
  await page.getByTestId("preset").selectOption("zapata-diaz-2019");
  await expect(page.getByTestId("error")).toContainText("zapata-diaz-2019");
  await expect(page.getByTestId("power")).toHaveText(powerBefore ?? "");
});

test("regenerating the eye frees the old geometry (no GPU memory growth)", async ({ page }) => {
  test.setTimeout(150_000); // six regenerations under software WebGL in CI
  // three.js announces each WebGLRenderer to window.__THREE_DEVTOOLS__ when it exists.
  await page.addInitScript(() => {
    const hook = new EventTarget();
    hook.addEventListener("observe", (e) => {
      const d = (e as CustomEvent).detail as { info?: unknown };
      if (d && typeof d === "object" && "info" in d) (window as unknown as { __renderer: unknown }).__renderer = d;
    });
    (window as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = hook;
  });
  const geometries = () =>
    page.evaluate(
      () => (window as unknown as { __renderer: { info: { memory: { geometries: number } } } }).__renderer.info.memory.geometries,
    );
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  await page.waitForTimeout(500);
  const before = await geometries();
  // Each distance changes the accommodated lens, so all eight cutaway lathes regenerate.
  for (const d of ["2", "1", "0.5", "0.4", "0.33", "0.25"]) {
    const prev = await page.getByTestId("demand").textContent();
    await page.getByTestId("target-distance").fill(d);
    await expect(page.getByTestId("demand")).not.toHaveText(prev ?? "");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  // A leak keeps eight geometries per regeneration (48 here); allow small drift elsewhere.
  expect((await geometries()) - before).toBeLessThan(8);
});
