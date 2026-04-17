import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import {
  AUDIT_RUN_ID,
  AUTH_STATE_PATH,
  collectVisibleSummary,
  getProjectDirectory,
  getScenarioDirectory,
  hasSupabaseSessionCookie,
  setDebugAccessLevel,
  writeProjectStatus,
  writeSummaryArtifacts,
} from "./ux-audit.utils";

const HAS_AUTH_STATE = existsSync(join(process.cwd(), AUTH_STATE_PATH));
const CAPTURE_TIMEOUT_MS = 2 * 60 * 1000;
const FREE_ASK_QUESTION = "What should I focus on over the next 30 days?";
const PRO_ASK_QUESTION = "What should I commit to next, and what should I delay?";
const FREEZE_CAPTURE = process.env.WUWU_AUDIT_FREEZE === "1";
const NO_FROZEN_ASK_ARTIFACT_ERROR =
  "Freeze mode is enabled and no visible Ask artifact is available to reuse.";
const SCENARIO_FILTER = new Set(
  (process.env.WUWU_AUDIT_SCENARIOS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function shouldCapture(slug: string) {
  return SCENARIO_FILTER.size === 0 || SCENARIO_FILTER.has(slug);
}

function isNoFrozenAskArtifactError(error: unknown) {
  return error instanceof Error && error.message === NO_FROZEN_ASK_ARTIFACT_ERROR;
}

async function expectFrozenForecastProState(page: Page) {
  await gotoStable(page, "/forecast");
  await waitForPageHeading(page, "/forecast", "Forecast");
  await expect(page.getByText("Planning lens", { exact: true })).toBeVisible();
}

async function expectFrozenBlueprintProState(page: Page) {
  await gotoStable(page, "/blueprint");
  await waitForPageHeading(page, "/blueprint", "Your Birth Blueprint");
  const hasBaziSignatureHeading =
    (await page.getByRole("heading", { name: "BaZi signature", exact: true }).count()) > 0;
  const hasBaziFallbackHeading =
    (await page
      .getByRole("heading", { name: "BaZi / Four Pillars", exact: true })
      .count()) > 0;

  expect(
    hasBaziSignatureHeading || hasBaziFallbackHeading,
    "Expected a frozen Pro Blueprint artifact to already be present.",
  ).toBeTruthy();
}

async function expectFrozenTodayProState(page: Page) {
  await gotoStable(page, "/dashboard");
  await waitForPageHeading(page, "/dashboard", "Today");
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
}

async function expectFrozenAskProState(page: Page) {
  await gotoStable(page, "/decision");
  await waitForPageHeading(page, "/decision", "Ask");
  const directAnswerHeading = page.getByRole("heading", { name: "Direct answer", exact: true });

  if (!(await isVisibleNow(directAnswerHeading))) {
    throw new Error(NO_FROZEN_ASK_ARTIFACT_ERROR);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function gotoStable(page: Page, path: string) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;

      if (
        error instanceof Error &&
        error.message.includes("interrupted by another navigation")
      ) {
        await page.waitForLoadState("domcontentloaded").catch(() => {});

        const currentPath = new URL(page.url()).pathname;

        if (currentPath === path) {
          return;
        }

        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to navigate stably to ${path}.`);
}

async function ensureAuthenticatedApp(page: Page, baseURL: string) {
  await gotoStable(page, "/dashboard");

  if (page.url().includes("/login")) {
    throw new Error(
      `Missing authenticated browser state for ${baseURL}. Run \`npm run test:smoke:auth\` first.`,
    );
  }

  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
}

async function waitForPageHeading(page: Page, path: string, heading: string) {
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
}

async function isVisibleNow(locator: Locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function waitForGenerationResponse(page: Page, apiPath: string) {
  const response = await page.waitForResponse(
    (response) =>
      response.url().includes(apiPath) && response.request().method() === "POST",
    { timeout: CAPTURE_TIMEOUT_MS },
  );

  if (response.ok()) {
    return response;
  }

  let body = "";

  try {
    body = await response.text();
  } catch {
    body = "";
  }

  throw new Error(
    `Request to ${apiPath} failed with ${response.status()}: ${body || "(empty body)"}`,
  );
}

async function postFromBrowser(
  page: Page,
  input: {
    apiPath: string;
    body?: Record<string, unknown>;
  },
) {
  const responsePromise = waitForGenerationResponse(page, input.apiPath);

  const result = await page.evaluate(
    async ({ apiPath, body }) => {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": body == null ? "text/plain;charset=UTF-8" : "application/json",
          "x-wuwu-product-platform": "web",
        },
        body: body == null ? undefined : JSON.stringify(body),
      });

      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    },
    input,
  );

  const networkResponse = await responsePromise;

  if (result.ok === false || networkResponse.ok() === false) {
    throw new Error(
      `Request to ${input.apiPath} failed with ${result.status}: ${result.text || "(empty body)"}`,
    );
  }
}

async function ensureTodayArtifact(page: Page, options?: { force?: boolean }) {
  await gotoStable(page, "/dashboard");
  await waitForPageHeading(page, "/dashboard", "Today");

  if (
    options?.force !== true &&
    (await page.getByRole("heading", { name: "Summary", exact: true }).count()) > 0 &&
    (await page
      .getByRole("heading", { name: "Refresh for your current tier", exact: true })
      .count()) === 0
  ) {
    return;
  }

  await postFromBrowser(page, { apiPath: "/api/generate-briefing" });
  await gotoStable(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible({
    timeout: CAPTURE_TIMEOUT_MS,
  });
}

async function ensureForecastArtifact(page: Page, options?: { force?: boolean }) {
  await gotoStable(page, "/forecast");
  await waitForPageHeading(page, "/forecast", "Forecast");

  if (
    options?.force !== true &&
    (await page
      .getByRole("heading", {
        name: "What's unfolding this month",
        exact: true,
      })
      .count()) > 0 &&
    (await page
      .getByRole("heading", { name: "Refresh for your current tier", exact: true })
      .count()) === 0
  ) {
    return;
  }

  await postFromBrowser(page, { apiPath: "/api/generate-forecast" });
  await gotoStable(page, "/forecast");
  await expect(
    page.getByRole("heading", {
      name: "What's unfolding this month",
      exact: true,
    }),
  ).toBeVisible({
    timeout: CAPTURE_TIMEOUT_MS,
  });
}

async function ensureBlueprintArtifact(page: Page, options?: { force?: boolean }) {
  await gotoStable(page, "/blueprint");
  await waitForPageHeading(page, "/blueprint", "Your Birth Blueprint");

  if (
    options?.force !== true &&
    (await page.getByRole("heading", { name: "Overview", exact: true }).count()) > 0 &&
    (await page
      .getByRole("heading", { name: "Refresh for your current tier", exact: true })
      .count()) === 0
  ) {
    return;
  }

  await postFromBrowser(page, { apiPath: "/api/generate-blueprint" });
  await gotoStable(page, "/blueprint");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: CAPTURE_TIMEOUT_MS,
  });
}

async function ensureAskArtifact(
  page: Page,
  question: string,
  options?: { force?: boolean },
) {
  await gotoStable(page, "/decision");
  await waitForPageHeading(page, "/decision", "Ask");

  if (
    options?.force !== true &&
    (await page.getByRole("heading", { name: "Direct answer", exact: true }).count()) > 0 &&
    (await page
      .getByRole("heading", { name: "Ask again for your current tier", exact: true })
      .count()) === 0
  ) {
    return;
  }

  if (FREEZE_CAPTURE) {
    const directAnswerHeading = page.getByRole("heading", { name: "Direct answer", exact: true });

    if (await isVisibleNow(directAnswerHeading)) {
      return;
    }

    throw new Error(NO_FROZEN_ASK_ARTIFACT_ERROR);
  }

  await postFromBrowser(page, {
    apiPath: "/api/generate-decision-guidance",
    body: { question },
  });
  await gotoStable(page, "/decision");
  await expect(page.getByRole("heading", { name: "Direct answer", exact: true })).toBeVisible({
    timeout: CAPTURE_TIMEOUT_MS,
  });
}

async function captureScenario(
  page: Page,
  testInfo: TestInfo,
  input: {
    slug: string;
    tier: "free" | "pro";
    surface: string;
    path: string;
    note?: string;
    prepare?: () => Promise<void>;
    focus?: () => Promise<void>;
  },
) {
  const directory = getScenarioDirectory(testInfo, input.slug);
  const context = page.context();

  console.log(`[ux-audit] Capturing ${testInfo.project.name} :: ${input.slug}`);
  writeProjectStatus(testInfo, {
    phase: "capturing",
    scenario: input.slug,
    tier: input.tier,
    path: input.path,
  });

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  try {
    if (input.prepare !== undefined) {
      await input.prepare();
    }

    if (input.focus !== undefined) {
      await input.focus();
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    await page.screenshot({ path: join(directory, "viewport.png") });
    await page.screenshot({ fullPage: true, path: join(directory, "full-page.png") });

    const summary = await collectVisibleSummary(page);
    const sessionPresent =
      testInfo.project.use.baseURL == null
        ? null
        : await hasSupabaseSessionCookie(context, String(testInfo.project.use.baseURL));

    writeSummaryArtifacts(directory, summary, {
      runId: AUDIT_RUN_ID,
      project: testInfo.project.name,
      projectUse: {
        viewport: testInfo.project.use.viewport ?? null,
        isMobile: testInfo.project.use.isMobile ?? false,
      },
      slug: input.slug,
      capturedAt: new Date().toISOString(),
      tier: input.tier,
      surface: input.surface,
      path: input.path,
      finalUrl: page.url(),
      note: input.note ?? null,
      sessionPresent,
      userAgent: await page.evaluate(() => navigator.userAgent),
    });
  } finally {
    await context.tracing.stop({ path: join(directory, "trace.zip") });
  }
}

function markStep(
  testInfo: TestInfo,
  phase: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  console.log(`[ux-audit] ${testInfo.project.name} :: ${detail}`);
  writeProjectStatus(testInfo, {
    phase,
    detail,
    ...extra,
  });
}

test("capture core UX audit surfaces", async ({ page, baseURL }, testInfo) => {
  if (HAS_AUTH_STATE === false) {
    throw new Error("Missing Playwright auth state. Run `npm run test:smoke:auth` first.");
  }

  if (baseURL == null) {
    throw new Error("Playwright baseURL is not configured.");
  }

  getProjectDirectory(testInfo);
  markStep(testInfo, "starting", "Checking authenticated app state.", {
    baseURL,
  });
  await ensureAuthenticatedApp(page, baseURL);

  await setDebugAccessLevel(page, "free", "/dashboard");

  if (shouldCapture("today-free")) {
    markStep(testInfo, "generating", "Switching to free access and generating Today.", {
      tier: "free",
      surface: "today",
    });
    await ensureTodayArtifact(page, { force: FREEZE_CAPTURE === false });
    await captureScenario(page, testInfo, {
      slug: "today-free",
      tier: "free",
      surface: "today",
      path: "/dashboard",
      note: "Free Today main state after regeneration.",
      prepare: async () => {
        await gotoStable(page, "/dashboard");
        await waitForPageHeading(page, "/dashboard", "Today");
      },
    });
  }

  if (shouldCapture("forecast-free") || shouldCapture("forecast-free-paywall")) {
    markStep(testInfo, "generating", "Generating free Forecast.", {
      tier: "free",
      surface: "forecast",
    });
    await ensureForecastArtifact(page, { force: FREEZE_CAPTURE === false });
  }
  if (shouldCapture("forecast-free")) {
    await captureScenario(page, testInfo, {
      slug: "forecast-free",
      tier: "free",
      surface: "forecast",
      path: "/forecast",
      note: "Free Forecast main state.",
      prepare: async () => {
        await gotoStable(page, "/forecast");
        await waitForPageHeading(page, "/forecast", "Forecast");
      },
    });
  }
  if (shouldCapture("forecast-free-paywall")) {
    await captureScenario(page, testInfo, {
      slug: "forecast-free-paywall",
      tier: "free",
      surface: "forecast-paywall",
      path: "/forecast",
      note: "Free Forecast locked-card paywall moment.",
      prepare: async () => {
        await gotoStable(page, "/forecast");
        await waitForPageHeading(page, "/forecast", "Forecast");
      },
      focus: async () => {
        const unlockButton = page.getByRole("button", { name: "Unlock Pro", exact: true }).first();
        await unlockButton.scrollIntoViewIfNeeded();
        await expect(unlockButton).toBeVisible();
      },
    });
  }

  if (shouldCapture("blueprint-free") || shouldCapture("blueprint-free-paywall")) {
    markStep(testInfo, "generating", "Generating free Blueprint.", {
      tier: "free",
      surface: "blueprint",
    });
    await ensureBlueprintArtifact(page, { force: FREEZE_CAPTURE === false });
  }
  if (shouldCapture("blueprint-free")) {
    await captureScenario(page, testInfo, {
      slug: "blueprint-free",
      tier: "free",
      surface: "blueprint",
      path: "/blueprint",
      note: "Free Blueprint main state.",
      prepare: async () => {
        await gotoStable(page, "/blueprint");
        await waitForPageHeading(page, "/blueprint", "Your Birth Blueprint");
      },
    });
  }
  if (shouldCapture("blueprint-free-paywall")) {
    await captureScenario(page, testInfo, {
      slug: "blueprint-free-paywall",
      tier: "free",
      surface: "blueprint-paywall",
      path: "/blueprint",
      note: "Free Blueprint locked-card paywall moment.",
      prepare: async () => {
        await gotoStable(page, "/blueprint");
        await waitForPageHeading(page, "/blueprint", "Your Birth Blueprint");
      },
      focus: async () => {
        const unlockButton = page.getByRole("button", { name: "Unlock Pro", exact: true }).first();
        await unlockButton.scrollIntoViewIfNeeded();
        await expect(unlockButton).toBeVisible();
      },
    });
  }

  if (shouldCapture("ask-free")) {
    markStep(testInfo, "generating", "Submitting free Ask capture question.", {
      tier: "free",
      surface: "ask",
    });
    try {
      await ensureAskArtifact(page, FREE_ASK_QUESTION, { force: FREEZE_CAPTURE === false });
      await captureScenario(page, testInfo, {
        slug: "ask-free",
        tier: "free",
        surface: "ask",
        path: "/decision",
        note: "Free Ask main state after submitting one question.",
        prepare: async () => {
          await gotoStable(page, "/decision");
          await waitForPageHeading(page, "/decision", "Ask");
        },
      });
    } catch (error) {
      if (!FREEZE_CAPTURE || !isNoFrozenAskArtifactError(error)) {
        throw error;
      }

      markStep(testInfo, "skipped", "Skipping frozen Ask free capture because no reusable Ask result is visible.", {
        tier: "free",
        surface: "ask",
      });
    }
  }

  if (shouldCapture("settings-account")) {
    await captureScenario(page, testInfo, {
      slug: "settings-account",
      tier: "free",
      surface: "settings-account",
      path: "/onboarding",
      note: "Settings and account editing surface.",
      prepare: async () => {
        await gotoStable(page, "/onboarding");
        await waitForPageHeading(page, "/onboarding", "Settings");
      },
    });
  }

  if (shouldCapture("settings-privacy")) {
    await captureScenario(page, testInfo, {
      slug: "settings-privacy",
      tier: "free",
      surface: "settings-privacy",
      path: "/onboarding",
      note: "Settings privacy and data surface.",
      prepare: async () => {
        await gotoStable(page, "/onboarding");
        await waitForPageHeading(page, "/onboarding", "Settings");
      },
      focus: async () => {
        const privacyHeading = page.getByText("Privacy & data", { exact: true });
        await privacyHeading.scrollIntoViewIfNeeded();
        await expect(privacyHeading).toBeVisible();
      },
    });
  }

  await setDebugAccessLevel(page, "pro", "/forecast");
  if (shouldCapture("forecast-pro-stale")) {
    markStep(testInfo, "generating", "Switching to pro and capturing stale Forecast.", {
      tier: "pro",
      surface: "forecast",
    });
    await gotoStable(page, "/forecast");
    await waitForPageHeading(page, "/forecast", "Forecast");

    const staleForecastHeading = page.getByRole("heading", {
      name: "Refresh for your current tier",
      exact: true,
    });

    if (FREEZE_CAPTURE && !(await isVisibleNow(staleForecastHeading))) {
      markStep(testInfo, "skipped", "Skipping frozen Forecast stale capture because no stale state is present.", {
        tier: "pro",
        surface: "forecast-stale",
      });
    } else {
      await captureScenario(page, testInfo, {
        slug: "forecast-pro-stale",
        tier: "pro",
        surface: "forecast-stale",
        path: "/forecast",
        note: "Pro Forecast stale-state before regeneration.",
        prepare: async () => {
          await gotoStable(page, "/forecast");
          await waitForPageHeading(page, "/forecast", "Forecast");
          await expect(staleForecastHeading).toBeVisible();
        },
      });
    }
  }
  if (shouldCapture("forecast-pro")) {
    markStep(testInfo, "generating", "Regenerating Pro Forecast.", {
      tier: "pro",
      surface: "forecast",
    });
    if (FREEZE_CAPTURE) {
      await expectFrozenForecastProState(page);
    } else {
      await ensureForecastArtifact(page);
    }
    await captureScenario(page, testInfo, {
      slug: "forecast-pro",
      tier: "pro",
      surface: "forecast",
      path: "/forecast",
      note: "Pro Forecast full state after regeneration.",
      prepare: async () => {
        await gotoStable(page, "/forecast");
        await waitForPageHeading(page, "/forecast", "Forecast");
        await expect(page.getByText("Planning lens", { exact: true })).toBeVisible();
      },
    });
  }

  if (shouldCapture("blueprint-pro-stale")) {
    markStep(testInfo, "generating", "Capturing stale Pro Blueprint.", {
      tier: "pro",
      surface: "blueprint",
    });
    await captureScenario(page, testInfo, {
      slug: "blueprint-pro-stale",
      tier: "pro",
      surface: "blueprint-stale",
      path: "/blueprint",
      note: "Pro Blueprint stale-state before regeneration.",
      prepare: async () => {
        await gotoStable(page, "/blueprint");
        await waitForPageHeading(page, "/blueprint", "Your Birth Blueprint");
        await expect(
          page.getByRole("heading", { name: "Refresh for your current tier", exact: true }),
        ).toBeVisible();
      },
    });
  }
  if (shouldCapture("blueprint-pro")) {
    markStep(testInfo, "generating", "Regenerating Pro Blueprint.", {
      tier: "pro",
      surface: "blueprint",
    });
    if (FREEZE_CAPTURE) {
      await expectFrozenBlueprintProState(page);
    } else {
      await ensureBlueprintArtifact(page);
    }
    await captureScenario(page, testInfo, {
      slug: "blueprint-pro",
      tier: "pro",
      surface: "blueprint",
      path: "/blueprint",
      note: "Pro Blueprint full state after regeneration.",
      prepare: async () => {
        await gotoStable(page, "/blueprint");
        await waitForPageHeading(page, "/blueprint", "Your Birth Blueprint");
        const hasBaziSignatureHeading =
          (await page.getByRole("heading", { name: "BaZi signature", exact: true }).count()) > 0;
        const hasBaziFallbackHeading =
          (await page
            .getByRole("heading", { name: "BaZi / Four Pillars", exact: true })
            .count()) > 0;

        expect(
          hasBaziSignatureHeading || hasBaziFallbackHeading,
          "Expected either the BaZi signature card or the BaZi / Four Pillars fallback card.",
        ).toBeTruthy();
      },
    });
  }

  if (shouldCapture("today-pro-stale")) {
    markStep(testInfo, "generating", "Capturing stale Pro Today.", {
      tier: "pro",
      surface: "today",
    });
    await captureScenario(page, testInfo, {
      slug: "today-pro-stale",
      tier: "pro",
      surface: "today-stale",
      path: "/dashboard",
      note: "Pro Today stale-state before regeneration.",
      prepare: async () => {
        await gotoStable(page, "/dashboard");
        await waitForPageHeading(page, "/dashboard", "Today");
        await expect(
          page.getByRole("heading", { name: "Refresh for your current tier", exact: true }),
        ).toBeVisible();
      },
    });
  }
  if (shouldCapture("today-pro")) {
    markStep(testInfo, "generating", "Refreshing Pro Today.", {
      tier: "pro",
      surface: "today",
    });
    if (FREEZE_CAPTURE) {
      await expectFrozenTodayProState(page);
    } else {
      await ensureTodayArtifact(page);
    }
    await captureScenario(page, testInfo, {
      slug: "today-pro",
      tier: "pro",
      surface: "today",
      path: "/dashboard",
      note: "Pro Today state after refresh.",
      prepare: async () => {
        await gotoStable(page, "/dashboard");
        await waitForPageHeading(page, "/dashboard", "Today");
        await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
      },
    });
  }

  if (shouldCapture("ask-pro-stale")) {
    markStep(testInfo, "generating", "Capturing stale Pro Ask.", {
      tier: "pro",
      surface: "ask",
    });
    await gotoStable(page, "/decision");
    await waitForPageHeading(page, "/decision", "Ask");

    const staleAskHeading = page.getByRole("heading", {
      name: "Ask again for your current tier",
      exact: true,
    });

    if (FREEZE_CAPTURE && !(await isVisibleNow(staleAskHeading))) {
      markStep(testInfo, "skipped", "Skipping frozen Ask stale capture because no stale state is present.", {
        tier: "pro",
        surface: "ask-stale",
      });
    } else {
      await captureScenario(page, testInfo, {
        slug: "ask-pro-stale",
        tier: "pro",
        surface: "ask-stale",
        path: "/decision",
        note: "Pro Ask stale-state before re-submission.",
        prepare: async () => {
          await gotoStable(page, "/decision");
          await waitForPageHeading(page, "/decision", "Ask");
          await expect(staleAskHeading).toBeVisible();
        },
      });
    }
  }
  if (shouldCapture("ask-pro")) {
    markStep(testInfo, "generating", "Submitting Pro Ask capture question.", {
      tier: "pro",
      surface: "ask",
    });
    try {
      if (FREEZE_CAPTURE) {
        await expectFrozenAskProState(page);
      } else {
        await ensureAskArtifact(page, PRO_ASK_QUESTION);
      }
      await captureScenario(page, testInfo, {
        slug: "ask-pro",
        tier: "pro",
        surface: "ask",
        path: "/decision",
        note: "Pro Ask state after submitting a question.",
        prepare: async () => {
          await gotoStable(page, "/decision");
          await waitForPageHeading(page, "/decision", "Ask");
          await expect(page.getByRole("heading", { name: "Direct answer", exact: true })).toBeVisible();
        },
      });
    } catch (error) {
      if (!FREEZE_CAPTURE || !isNoFrozenAskArtifactError(error)) {
        throw error;
      }

      markStep(testInfo, "skipped", "Skipping frozen Ask Pro capture because no reusable Ask result is visible.", {
        tier: "pro",
        surface: "ask",
      });
    }
  }

  await setDebugAccessLevel(page, "auto", "/dashboard");
  markStep(testInfo, "completed", "Capture run completed.", {
    tier: "auto",
  });
});
