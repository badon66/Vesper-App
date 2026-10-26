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

test("dark is the default theme and the sign-in page points people to Keenan", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("Forgot your password? Ask Keenan.")).toBeVisible();
  await expect(page.getByRole("link", { name: /forgot/i })).toHaveCount(0);
});

test("the old set-password screen is gone", async ({ page }) => {
  const response = await page.goto("/set-password");
  expect(response?.status()).toBe(404);
});
