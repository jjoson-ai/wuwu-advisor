import { defineConfig, devices } from "@playwright/test";

const CANONICAL_SMOKE_ORIGIN = "http://localhost:3000";
const configuredSmokeOrigin = process.env.WUWU_BASE_URL;

if (
  configuredSmokeOrigin != null &&
  configuredSmokeOrigin !== "" &&
  configuredSmokeOrigin !== CANONICAL_SMOKE_ORIGIN
) {
  throw new Error(
    `Playwright smoke tests require WUWU_BASE_URL=${CANONICAL_SMOKE_ORIGIN}. Received ${configuredSmokeOrigin}.`,
  );
}

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 10 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: CANONICAL_SMOKE_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "APP_URL=http://localhost:3000 npm run dev -- --hostname localhost --port 3000",
    url: CANONICAL_SMOKE_ORIGIN,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-smoke",
      testMatch: /checkout\.smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium-audit",
      testMatch: /ux-audit\.capture\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/free-user.json",
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    },
    {
      name: "iphone-audit",
      testMatch: /ux-audit\.capture\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        storageState: "playwright/.auth/free-user.json",
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    },
  ],
});
