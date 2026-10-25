import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against a production build on a separate port so they do
// not collide with `npm run dev`. Run `npm run build` first.
const port = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  // iPhone viewport and touch, but driven by Chromium: WebKit is not
  // installed in the cloud build environment and the checks here are about
  // routing and markup, not rendering engines.
  projects: [
    {
      name: "phone",
      use: { ...devices["iPhone 14"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
