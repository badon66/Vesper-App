import { expect, test } from "@playwright/test";

test("the root sends you to the app, which sends you to login when signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a protected app route redirects to login and remembers where you were going", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
});

test("the login page has the PWA manifest and apple touch icon", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
