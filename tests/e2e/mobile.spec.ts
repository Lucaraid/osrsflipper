import { expect, test } from "@playwright/test";

test("Mobile: Navigation, Scanner-Karten, Rechner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Schnellnavigation" })).toBeVisible();
  await page.getByRole("navigation", { name: "Schnellnavigation" }).getByRole("link", { name: "Scanner" }).click();
  await expect(page.getByTestId("scanner-cards").locator("li").first()).toBeVisible();
  await expect(page.getByTestId("scanner-table")).toBeHidden();
  // kein horizontales Scrollen der Seite
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId("menu-button").click();
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Profit-Rechner" }).click();
  await page.getByTestId("calc-buy").fill("100");
  await page.getByTestId("calc-sell").fill("120");
  await page.getByTestId("calc-qty").fill("1");
  await expect(page.getByTestId("calc-net")).toHaveText("18");
});
