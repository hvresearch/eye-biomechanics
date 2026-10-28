import { expect, test, type Page } from "@playwright/test";

const text = async (page: Page, id: string) => (await page.getByTestId(id).textContent()) ?? "";
const num = (s: string) => Number(s.replace(/−/g, "-").replace(/[^0-9.+-]/g, ""));

test("loading the committed FEM result shows a nonzero induced cylinder and the heat-map legend", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("biomech-result").selectOption("emmetrope-right-primary-15mmHg");
  await expect(page.getByTestId("biomech-label")).toContainText("elastic FEM");
  // ΔCylinder × axis, three decimals: "−0.127 × 161".
  await expect.poll(async () => text(page, "induced-cylinder"), { timeout: 30_000 }).toMatch(/[−-]0\.\d{3} × \d+/);
  const m = /([−-]0\.\d{3}) × (\d+)/.exec(await text(page, "induced-cylinder"));
  expect(Math.abs(num(m![1]!))).toBeGreaterThan(0.0005);
  await expect(page.getByTestId("heatmap-legend")).toBeVisible();
  expect(num(await text(page, "legend-max"))).toBeGreaterThan(0);

  // The exaggeration slider drives the legend's ×N label.
  const before = await text(page, "legend-exaggeration");
  await page.getByTestId("exaggeration-slider").fill("2");
  await expect(page.getByTestId("legend-exaggeration")).toHaveText("×100");
  expect(before).not.toBe("×100");

  await page.getByTestId("biomech-clear").click();
  await expect(page.getByTestId("heatmap-legend")).toHaveCount(0);
});

test("a file with an unknown schema major version is refused with a banner naming it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("biomech-file").setInputFiles({
    name: "future.eye.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: "2.0.0", id: "x" })),
  });
  await expect(page.getByTestId("load-error")).toContainText("2.0.0");
});
