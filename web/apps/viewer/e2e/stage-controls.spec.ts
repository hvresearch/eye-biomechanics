import { expect, test } from "@playwright/test";

test("number keys snap the camera and Space toggles the transport", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("stage");
  await expect(stage).toHaveAttribute("data-view", "free");
  for (const [key, view] of [
    ["1", "anterior"],
    ["2", "lateral"],
    ["3", "superior"],
    ["4", "sagittal"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(stage).toHaveAttribute("data-view", view);
  }
  // The sagittal-section view cuts the eye sagittally.
  await expect(page.getByTestId("cut-orientation")).toHaveValue("sagittal");

  const play = page.getByTestId("transport-play");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-pressed", "false");

  // Keys typed into a field stay in the field.
  await page.getByTestId("age").focus();
  await page.keyboard.press("1");
  await expect(stage).toHaveAttribute("data-view", "sagittal");
});

test("hovering a structure shows its readout, a click pins it, Escape unpins", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("defocus")).not.toHaveText("…");
  const cornea = page.getByTestId("structure-cornea");
  await cornea.hover();
  const card = page.getByTestId("hover-card");
  await expect(card).toContainText("Cornea (right eye)");
  await expect(card).toContainText("Anterior radius");
  await expect(card).toContainText(/\d\.\d{2} mm/);

  await cornea.click();
  await expect(page.getByTestId("pin-right-cornea")).toBeVisible();
  await page.getByTestId("structure-lens").click();
  await expect(page.getByTestId("pin-right-lens")).toContainText("Approximation: homogeneous lens index");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pins")).toHaveCount(0);
});

test("the depth slider moves the cut plane", async ({ page }) => {
  await page.goto("/");
  const depth = page.getByTestId("cut-depth");
  await expect(depth).toHaveText("through the globe center");
  await page.getByTestId("cut-depth-slider").fill("3");
  await expect(depth).toHaveText("3.0 mm superior of the globe center");
  await page.getByTestId("cut-orientation").selectOption("frontal");
  await expect(depth).toHaveText("3.0 mm posterior of the globe center");
  // The slider stops at half the axial length.
  await page.getByTestId("cut-depth-slider").fill("-12");
  await expect(depth).toHaveText(/^1[12]\.\d mm anterior of the globe center$/);
});
