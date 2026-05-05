/**
 * Convert plaintext Vercel env vars to "Sensitive" type in one batch.
 *
 * Why: Vercel's "Needs Attention" badge flags env vars whose names match
 * common secret patterns (API_KEY, SECRET, SERVICE_ROLE_KEY, etc.) but
 * which are stored as plaintext. Sensitive vars are encrypted at rest,
 * hidden from the dashboard, and never appear in build logs.
 *
 * Usage:
 *   1. Create a Vercel personal access token:
 *      https://vercel.com/account/tokens (Scope: Full Account, expires soon)
 *   2. Find your project ID:
 *      vercel.com → project → Settings → General → "Project ID"
 *   3. Run:
 *      VERCEL_TOKEN=xxxx VERCEL_PROJECT_ID=prj_xxxx \
 *        npx tsx scripts/vercel-sensitize-secrets.ts
 *
 *   Optional env vars:
 *     VERCEL_TEAM_ID=team_xxxx  (only if project is in a Team, not personal)
 *     DRY_RUN=true              (preview without making changes)
 *
 * What it does:
 *   - Lists all env vars on the project
 *   - For each var whose KEY matches the secret-name pattern AND is currently
 *     stored as plain/encrypted (not "sensitive"), PATCHes type → "sensitive"
 *     and removes "development" from the target list (Vercel disallows
 *     sensitive vars on the development target — `vercel env pull` needs
 *     to read them, sensitive vars are write-only).
 *   - Skips NEXT_PUBLIC_* (those are intentionally client-exposed)
 *   - Skips already-sensitive vars (idempotent re-runs)
 *
 * Side effect — local dev:
 *   After this runs, sensitive vars no longer flow through `vercel env pull`.
 *   Make sure your `.env.local` has the values you need for local dev.
 *   Best practice: local dev uses test/sandbox keys, not production secrets,
 *   so this separation is actually a security improvement.
 *
 * After running: refresh the Vercel dashboard. The "Needs Attention" badges
 * should be gone. Your next deploy will pick up the (unchanged) values.
 */

const VERCEL_API = "https://api.vercel.com";

/** Names matching any of these patterns are treated as secrets. */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /_API_KEY$/i,
  /_SECRET$/i,
  /_SECRET_KEY$/i,
  /_TOKEN$/i,
  /SERVICE_ROLE/i,
  /^OPS_SECRET$/i,
  /^STRIPE_SECRET_KEY$/i,
  /^STRIPE_WEBHOOK_SECRET$/i,
];

/** Names that are intentionally public — never sensitize. */
const PUBLIC_PREFIXES: ReadonlyArray<string> = ["NEXT_PUBLIC_"];

type VercelEnvVar = {
  id: string;
  key: string;
  type: "system" | "secret" | "encrypted" | "plain" | "sensitive";
  target: string[];
};

type VercelEnvListResponse = {
  envs: VercelEnvVar[];
};

function isSecretName(key: string): boolean {
  if (PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return false;
  }
  return SECRET_PATTERNS.some((pattern) => pattern.test(key));
}

function buildUrl(path: string, teamId: string | undefined): string {
  const base = `${VERCEL_API}${path}`;
  return teamId ? `${base}${path.includes("?") ? "&" : "?"}teamId=${teamId}` : base;
}

async function vercelFetch<T>(
  path: string,
  init: RequestInit,
  token: string,
  teamId: string | undefined,
): Promise<T> {
  const url = buildUrl(path, teamId);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Vercel API ${init.method ?? "GET"} ${path} → ${response.status}: ${text}`,
    );
  }

  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const dryRun = process.env.DRY_RUN === "true";

  if (!token) {
    console.error("Missing VERCEL_TOKEN. Create one at https://vercel.com/account/tokens");
    process.exit(1);
  }
  if (!projectId) {
    console.error(
      "Missing VERCEL_PROJECT_ID. Find at vercel.com → project → Settings → General",
    );
    process.exit(1);
  }

  console.log(`[vercel-sensitize] Project: ${projectId}${teamId ? ` (team ${teamId})` : ""}`);
  console.log(`[vercel-sensitize] Dry run: ${dryRun}`);

  const list = await vercelFetch<VercelEnvListResponse>(
    `/v9/projects/${projectId}/env?decrypt=false`,
    { method: "GET" },
    token,
    teamId,
  );

  const candidates = list.envs.filter(
    (env) => isSecretName(env.key) && env.type !== "sensitive" && env.type !== "system",
  );

  console.log(`[vercel-sensitize] Found ${list.envs.length} total env vars`);
  console.log(`[vercel-sensitize] Candidates to sensitize: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("[vercel-sensitize] Nothing to do — all secrets are already sensitive.");
    return;
  }

  for (const env of candidates) {
    console.log(
      `  - ${env.key} (id=${env.id}, current type=${env.type}, targets=${env.target.join(",")})`,
    );
  }

  if (dryRun) {
    console.log("[vercel-sensitize] Dry run complete — no changes made.");
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const env of candidates) {
    try {
      // Vercel does NOT allow Sensitive vars to target `development` —
      // sensitive vars are write-only and `vercel env pull` (which powers
      // local dev) needs to read them. So we drop `development` from the
      // target and keep production + preview encrypted at rest. Local dev
      // should be using `.env.local` (git-ignored) anyway, ideally with
      // test/sandbox keys rather than production secrets.
      const sensitiveTargets = env.target.filter((t) => t !== "development");
      const targetChanged = sensitiveTargets.length !== env.target.length;

      await vercelFetch(
        `/v10/projects/${projectId}/env/${env.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            type: "sensitive",
            target: sensitiveTargets,
          }),
        },
        token,
        teamId,
      );
      const note = targetChanged
        ? " (dropped 'development' target — sensitive vars don't support it)"
        : "";
      console.log(`  ✓ ${env.key} → sensitive${note}`);
      succeeded += 1;
    } catch (error) {
      console.error(
        `  ✗ ${env.key} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      failed += 1;
    }
  }

  console.log(`[vercel-sensitize] Done: ${succeeded} converted, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[vercel-sensitize] Fatal:", error);
  process.exit(1);
});
