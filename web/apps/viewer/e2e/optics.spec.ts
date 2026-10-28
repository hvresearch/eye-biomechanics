import { expect, test, type Page } from "@playwright/test";

const text = async (page: Page, id: string) => (await page.getByTestId(id).textContent()) ?? "";
const num = (s: string) => Number(s.replace(/−/g, "-").replace(/[^0-9.+-]/g, ""));

/** "S / C × axis" or "S DS" → numbers (minus sign normalized). */
function parseRx(s: string): { sphere: number; cyl: number; axis: number } {
  const t = s.replace(/−/g, "-");
  const m = /([+-]?[\d.]+)\s*\/\s*([+-]?[\d.]+)\s*×\s*(\d+)/.exec(t);
  if (m) return { sphere: Number(m[1]), cyl: Number(m[2]), axis: Number(m[3]) };
  const ds = /([+-]?[\d.]+)\s*DS/.exec(t);
  if (ds) return { sphere: Number(ds[1]), cyl: 0, axis: 180 };
  throw new Error(`Unparsable refraction "${s}"`);
}

test("the optics strip shows the wavefront, Zernike bars, PSF, MTF, and retinal image", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("optics-strip")).toBeVisible();
  for (const id of ["wavefront-map-uncorrected", "zernike-bars", "psf-uncorrected", "mtf-chart", "retinal-uncorrected"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  expect(num(await text(page, "strehl-uncorrected"))).toBeGreaterThan(0);
  expect(num(await text(page, "strehl-uncorrected"))).toBeLessThanOrEqual(1);
});

test("the against-the-rule astigmat reads −1.5 D cylinder at 90°, and auto-prescribed spectacles remove most of the error", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByTestId("refraction-uncorrected")).toBeVisible();
  // At the fovea even the emmetrope shows a little oblique astigmatism; compare with it.
  const emm = parseRx(await text(page, "refraction-uncorrected"));
  await page.getByTestId("refractive-preset").selectOption("astigmat-1.5-atr-corneal");
  await expect.poll(async () => parseRx(await text(page, "refraction-uncorrected")).cyl, { timeout: 30_000 }).toBeLessThan(-1);
  const astig = parseRx(await text(page, "refraction-uncorrected"));
  expect(Math.abs(astig.cyl - emm.cyl - -1.5)).toBeLessThan(0.15);
  expect(Math.abs(astig.axis - 90)).toBeLessThan(3);

  await page.getByTestId("spectacles-on").check();
  await page.getByTestId("auto-prescribe").click();
  await expect(page.getByTestId("use-auto-rx")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("use-auto-rx").click();
  await expect(page.getByTestId("rms-corrected")).toBeVisible({ timeout: 30_000 });
  const ratio = async () => num(await text(page, "rms-corrected")) / num(await text(page, "rms-uncorrected"));
  // Through the prescribed lens, at the accommodation of the uncorrected eye: more than 80% less error.
  await expect.poll(ratio, { timeout: 30_000 }).toBeLessThan(0.2);
  await expect(page.getByTestId("wavefront-map-corrected")).toBeVisible();
  // Worn, the lens moves the paraxial far point and the eye accommodates a little more (see the M3
  // outcome notes), so the reduction is somewhat smaller but still large.
  await page.getByTestId("corrected").check();
  await expect(page.getByTestId("refraction")).toBeVisible();
  await expect.poll(ratio, { timeout: 30_000 }).toBeLessThan(0.35);
});

test("raising the luminance shrinks the pupil", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("pupil")).not.toHaveText("");
  const before = num(await text(page, "pupil"));
  const field = page.getByTestId("luminance");
  await field.fill("5000");
  await field.blur();
  await expect.poll(async () => num(await text(page, "pupil"))).toBeLessThan(before - 0.2);
});
