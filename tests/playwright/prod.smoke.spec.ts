import { existsSync } from "node:fs";

import { expect, test } from "@playwright/test";

const AUTH_STATE_PATH = "playwright/.auth/free-user.json";
const HAS_AUTH_STATE = existsSync(AUTH_STATE_PATH);

// Stable selectors — never break on copy changes
const sel = {
  todayEmptyState: '[data-testid="today-empty-state"]',
  todayBriefingContent: '[data-testid="today-briefing-content"]',
  generateBriefingBtn: '[data-testid="generate-briefing-btn"]',
  pricingFreePlanLabel: '[data-testid="pricing-free-plan-label"]',
  pricingUpgradeBtn: '[data-testid="pricing-upgrade-btn"]',
  generateForecastBtn: '[data-testid="generate-forecast-btn"]',
  forecastUpgradePaywall: '[data-testid="forecast-upgrade-paywall"]',
  forecastUpgradePaywallCta: '[data-testid="forecast-upgrade-paywall-cta"]',
  forecastStalePaywall: '[data-testid="forecast-stale-paywall"]',
  forecastPlanningLens: '[data-testid="forecast-planning-lens"]',
} as const;

test.use({ storageState: HAS_AUTH_STATE ? AUTH_STATE_PATH : undefined });
test.setTimeout(10 * 60 * 1000);

test("prod smoke — auth, Today, pricing, checkout, Pro unlock", async ({
  page,
  baseURL,
}) => {
  if (HAS_AUTH_STATE === false) {
    throw new Error(
      "Missing Playwright auth state. Run `npm run test:smoke:prod:auth` first.",
    );
  }

  if (baseURL == null) {
    throw new Error("Playwright baseURL is not configured.");
  }

  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  await page.goto("/dashboard");

  if (page.url().includes("/login")) {
    throw new Error(
      "Saved Playwright auth state is no longer authenticated. Run `npm run test:smoke:prod:auth` again.",
    );
  }

  if (page.url().includes("/onboarding")) {
    throw new Error(
      "The smoke-test user must complete onboarding before this test can run. " +
        "Run `npm run test:smoke:prod:auth` which auto-fills and submits the onboarding form.",
    );
  }

  // ── 2. Today loads — empty state or existing briefing ────────────────────
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.locator(sel.generateBriefingBtn)).toBeVisible({
    timeout: 15 * 1000,
  });

  const hasBriefing =
    (await page.locator(sel.todayBriefingContent).count()) > 0;
  const hasEmptyState =
    (await page.locator(sel.todayEmptyState).count()) > 0;

  expect(
    hasBriefing || hasEmptyState,
    "Today screen should show either an existing briefing or the empty state",
  ).toBe(true);

  // ── 3. Generate briefing if needed ───────────────────────────────────────
  if (!hasBriefing) {
    await page.locator(sel.generateBriefingBtn).click();
    await expect(page.locator(sel.todayBriefingContent)).toBeVisible({
      timeout: 3 * 60 * 1000,
    });
  }

  // ── 4. Pricing page — free user sees free label + upgrade CTA ────────────
  await page.goto("/pricing");
  await expect(page).toHaveURL(/\/pricing(?:\?|$)/);
  await expect(page.locator(sel.pricingFreePlanLabel)).toBeVisible({
    timeout: 15 * 1000,
  });
  await expect(page.locator(sel.pricingUpgradeBtn)).toBeVisible();

  // ── 5. Forecast — guard against pre-upgraded account ─────────────────────
  await page.goto("/forecast");
  await expect(page).toHaveURL(/\/forecast(?:\?|$)/);
  await expect(page.locator(sel.generateForecastBtn)).toBeVisible({
    timeout: 15 * 1000,
  });

  if ((await page.locator(sel.forecastPlanningLens).count()) > 0) {
    throw new Error(
      "The smoke-test user already has Pro Forecast depth. " +
        "Use a dedicated free user or reset the test user back to free.",
    );
  }

  // Generate forecast if needed
  if ((await page.locator(sel.forecastUpgradePaywall).count()) === 0) {
    await page.locator(sel.generateForecastBtn).click();
    await expect(page.locator(sel.forecastUpgradePaywall)).toBeVisible({
      timeout: 2 * 60 * 1000,
    });
  }

  // ── 6. Stripe Checkout ────────────────────────────────────────────────────
  const upgradeCtaBtn = page.locator(sel.forecastUpgradePaywallCta);
  await expect(upgradeCtaBtn).toBeVisible({ timeout: 15 * 1000 });

  await Promise.all([
    page.waitForURL(
      (url) => url.toString().startsWith(baseURL) === false,
      { timeout: 30 * 1000 },
    ),
    upgradeCtaBtn.click(),
  ]);

  await expect
    .poll(() => page.url(), {
      message: "Waiting for redirect into Stripe Checkout.",
      timeout: 15 * 1000,
    })
    .toContain("checkout.stripe.com");

  console.log("");
  console.log("Manual step required:");
  console.log("- Complete Stripe Checkout in the browser with a test card.");
  console.log("- Use: 4242 4242 4242 4242  |  any future expiry  |  any CVC");
  console.log("- After payment, let the browser return to the app.");
  console.log("");

  await page.waitForURL(
    (url) => url.toString().startsWith(baseURL),
    { timeout: 5 * 60 * 1000 },
  );

  await expect
    .poll(() => page.url(), {
      message: "Waiting for /billing/complete → app redirect with upgraded=1.",
      timeout: 30 * 1000,
    })
    .toContain("upgraded=1");

  // ── 7. Post-upgrade: stale prompt visible, upgrade CTA gone ──────────────
  await expect(page.locator(sel.forecastStalePaywall)).toBeVisible({
    timeout: 30 * 1000,
  });
  await expect(page.locator(sel.forecastUpgradePaywall)).toHaveCount(0);

  // ── 8. Regenerate to confirm full Pro depth unlocked ─────────────────────
  await page.locator(sel.generateForecastBtn).click();
  await expect(page.locator(sel.forecastPlanningLens)).toBeVisible({
    timeout: 3 * 60 * 1000,
  });
});
