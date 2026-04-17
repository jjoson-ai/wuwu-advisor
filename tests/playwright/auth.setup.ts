import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, type BrowserContext, type Page, test } from "@playwright/test";

const AUTH_STATE_PATH = "playwright/.auth/free-user.json";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const ONBOARDING_FORM_TIMEOUT_MS = 60 * 1000;
const AUTO_LOGIN_EMAIL =
  process.env.WUWU_SMOKE_EMAIL ?? process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL ?? null;
const AUTO_LOGIN_PASSWORD =
  process.env.WUWU_SMOKE_PASSWORD ?? process.env.EXPO_PUBLIC_TEST_ACCOUNT_PASSWORD ?? null;

const DEFAULT_SMOKE_ONBOARDING = {
  displayName: process.env.WUWU_SMOKE_DISPLAY_NAME ?? "Smoke Test User",
  fullBirthNameForNumerology:
    process.env.WUWU_SMOKE_FULL_BIRTH_NAME ?? "Smoke Test User",
  birthDate: process.env.WUWU_SMOKE_BIRTH_DATE ?? "1990-01-01",
  birthTime: process.env.WUWU_SMOKE_BIRTH_TIME ?? "12:00",
  birthTimeConfidence: process.env.WUWU_SMOKE_BIRTH_TIME_CONFIDENCE ?? "exact",
  birthCity: process.env.WUWU_SMOKE_BIRTH_CITY ?? "Madrid",
  birthCountry: process.env.WUWU_SMOKE_BIRTH_COUNTRY ?? "Spain",
  timezone: process.env.WUWU_SMOKE_TIMEZONE ?? "Europe/Madrid",
  tonePreference: process.env.WUWU_SMOKE_TONE_PREFERENCE ?? "grounded",
};

function isAuthenticatedAppUrl(url: string, baseURL: string) {
  return (
    url.startsWith(baseURL) &&
    url.includes("/login") === false &&
    url.includes("/auth/callback") === false
  );
}

function isAuthCallbackUrl(url: string, baseURL: string) {
  return url.startsWith(baseURL) && url.includes("/auth/callback");
}

async function hasSupabaseSessionCookie(
  context: BrowserContext,
  baseURL: string,
) {
  const cookies = await context.cookies([baseURL]);
  return cookies.some((cookie) =>
    /^sb-.*auth-token(?:\.\d+)?$/.test(cookie.name),
  );
}

function getAuthenticatedAppPage(
  context: BrowserContext,
  baseURL: string,
) {
  const matchingPages = context
    .pages()
    .filter((candidate) => isAuthenticatedAppUrl(candidate.url(), baseURL));

  return matchingPages.at(-1) ?? null;
}

async function waitForAuthenticatedAppPage(
  context: BrowserContext,
  fallbackPage: Page,
  baseURL: string,
) {
  const startedAt = Date.now();
  let callbackSeen = false;
  let sessionCookieSeen = false;

  while (Date.now() - startedAt < AUTH_TIMEOUT_MS) {
    const authenticatedPage = getAuthenticatedAppPage(context, baseURL);

    if (authenticatedPage !== null) {
      return {
        authenticatedPage,
        callbackSeen,
        sessionCookieSeen,
      };
    }

    const urls = context.pages().map((candidate) => candidate.url());

    if (urls.some((url) => isAuthCallbackUrl(url, baseURL))) {
      callbackSeen = true;
    }

    if (await hasSupabaseSessionCookie(context, baseURL)) {
      sessionCookieSeen = true;

      const appPage =
        context
          .pages()
          .filter((candidate) => candidate.url().startsWith(baseURL))
          .at(-1) ?? fallbackPage;

      if (isAuthenticatedAppUrl(appPage.url(), baseURL) === false) {
        await appPage.goto(`${baseURL}/forecast`, {
          waitUntil: "domcontentloaded",
        });
      }
    }

    await fallbackPage.waitForTimeout(1000);
  }

  const urls = context.pages().map((candidate) => candidate.url());
  const sessionCookiePresent = await hasSupabaseSessionCookie(context, baseURL);

  throw new Error(
    [
      "Timed out waiting for manual login to settle in Playwright.",
      `Current URLs: ${urls.join(" | ") || "(none)"}`,
      `Auth callback seen: ${callbackSeen}`,
      `Supabase session cookie present: ${sessionCookiePresent}`,
      "Make sure you completed sign-in in this same Playwright browser window and let the app finish redirecting.",
    ].join("\n"),
  );
}

async function completeOnboardingIfNeeded(page: Page) {
  if (page.url().includes("/onboarding") === false) {
    return;
  }

  console.log("Onboarding detected. Filling the minimum smoke-test profile automatically.");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
    timeout: ONBOARDING_FORM_TIMEOUT_MS,
  });

  await page.getByLabel("Display name").fill(DEFAULT_SMOKE_ONBOARDING.displayName);
  await page
    .getByLabel("Current timezone")
    .selectOption(DEFAULT_SMOKE_ONBOARDING.timezone);
  await page
    .getByLabel("Full birth name (for numerology)")
    .fill(DEFAULT_SMOKE_ONBOARDING.fullBirthNameForNumerology);
  await page.getByLabel("Birth date").fill(DEFAULT_SMOKE_ONBOARDING.birthDate);
  await page.locator('input[name="birthTime"]').fill(DEFAULT_SMOKE_ONBOARDING.birthTime);
  await page
    .locator('select[name="birthTimeConfidence"]')
    .selectOption(DEFAULT_SMOKE_ONBOARDING.birthTimeConfidence);
  await page
    .getByLabel("How should the app sound?")
    .selectOption(DEFAULT_SMOKE_ONBOARDING.tonePreference);
  await page.getByLabel("Birth city").fill(DEFAULT_SMOKE_ONBOARDING.birthCity);
  await page.getByLabel("Birth country").fill(DEFAULT_SMOKE_ONBOARDING.birthCountry);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/dashboard", {
      timeout: ONBOARDING_FORM_TIMEOUT_MS,
    }),
    page.getByRole("button", { name: "Save and continue" }).click(),
  ]);
}

test("capture authenticated free-user browser state", async ({ page, context, baseURL }) => {
  if (baseURL == null) {
    throw new Error("Playwright baseURL is not configured.");
  }

  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });

  await page.goto("/forecast");

  if (page.url().includes("/login")) {
    if (AUTO_LOGIN_EMAIL !== null && AUTO_LOGIN_PASSWORD !== null) {
      await page.getByRole("button", { name: "Login", exact: true }).click();
      await page.getByLabel("Email").fill(AUTO_LOGIN_EMAIL);
      await page.getByLabel("Password").fill(AUTO_LOGIN_PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }

    console.log("");
    console.log("Manual step required:");
    console.log("- Sign in in this Playwright browser window using the dedicated free test user.");
    console.log("- Complete onboarding if prompted.");
    console.log("- Leave the browser on the app after sign-in.");
    console.log("");
  }

  const { authenticatedPage } = await waitForAuthenticatedAppPage(
    context,
    page,
    baseURL,
  );

  await authenticatedPage.bringToFront();
  await completeOnboardingIfNeeded(authenticatedPage);
  await authenticatedPage.goto("/forecast", { waitUntil: "domcontentloaded" });
  await expect(authenticatedPage).toHaveURL(/\/forecast(?:\?|$)/);

  await expect(
    authenticatedPage.getByRole("heading", { name: "Forecast", exact: true }),
  ).toBeVisible();

  await context.storageState({ path: AUTH_STATE_PATH });
});
