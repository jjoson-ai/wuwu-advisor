#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOBILE_DIR = resolve(__dirname, "..");
const REPO_DIR = resolve(MOBILE_DIR, "../..");
const APP_ID = "com.astrologerondemand.app";
const DEFAULT_MAESTRO_BIN = existsSync(
  join(process.env.HOME ?? "", ".maestro", "bin", "maestro"),
)
  ? join(process.env.HOME ?? "", ".maestro", "bin", "maestro")
  : "maestro";
const MAESTRO_BIN = process.env.WUWU_MAESTRO_BIN ?? DEFAULT_MAESTRO_BIN;
const MAESTRO_DEVICE = process.env.WUWU_MAESTRO_DEVICE ?? "";
const CAPTURE_HIERARCHY = process.env.WUWU_CAPTURE_HIERARCHY === "1";
const FREEZE_MODE = process.env.WUWU_AUDIT_FREEZE === "1";
const FREE_ASK_QUESTION =
  process.env.WUWU_FREE_ASK_QUESTION ??
  "What should I focus on over the next 30 days?";
const PRO_ASK_QUESTION =
  process.env.WUWU_PRO_ASK_QUESTION ??
  "What should I commit to next, and what should I delay?";

function formatRunId(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

const RUN_ID = process.env.WUWU_AUDIT_RUN_ID ?? formatRunId();
const PLATFORM_DIR = join(
  REPO_DIR,
  "audit-artifacts",
  "native-ux-capture",
  RUN_ID,
  "ios",
);
const STATUS_PATH = join(PLATFORM_DIR, "_status.json");
const FLOW_DIR = join(MOBILE_DIR, "maestro", "ux-audit");
const MOBILE_ENV_PATH = join(MOBILE_DIR, ".env");
const MOBILE_ENV = existsSync(MOBILE_ENV_PATH)
  ? Object.fromEntries(
      readFileSync(MOBILE_ENV_PATH, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "" && line.startsWith("#") === false && line.includes("="))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=")];
        }),
    )
  : {};
const RUNNER_API_BASE_URL =
  (MOBILE_ENV.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000")
    .replace("10.0.2.2", "localhost")
    .replace("127.0.0.1", "localhost");

const ONBOARDING_SEED = {
  displayName: "Smoke Test User",
  fullBirthNameForNumerology: "Smoke Test User",
  baziCalculationMarker: "",
  birthDate: "1986-02-19",
  birthTime: "04:00",
  birthTimeConfidence: "exact",
  birthCity: "Madrid",
  birthCountry: "Spain",
  timezone: "Europe/Madrid",
  tonePreference: "grounded",
};

const SCENARIOS = [
  {
    slug: "today-free",
    tier: "free",
    surface: "Today",
    flow: "today-free.yaml",
    summary: [
      "Page heading: Today",
      "Generated free Today briefing.",
      "Visible anchors: Summary, Best timing.",
    ],
  },
  {
    slug: "forecast-free",
    tier: "free",
    surface: "Forecast",
    flow: "forecast-free.yaml",
    summary: [
      "Page heading: Forecast",
      "Generated free Forecast.",
      "Visible anchors: What’s unfolding this month.",
    ],
  },
  {
    slug: "forecast-free-paywall",
    tier: "free",
    surface: "Forecast paywall",
    flow: "forecast-free-paywall.yaml",
    summary: [
      "Free Forecast consolidated paywall state.",
      "Visible anchors: Unlock your full Forecast, Upgrade to Pro.",
    ],
  },
  {
    slug: "blueprint-free",
    tier: "free",
    surface: "Blueprint",
    flow: "blueprint-free.yaml",
    summary: [
      "Page heading: Your Birth Blueprint",
      "Generated free Blueprint.",
      "Visible anchors: Overview, Chinese signature.",
    ],
  },
  {
    slug: "blueprint-free-paywall",
    tier: "free",
    surface: "Blueprint paywall",
    flow: "blueprint-free-paywall.yaml",
    summary: [
      "Free Blueprint consolidated paywall state.",
      "Visible anchors: Unlock your full Blueprint, Upgrade to Pro.",
    ],
  },
  {
    slug: "ask-free",
    tier: "free",
    surface: "Ask",
    flow: "ask-free.yaml",
    summary: [
      "Page heading: Ask",
      "Submitted a free Ask question.",
      "Visible anchors: Direct answer, What matters most.",
    ],
  },
  {
    slug: "settings-account",
    tier: "free",
    surface: "Settings",
    flow: "settings-account.yaml",
    summary: [
      "Settings top section.",
      "Visible anchors: Settings, Save settings, Sign out.",
    ],
  },
  {
    slug: "settings-privacy",
    tier: "free",
    surface: "Settings privacy",
    flow: "settings-privacy.yaml",
    summary: [
      "Settings privacy and data section.",
      "Visible anchors: Privacy & data, Download my data, Delete my data.",
    ],
  },
  {
    slug: "today-pro-stale",
    tier: "pro",
    surface: "Today stale after upgrade",
    flow: "today-pro-stale.yaml",
    summary: [
      "Free Today artifact viewed after switching to Pro.",
      "Visible anchors: Refresh for your current tier.",
    ],
  },
  {
    slug: "today-pro",
    tier: "pro",
    surface: "Today",
    flow: "today-pro.yaml",
    summary: [
      "Regenerated Today under Pro tier.",
      "Visible anchors: Summary, Best timing.",
    ],
  },
  {
    slug: "forecast-pro-stale",
    tier: "pro",
    surface: "Forecast stale after upgrade",
    flow: "forecast-pro-stale.yaml",
    summary: [
      "Free Forecast artifact viewed after switching to Pro.",
      "Visible anchors: Refresh for your current tier.",
    ],
  },
  {
    slug: "forecast-pro",
    tier: "pro",
    surface: "Forecast",
    flow: "forecast-pro.yaml",
    summary: [
      "Regenerated Forecast under Pro tier.",
      "Visible anchors: What’s unfolding this month, Best use of this period.",
    ],
  },
  {
    slug: "blueprint-pro-stale",
    tier: "pro",
    surface: "Blueprint stale after upgrade",
    flow: "blueprint-pro-stale.yaml",
    summary: [
      "Free Blueprint artifact viewed after switching to Pro.",
      "Visible anchors: Refresh for your current tier.",
    ],
  },
  {
    slug: "blueprint-pro",
    tier: "pro",
    surface: "Blueprint",
    flow: "blueprint-pro.yaml",
    summary: [
      "Regenerated Blueprint under Pro tier.",
      "Visible anchors: Day Master, How you handle pressure.",
    ],
  },
  {
    slug: "ask-pro-stale",
    tier: "pro",
    surface: "Ask stale after upgrade",
    flow: "ask-pro-stale.yaml",
    summary: [
      "Free Ask artifact viewed after switching to Pro.",
      "Visible anchors: Ask again for your current tier.",
    ],
  },
  {
    slug: "ask-pro",
    tier: "pro",
    surface: "Ask",
    flow: "ask-pro.yaml",
    summary: [
      "Submitted a Pro Ask question.",
      "Visible anchors: Direct answer, What matters most.",
    ],
  },
];

function usage() {
  console.log(`Usage:
  npm run audit:ux:native:ios
  npm run audit:ux:native:list

Optional environment:
  WUWU_AUDIT_RUN_ID=<run-id>
  WUWU_NATIVE_SCENARIOS=<comma-separated slugs>
  WUWU_AUDIT_FREEZE=1
  WUWU_MAESTRO_DEVICE=<device name or id>
  WUWU_CAPTURE_HIERARCHY=1
`);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  writeFileSync(filePath, `${value}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithSimulatorAuth(path, options = {}) {
  const accessToken = getSimulatorAccessToken();

  if (accessToken == null) {
    throw new Error(
      `No simulator session found. Unable to prepare scenario data for ${path}.`,
    );
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("x-wuwu-platform", "mobile");

  if (options.accessLevelOverride) {
    headers.set("x-wuwu-debug-access-level", options.accessLevelOverride);
  }

  if (options.body != null && headers.has("Content-Type") === false) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${RUNNER_API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Scenario data preparation failed for ${path}: ${payload?.error ?? response.statusText}`,
    );
  }

  return payload;
}

async function requestWithSimulatorAuthRetry(path, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestWithSimulatorAuth(path, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRetriable =
        message.includes("Overloaded") ||
        message.includes("timed out") ||
        message.includes("fetch failed");

      if (isRetriable === false || attempt === maxAttempts) {
        throw error;
      }

      await sleep(1500 * attempt);
    }
  }

  throw lastError;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with code ${result.status ?? "unknown"}${
        output ? `\n${output}` : ""
      }`,
    );
  }

  return result;
}

function isCommandAvailable(command) {
  const result = spawnSync("bash", ["-lc", `command -v "${command}"`], {
    encoding: "utf8",
  });

  return result.status === 0;
}

function getBootedSimulatorName() {
  const result = runCommand("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  const payload = JSON.parse(result.stdout);
  const devices = Object.values(payload.devices ?? {})
    .flat()
    .filter((device) => device.state === "Booted");

  if (devices.length === 0) {
    throw new Error(
      "No booted iOS simulator found. Boot the simulator before running the native UX audit.",
    );
  }

  return devices[0].name;
}

function verifyInstalledApp() {
  runCommand("xcrun", ["simctl", "get_app_container", "booted", APP_ID], {
    stdio: "pipe",
  });
}

function relaunchInstalledApp() {
  spawnSync("xcrun", ["simctl", "terminate", "booted", APP_ID], {
    encoding: "utf8",
    stdio: "pipe",
  });
  runCommand("xcrun", ["simctl", "launch", "booted", APP_ID], {
    stdio: "pipe",
  });
}

function getBootedAppDataContainer() {
  const result = runCommand("xcrun", ["simctl", "get_app_container", "booted", APP_ID, "data"]);
  return result.stdout.trim();
}

function getAsyncStorageDir() {
  return join(
    getBootedAppDataContainer(),
    "Library",
    "Application Support",
    APP_ID,
    "RCTAsyncLocalStorage_V1",
  );
}

function getSimulatorAccessToken() {
  const storageDir = getAsyncStorageDir();
  const manifestPath = join(storageDir, "manifest.json");

  if (existsSync(manifestPath) === false) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const authStorageKey = Object.keys(manifest).find((key) =>
    /^sb-[a-z0-9]+-auth-token$/i.test(key),
  );

  if (authStorageKey == null) {
    return null;
  }

  const hashedFileName = createHash("md5").update(authStorageKey).digest("hex");
  const tokenFilePath = join(storageDir, hashedFileName);

  if (existsSync(tokenFilePath) === false) {
    return null;
  }

  const session = JSON.parse(readFileSync(tokenFilePath, "utf8"));
  return typeof session?.access_token === "string" && session.access_token !== ""
    ? session.access_token
    : null;
}

async function ensureOnboardingSeeded() {
  const accessToken = getSimulatorAccessToken();

  if (accessToken == null) {
    console.log("[native-ux-audit] No simulator session found. Skipping onboarding seed.");
    return false;
  }

  const response = await fetch(`${RUNNER_API_BASE_URL}/api/mobile/settings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-wuwu-platform": "mobile",
    },
    body: JSON.stringify(ONBOARDING_SEED),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `Unable to seed mobile onboarding via ${RUNNER_API_BASE_URL}/api/mobile/settings: ${
        payload?.error ?? "unknown error"
      }`,
    );
  }

  console.log("[native-ux-audit] Seeded onboarding through mobile settings API.");
  return payload?.onboardingComplete === true;
}

function getScenarioSelection() {
  const fromArg = process.argv
    .slice(2)
    .find((value) => value.startsWith("--scenario="))
    ?.split("=")[1];
  const fromEnv = process.env.WUWU_NATIVE_SCENARIOS;
  const raw = fromArg ?? fromEnv;

  if (raw == null || raw.trim() === "") {
    return SCENARIOS;
  }

  const wanted = new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const selected = SCENARIOS.filter((scenario) => wanted.has(scenario.slug));
  const missing = [...wanted].filter(
    (slug) => selected.some((scenario) => scenario.slug === slug) === false,
  );

  if (missing.length > 0) {
    throw new Error(`Unknown native audit scenario(s): ${missing.join(", ")}`);
  }

  return selected;
}

function writeStatus(partial) {
  mkdirSync(PLATFORM_DIR, { recursive: true });
  writeJson(STATUS_PATH, {
    runId: RUN_ID,
    platform: "ios",
    appId: APP_ID,
    updatedAt: new Date().toISOString(),
    ...partial,
  });
}

function createScenarioSkipError(message) {
  const error = new Error(message);
  error.name = "ScenarioSkipError";
  return error;
}

function isScenarioSkipError(error) {
  if (error instanceof Error === false) {
    return false;
  }

  return (
    error.name === "ScenarioSkipError" ||
    error.message.includes("Your credit balance is too low") ||
    error.message.includes("Anthropic API")
  );
}

function captureScreenshot(outputPath) {
  runCommand("xcrun", ["simctl", "io", "booted", "screenshot", outputPath], {
    stdio: "pipe",
  });
}

function maybeCaptureHierarchy(outputPath) {
  if (CAPTURE_HIERARCHY === false) {
    return false;
  }

  const args = ["hierarchy"];

  if (MAESTRO_DEVICE !== "") {
    args.push("--device", MAESTRO_DEVICE);
  }

  const result = spawnSync(MAESTRO_BIN, args, {
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return false;
  }

  writeText(outputPath, result.stdout.trimEnd());
  return true;
}

async function prewarmScenarioData(scenario) {
  const isTodayScenario = scenario.slug.startsWith("today");
  const isForecastScenario = scenario.slug.startsWith("forecast");
  const isBlueprintScenario = scenario.slug.startsWith("blueprint");
  const isAskScenario = scenario.slug.startsWith("ask");
  const isSettingsScenario = scenario.slug.startsWith("settings");

  if (isSettingsScenario) {
    return;
  }

  const accessLevelOverride =
    scenario.slug.includes("-pro") && scenario.slug.includes("-stale") === false
      ? "pro"
      : "free";

  if (FREEZE_MODE) {
    await ensureReusableScenarioData(scenario, accessLevelOverride);
    return;
  }

  if (isTodayScenario) {
    await requestWithSimulatorAuthRetry("/api/generate-briefing", {
      method: "POST",
      accessLevelOverride,
    });
    return;
  }

  if (isForecastScenario) {
    await requestWithSimulatorAuthRetry("/api/generate-forecast", {
      method: "POST",
      accessLevelOverride,
    });
    return;
  }

  if (isBlueprintScenario) {
    await requestWithSimulatorAuthRetry("/api/generate-blueprint", {
      method: "POST",
      accessLevelOverride,
    });
    return;
  }

  if (isAskScenario) {
    const question =
      scenario.slug.startsWith("ask-pro") && scenario.slug.includes("-stale") === false
        ? PRO_ASK_QUESTION
        : FREE_ASK_QUESTION;

    await requestWithSimulatorAuthRetry("/api/generate-decision-guidance", {
      method: "POST",
      accessLevelOverride,
      body: JSON.stringify({ question }),
    });
  }
}

async function ensureReusableScenarioData(scenario, accessLevelOverride) {
  const isTodayScenario = scenario.slug.startsWith("today");
  const isForecastScenario = scenario.slug.startsWith("forecast");
  const isBlueprintScenario = scenario.slug.startsWith("blueprint");
  const isAskScenario = scenario.slug.startsWith("ask");
  const wantsStaleArtifact = scenario.slug.includes("-stale");

  let artifact = null;
  let surfaceName = scenario.surface;

  if (isTodayScenario) {
    const payload = await requestWithSimulatorAuthRetry("/api/mobile/today", {
      accessLevelOverride,
    });
    artifact = payload?.briefing ?? null;
    surfaceName = "Today";
  } else if (isForecastScenario) {
    const payload = await requestWithSimulatorAuthRetry("/api/mobile/forecast", {
      accessLevelOverride,
    });
    artifact = payload?.forecast ?? null;
    surfaceName = "Forecast";
  } else if (isBlueprintScenario) {
    const payload = await requestWithSimulatorAuthRetry("/api/mobile/blueprint", {
      accessLevelOverride,
    });
    artifact = payload?.blueprint ?? null;
    surfaceName = "Blueprint";
  } else if (isAskScenario) {
    const payload = await requestWithSimulatorAuthRetry("/api/mobile/ask", {
      accessLevelOverride,
    });
    artifact = payload?.latest ?? null;
    surfaceName = "Ask";
  }

  if (artifact == null) {
    throw createScenarioSkipError(
      `Freeze mode: no reusable ${surfaceName} artifact exists for ${scenario.slug}.`,
    );
  }

  const artifactAccessLevel = artifact.generation_access_level ?? "free";

  if (wantsStaleArtifact) {
    if (accessLevelOverride === "pro" && artifactAccessLevel === "free") {
      return;
    }

    throw createScenarioSkipError(
      `Freeze mode: ${surfaceName} does not have a reusable stale artifact for ${scenario.slug}.`,
    );
  }

  if (accessLevelOverride === "free") {
    if (artifactAccessLevel === "free") {
      return;
    }

    throw createScenarioSkipError(
      `Freeze mode: latest ${surfaceName} artifact is ${artifactAccessLevel}, not free, for ${scenario.slug}.`,
    );
  }

  if (artifactAccessLevel === "pro" || artifactAccessLevel === "internal") {
    return;
  }

  throw createScenarioSkipError(
    `Freeze mode: latest ${surfaceName} artifact is ${artifactAccessLevel}, not reusable for ${scenario.slug}.`,
  );
}

function runScenario(scenario, bootedSimulatorName) {
  const scenarioDir = join(PLATFORM_DIR, scenario.slug);
  const flowPath = join(FLOW_DIR, scenario.flow);
  const screenshotPath = join(scenarioDir, "screenshot.png");
  const summaryPath = join(scenarioDir, "summary.txt");
  const metaPath = join(scenarioDir, "meta.json");
  const hierarchyPath = join(scenarioDir, "hierarchy.txt");

  mkdirSync(scenarioDir, { recursive: true });

  const maestroArgs = ["test", flowPath];

  if (MAESTRO_DEVICE !== "") {
    maestroArgs.push("--device", MAESTRO_DEVICE);
  }

  const askQuestion =
    scenario.slug.startsWith("ask-pro") ? PRO_ASK_QUESTION : FREE_ASK_QUESTION;

  console.log(`[native-ux-audit] ${scenario.slug}`);
  runCommand(MAESTRO_BIN, maestroArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      WUWU_ASK_QUESTION: askQuestion,
    },
  });

  captureScreenshot(screenshotPath);
  const hierarchyCaptured = maybeCaptureHierarchy(hierarchyPath);

  const summary = [
    `Scenario: ${scenario.slug}`,
    `Surface: ${scenario.surface}`,
    `Tier: ${scenario.tier}`,
    `Simulator: ${bootedSimulatorName}`,
    "",
    ...scenario.summary.map((line) => `- ${line}`),
  ].join("\n");

  writeText(summaryPath, summary);
  writeJson(metaPath, {
    runId: RUN_ID,
    platform: "ios",
    scenario: scenario.slug,
    surface: scenario.surface,
    tier: scenario.tier,
    capturedAt: new Date().toISOString(),
    appId: APP_ID,
    simulator: bootedSimulatorName,
    flowFile: relative(REPO_DIR, flowPath),
    artifacts: {
      screenshot: "screenshot.png",
      summary: "summary.txt",
      hierarchy: hierarchyCaptured ? "hierarchy.txt" : null,
    },
    summary: scenario.summary,
  });
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

if (process.argv.includes("--list")) {
  for (const scenario of SCENARIOS) {
    console.log(`${scenario.slug} [${scenario.tier}] - ${scenario.surface}`);
  }
  process.exit(0);
}

if (isCommandAvailable(MAESTRO_BIN) === false) {
  throw new Error(
    `Maestro CLI was not found on PATH as "${MAESTRO_BIN}". Install Maestro or set WUWU_MAESTRO_BIN.`,
  );
}

if (isCommandAvailable("xcrun") === false) {
  throw new Error("xcrun was not found on PATH. Xcode command-line tools are required.");
}

const selectedScenarios = getScenarioSelection();
const bootedSimulatorName = getBootedSimulatorName();
verifyInstalledApp();
const onboardingSeeded = await ensureOnboardingSeeded();

if (onboardingSeeded) {
  relaunchInstalledApp();
}

writeStatus({
  phase: "running",
  currentScenario: null,
  completedScenarios: [],
  scenarioCount: selectedScenarios.length,
});

const completedScenarios = [];
const skippedScenarios = [];

try {
  for (const scenario of selectedScenarios) {
    writeStatus({
      phase: "running",
      currentScenario: scenario.slug,
      completedScenarios,
      skippedScenarios,
      scenarioCount: selectedScenarios.length,
    });
    try {
      await prewarmScenarioData(scenario);
      runScenario(scenario, bootedSimulatorName);
      completedScenarios.push(scenario.slug);
    } catch (error) {
      if (isScenarioSkipError(error)) {
        console.log(
          `[native-ux-audit] skipping ${scenario.slug}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        skippedScenarios.push({
          slug: scenario.slug,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      throw error;
    }
  }

  writeStatus({
    phase: "completed",
    currentScenario: null,
    completedScenarios,
    skippedScenarios,
    scenarioCount: selectedScenarios.length,
  });
} catch (error) {
  writeStatus({
    phase: "failed",
    currentScenario:
      completedScenarios.length < selectedScenarios.length
        ? selectedScenarios[completedScenarios.length]?.slug ?? null
        : null,
    completedScenarios,
    skippedScenarios,
    scenarioCount: selectedScenarios.length,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
