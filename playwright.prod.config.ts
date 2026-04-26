import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.WUWU_PROD_URL ?? "https://wuwu-advisor.vercel.app";

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 10 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-smoke",
      testMatch: /prod\.smoke\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/free-user.json",
      },
    },
  ],
});
