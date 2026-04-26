/**
 * verify-alpha-readiness.ts
 *
 * Pre-alpha launch checklist. Covers three layers:
 *   1. Env-var correctness (local .env / Vercel env values)
 *   2. Offline safety suites (spawns existing verify-*.ts scripts)
 *   3. Live HTTP checks against the prod URL
 *
 * Run with:
 *   npm run verify:alpha
 *
 * Optional: override prod URL
 *   WUWU_PROD_URL=https://staging.wuwu-advisor.vercel.app npm run verify:alpha
 *
 * Exits 0 only if every non-WARN check passes.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROD_URL =
  process.env.WUWU_PROD_URL?.replace(/\/$/, "") ??
  "https://wuwu-advisor.vercel.app";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "PASS" | "FAIL" | "WARN" | "SKIP";

type CheckResult = {
  section: string;
  label: string;
  status: Status;
  note?: string;
};

const results: CheckResult[] = [];

function record(
  section: string,
  label: string,
  status: Status,
  note?: string,
) {
  results.push({ section, label, status, note });
}

// ─── Section 1 — Env var checks ───────────────────────────────────────────────

function checkEnvVars() {
  const section = "Env vars";

  // Required keys — checked from local env. If missing here but the live HTTP
  // checks pass, the key is likely set in Vercel and only absent locally.
  const required: Array<{ key: string; label: string }> = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key" },
    { key: "ANTHROPIC_API_KEY", label: "Anthropic API key" },
    { key: "OPENAI_API_KEY", label: "OpenAI API key (memory)" },
    { key: "STRIPE_SECRET_KEY", label: "Stripe secret key" },
  ];

  for (const { key, label } of required) {
    const val = process.env[key];
    if (!val || val.trim() === "") {
      record(
        section,
        label,
        "WARN",
        `${key} not in local .env.local — verify it is set in Vercel dashboard`,
      );
    } else {
      record(section, label, "PASS");
    }
  }

  // Stripe must be test-mode for alpha
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (stripeKey.startsWith("sk_live_")) {
    record(
      section,
      "Stripe in test mode",
      "WARN",
      "STRIPE_SECRET_KEY is live-mode (sk_live_...). Alpha should use test mode.",
    );
  } else if (stripeKey.startsWith("sk_test_")) {
    record(section, "Stripe in test mode", "PASS");
  } else if (stripeKey !== "") {
    record(section, "Stripe in test mode", "WARN", "Unrecognised STRIPE_SECRET_KEY prefix");
  }

  // OPS_SECRET must be changed from the placeholder
  const opsSecret = process.env.OPS_SECRET ?? "";
  if (opsSecret === "" || opsSecret === "change-me-use-openssl-rand-hex-32") {
    record(
      section,
      "OPS_SECRET changed from default",
      "FAIL",
      "OPS_SECRET is unset or still the default placeholder. Run: openssl rand -hex 32",
    );
  } else {
    record(section, "OPS_SECRET changed from default", "PASS");
  }

  // Memory extraction flag — note current state, recommend on for alpha
  const extractionEnabled = process.env.MEMORY_EXTRACTION_ENABLED;
  if (extractionEnabled === "true") {
    record(section, "MEMORY_EXTRACTION_ENABLED", "PASS", "Set to true — corpus building active");
  } else {
    record(
      section,
      "MEMORY_EXTRACTION_ENABLED",
      "WARN",
      'Currently false/unset. Recommend setting to "true" before inviting friends so memory corpus builds silently.',
    );
  }

  // Calibration must stay off until there is real data volume
  const calibrationEnabled = process.env.ACCURACY_CALIBRATION_ENABLED;
  if (calibrationEnabled === "true") {
    record(
      section,
      "ACCURACY_CALIBRATION_ENABLED is off",
      "WARN",
      "Set to true — needs ≥10 ratings/user to be meaningful. Fine for alpha, just early.",
    );
  } else {
    record(
      section,
      "ACCURACY_CALIBRATION_ENABLED is off",
      "PASS",
      "Off (default) — correct for alpha",
    );
  }

  // Memory injection — note state
  const injectionEnabled = process.env.MEMORY_INJECTION_ENABLED;
  if (injectionEnabled === "true") {
    record(
      section,
      "MEMORY_INJECTION_ENABLED",
      "WARN",
      "On — make sure you have reviewed extraction quality for ≥5 days before injecting into prompts",
    );
  } else {
    record(
      section,
      "MEMORY_INJECTION_ENABLED",
      "PASS",
      "Off (default) — flip to true after ~5 days of extraction",
    );
  }
}

// ─── Section 2 — Offline safety verify scripts ───────────────────────────────

type VerifyScript = {
  label: string;
  script: string;
  requiresEnvKey?: string;
};

const VERIFY_SCRIPTS: VerifyScript[] = [
  { label: "Crisis detection (28 cases)", script: "verify-crisis-detection.ts" },
  { label: "Age gate (28 cases)", script: "verify-age-gate.ts" },
  { label: "Prompt rules (31 cases)", script: "verify-prompt-rules.ts" },
  { label: "Calibration (offline)", script: "verify-calibration.ts" },
  {
    label: "Output safety (9 regex + Haiku judge)",
    script: "verify-output-safety.ts",
    requiresEnvKey: "ANTHROPIC_API_KEY",
  },
  {
    label: "Memory pipeline (offline + integration)",
    script: "verify-memory.ts",
    requiresEnvKey: "OPENAI_API_KEY",
  },
];

function runVerifyScripts() {
  const section = "Safety suites";
  const scriptsDir = __dirname;

  for (const { label, script, requiresEnvKey } of VERIFY_SCRIPTS) {
    if (requiresEnvKey && !process.env[requiresEnvKey]) {
      record(
        section,
        label,
        "SKIP",
        `${requiresEnvKey} not set — skipping`,
      );
      continue;
    }

    const result = spawnSync(
      "npx",
      ["tsx", "--env-file-if-exists=.env.local", resolve(scriptsDir, script)],
      {
        encoding: "utf8",
        cwd: resolve(scriptsDir, ".."),
        timeout: 60_000,
      },
    );

    if (result.status === 0) {
      // Extract the summary line (last non-empty line)
      const lines = (result.stdout ?? "")
        .split("\n")
        .filter((l) => l.trim() !== "");
      const summary = lines.at(-1)?.trim();
      record(section, label, "PASS", summary);
    } else {
      const stderr = (result.stderr ?? "").trim().slice(0, 200);
      const stdout = (result.stdout ?? "").trim().slice(0, 200);
      record(
        section,
        label,
        "FAIL",
        stderr || stdout || `exit code ${result.status}`,
      );
    }
  }
}

// ─── Section 3 — Live HTTP checks ────────────────────────────────────────────

async function checkLiveEndpoints() {
  const section = `Live HTTP (${PROD_URL})`;

  // 3a. /api/debug/access must return 404 in production
  try {
    const res = await fetch(`${PROD_URL}/api/debug/access`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      record(section, "GET /api/debug/access → 404", "PASS");
    } else {
      record(
        section,
        "GET /api/debug/access → 404",
        "FAIL",
        `Got ${res.status} — debug endpoint is live in production`,
      );
    }
  } catch (err) {
    record(section, "GET /api/debug/access → 404", "FAIL", String(err));
  }

  // 3b. /ops must redirect to /ops/login (not render the dashboard unauthenticated)
  try {
    const res = await fetch(`${PROD_URL}/ops`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const location = res.headers.get("location") ?? "";
    const isRedirect = res.status === 302 || res.status === 307 || res.status === 308;
    // Accept redirect to either /ops/login (ops password gate) or /login
    // (Supabase auth fires first when no session cookie is present).
    const isGated =
      isRedirect &&
      (location.includes("/ops/login") || location.endsWith("/login"));

    if (isGated) {
      record(
        section,
        "GET /ops → gated (redirects to login)",
        "PASS",
        `${res.status} → ${location}`,
      );
    } else if (res.status === 200) {
      record(
        section,
        "GET /ops → gated (redirects to login)",
        "FAIL",
        "Returned 200 — /ops is accessible without authentication",
      );
    } else {
      record(
        section,
        "GET /ops → gated (redirects to login)",
        "WARN",
        `Got ${res.status} location=${location || "(none)"} — verify manually`,
      );
    }
  } catch (err) {
    record(section, "GET /ops → redirects to /ops/login", "FAIL", String(err));
  }

  // 3c. Landing page loads (basic reachability)
  try {
    const res = await fetch(`${PROD_URL}/`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      record(section, "GET / → 200 (app reachable)", "PASS");
    } else {
      record(
        section,
        "GET / → 200 (app reachable)",
        "FAIL",
        `Got ${res.status}`,
      );
    }
  } catch (err) {
    record(section, "GET / → 200 (app reachable)", "FAIL", String(err));
  }

  // 3d. Login page loads (Supabase auth wired)
  try {
    const res = await fetch(`${PROD_URL}/login`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      record(section, "GET /login → 200", "PASS");
    } else {
      record(section, "GET /login → 200", "FAIL", `Got ${res.status}`);
    }
  } catch (err) {
    record(section, "GET /login → 200", "FAIL", String(err));
  }

  // 3e. Pricing page loads (Stripe price IDs configured)
  try {
    const res = await fetch(`${PROD_URL}/pricing`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      record(section, "GET /pricing → 200", "PASS");
    } else {
      record(
        section,
        "GET /pricing → 200",
        "WARN",
        `Got ${res.status} — check STRIPE_PRO_PRICE_ID / STRIPE_PRO_ANNUAL_PRICE_ID`,
      );
    }
  } catch (err) {
    record(section, "GET /pricing → 200", "WARN", String(err));
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

function printReport() {
  const icon: Record<Status, string> = {
    PASS: "✅",
    FAIL: "❌",
    WARN: "⚠️ ",
    SKIP: "⏭️ ",
  };

  // Group by section
  const sections = [...new Set(results.map((r) => r.section))];

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Alpha readiness check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const section of sections) {
    console.log(`  ${section}`);
    for (const r of results.filter((x) => x.section === section)) {
      const line = `  ${icon[r.status]}  ${r.label}`;
      console.log(r.note ? `${line}\n       ${r.note}` : line);
    }
    console.log();
  }

  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  for (const r of results) counts[r.status]++;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `  ✅ ${counts.PASS} passed  ❌ ${counts.FAIL} failed  ⚠️  ${counts.WARN} warnings  ⏭️  ${counts.SKIP} skipped`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (counts.FAIL > 0) {
    console.log("❌ Not alpha-ready. Fix the failing checks above.\n");
  } else if (counts.WARN > 0) {
    console.log("⚠️  Alpha-ready with warnings. Review the notes above.\n");
  } else {
    console.log("✅ All checks passed. Ship it.\n");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nRunning alpha readiness checks against ${PROD_URL} …`);

  checkEnvVars();
  runVerifyScripts();
  await checkLiveEndpoints();

  printReport();

  const hasFail = results.some((r) => r.status === "FAIL");
  process.exit(hasFail ? 1 : 0);
}

main().catch((err) => {
  console.error("verify-alpha-readiness: unexpected error", err);
  process.exit(1);
});
