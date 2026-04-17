import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

const AUTH_STATE_PATH = "playwright/.auth/free-user.json";
const HAS_AUTH_STATE = existsSync(AUTH_STATE_PATH);

test.use({ storageState: HAS_AUTH_STATE ? AUTH_STATE_PATH : undefined });
test.setTimeout(10 * 60 * 1000);

test("web Pro checkout smoke path", async ({ page, baseURL }) => {
  if (HAS_AUTH_STATE === false) {
    throw new Error("Missing Playwright auth state. Run `npm run test:smoke:auth` first.");
  }

  if (baseURL == null) {
    throw new Error("Playwright baseURL is not configured.");
  }

  await page.goto("/forecast");

  if (page.url().includes("/login")) {
    throw new Error(
      "Saved Playwright auth state is no longer authenticated. Run `npm run test:smoke:auth` again.",
    );
  }

  if (page.url().includes("/onboarding")) {
    throw new Error(
      "The smoke-test user must complete onboarding before the checkout smoke test can run.",
    );
  }

  await expect(page).toHaveURL(/\/forecast(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Forecast", exact: true }),
  ).toBeVisible();

  if ((await page.getByText("Planning lens").count()) > 0) {
    throw new Error(
      "The saved test user already has Pro Forecast depth. Use a dedicated free user or reset the test user back to free first.",
    );
  }

  const generateButton = page.getByRole("button", { name: "Generate My Forecast" });

  if ((await generateButton.count()) > 0 && (await generateButton.first().isVisible())) {
    await generateButton.first().click();
    await expect(
      page.getByRole("heading", { name: /What['’]s unfolding this month/i }),
    ).toBeVisible({ timeout: 120 * 1000 });
  }

  const unlockButton = page.getByRole("button", { name: "Unlock Pro" }).first();
  await expect(unlockButton).toBeVisible({ timeout: 30 * 1000 });

  await Promise.all([
    page.waitForURL(
      (url) => url.toString().startsWith(baseURL) === false,
      { timeout: 30 * 1000 },
    ),
    unlockButton.click(),
  ]);

  await expect
    .poll(() => page.url(), {
      message: "Waiting for redirect into Stripe Checkout.",
      timeout: 15 * 1000,
    })
    .toContain("checkout.stripe.com");

  console.log("");
  console.log("Manual step required:");
  console.log("- Complete Stripe Checkout in the opened browser window with a test card.");
  console.log("- Use a normal success card such as 4242 4242 4242 4242.");
  console.log("- After payment, let the browser return to the app.");
  console.log("");

  await page.waitForURL(
    (url) => url.toString().startsWith(baseURL),
    { timeout: 5 * 60 * 1000 },
  );

  await expect
    .poll(() => page.url(), {
      message: "Waiting for final app return after /billing/complete.",
      timeout: 30 * 1000,
    })
    .toContain("upgraded=1");

  await expect(
    page.getByText(/Refresh for your current tier|Needs refresh/i).first(),
  ).toBeVisible({ timeout: 30 * 1000 });
  await expect(page.getByRole("button", { name: "Unlock Pro" })).toHaveCount(0);

  await page.getByRole("button", { name: "Regenerate Forecast" }).first().click();
  await expect(page.getByText("Planning lens")).toBeVisible({
    timeout: 3 * 60 * 1000,
  });
});
