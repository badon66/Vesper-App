import { expect, test } from "@playwright/test";

// The customer quote link is public (2026-11-02): no login wall, never
// indexed, no referrer, never cached, and a link that isn't live shows the
// expired screen with call and text and nothing else.

test("a quote link opens with no login, and a made-up one shows the expired screen", async ({ page }) => {
  const response = await page.goto("/q/AAAAAAAAAAAAAAAAAAAAAAAA");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/q\/AAAAAAAAAAAAAAAAAAAAAAAA$/);
  await expect(page.getByRole("heading", { name: "This quote has expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute("href", /^tel:\+1\d{10}$/);
  await expect(page.getByRole("link", { name: "Text" })).toHaveAttribute("href", /^sms:\+1\d{10}$/);
  await expect(page.getByText("$")).toHaveCount(0);
});

test("quote pages are not indexed, send no referrer and are never cached", async ({ page }) => {
  const response = await page.goto("/q/AAAAAAAAAAAAAAAAAAAAAAAA");
  const headers = response?.headers() ?? {};
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toContain("no-store");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
});

test("the quote page is white whatever theme the app uses", async ({ page }) => {
  await page.goto("/q/AAAAAAAAAAAAAAAAAAAAAAAA");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(255, 255, 255)");
});
