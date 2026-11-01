import { expect, test, type Page } from "@playwright/test";

/**
 * Demand at a 0.33 m target: 3 D less the relaxed far point, which is the minimum-RMS spherical
 * equivalent at the pupil (the emmetropic schematic eye reads a few tenths of a diopter myopic).
 */
const NEAR_DEMAND = /^(2\.[6-9]\d|3\.0\d)$/;

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
  expect(await num(page, "accommodation")).toBeLessThan(0.3); // 6 m is at most 0.17 D of demand

  // Bring the target from 6 m to 0.33 m: a 30-year-old accommodates and stays in focus.
  await page.getByTestId("target-distance").fill("0.33");
  await expect(page.getByTestId("demand")).toHaveText(NEAR_DEMAND);
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

test("typing into the number boxes key by key commits the typed value", async ({ page }) => {
  test.setTimeout(120_000); // each committed keystroke regenerates the eye under software WebGL in CI
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");

  // Partly typed values ("4", "0", "0.") are out of range and must not be clamped mid-entry.
  const age = page.getByTestId("age");
  await age.selectText();
  await age.press("Backspace");
  await age.pressSequentially("45", { delay: 50 });
  await age.press("Enter");
  await expect(age).toHaveValue("45");
  await expect(page.getByTestId("amplitude")).toHaveText(/^1\.\d\d$/); // Anderson 2008 at 45 y

  const distance = page.getByTestId("target-distance");
  await distance.selectText();
  await distance.press("Backspace");
  await distance.pressSequentially("0.33", { delay: 50 });
  await distance.blur();
  await expect(distance).toHaveValue("0.33");
  await expect(page.getByTestId("demand")).toHaveText(NEAR_DEMAND);

  // An out-of-range entry is clamped once, when editing ends.
  await age.selectText();
  await age.pressSequentially("630", { delay: 50 });
  await age.blur();
  await expect(age).toHaveValue("90");

  // Clearing the box and leaving it restores the current value rather than committing zero.
  await distance.selectText();
  await distance.press("Backspace");
  await distance.blur();
  await expect(distance).toHaveValue("0.33");
  await expect(page.getByTestId("demand")).toHaveText(NEAR_DEMAND);
});

test("the distance slider maps logarithmically onto the target distance", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  const slider = page.getByTestId("target-distance-slider");
  // The slider runs over log10(distance): its minimum is 0.1 m, about 9.5 D for each eye
  // (31.5 mm to the side of the midline).
  await slider.fill(String(Math.log10(0.1)));
  await expect(page.getByTestId("target-distance")).toHaveValue("0.1");
  await expect.poll(async () => num(page, "demand")).toBeGreaterThan(9);
  await slider.fill(Math.log10(0.33).toFixed(3)); // on the slider's 0.001 step grid
  await expect(page.getByTestId("target-distance")).toHaveValue("0.33");
  await expect(page.getByTestId("demand")).toHaveText(NEAR_DEMAND);
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
  // Each distance changes the accommodated lens, so the lens, aqueous, iris, and vitreous
  // lathes regenerate; the cornea, sclera, retina, and ciliary body are reused.
  for (const d of ["2", "1", "0.5", "0.4", "0.33", "0.25"]) {
    const prev = await page.getByTestId("demand").textContent();
    await page.getByTestId("target-distance").fill(d);
    await expect(page.getByTestId("demand")).not.toHaveText(prev ?? "");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  // A leak keeps four geometries per regeneration (24 here); allow small drift elsewhere.
  expect((await geometries()) - before).toBeLessThan(8);
});
