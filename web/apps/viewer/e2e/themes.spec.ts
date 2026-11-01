import { expect, test, type Page } from "@playwright/test";

/** Collects console errors and uncaught exceptions from the page. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const backgroundOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test("both themes render the stage and the optics strip without errors, and the choice persists", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("stage").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("wavefront-map-uncorrected")).toBeVisible({ timeout: 30_000 });
  const darkSurface = await backgroundOf(page, ".inspector");
  await page.screenshot({ path: testInfo.outputPath("theme-dark.png"), fullPage: true });

  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("wavefront-map-uncorrected")).toBeVisible();
  const lightSurface = await backgroundOf(page, ".inspector");
  expect(lightSurface).not.toBe(darkSurface);
  // The light surface is light: every channel above the midpoint.
  const channels = (lightSurface.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  expect(channels.every((c) => c > 200)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("theme-light.png"), fullPage: true });

  // Remembered across a reload.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("stage").locator("canvas")).toBeVisible();
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  expect(errors).toEqual([]);
});
