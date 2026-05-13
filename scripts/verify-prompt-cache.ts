/**
 * Prompt-cache verification — reads cost_events, groups by feature+model,
 * reports cache_creation / cache_read token stats and realized savings.
 *
 * Run via: npm run verify:cache [-- --hours=24] [-- --feature=blueprint]
 *
 * Pre-flight: confirms sql/015_cache_tokens.sql is applied (queries the new
 * columns). If the columns don't exist, prints the migration SQL and exits 1.
 *
 * Exits 0 on success, 1 on migration-missing or DB errors.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import pricing from "@/bakeoff/config/model-pricing.json";

type Row = {
  feature: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cost_usd: number | string | null;
  created_at: string;
};

type Aggregate = {
  feature: string;
  model: string;
  calls: number;
  input: number;
  output: number;
  cache_create: number;
  cache_read: number;
  cost_usd: number;
  earliest: string;
  latest: string;
};

const MODEL_PRICING = (
  pricing as { models?: Record<string, { input_per_1m_usd?: number }> }
).models ?? {};

function parseArgs(): { hours: number; feature: string | null } {
  let hours = 24;
  let feature: string | null = null;

  for (const arg of process.argv.slice(2)) {
    const hoursMatch = arg.match(/^--hours=(\d+)$/);
    if (hoursMatch != null) {
      hours = Number(hoursMatch[1]);
      continue;
    }

    const featureMatch = arg.match(/^--feature=(.+)$/);
    if (featureMatch != null) {
      feature = featureMatch[1];
      continue;
    }
  }

  return { hours, feature };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function loadMigrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const sqlPath = resolve(here, "..", "sql", "015_cache_tokens.sql");
  return readFileSync(sqlPath, "utf8");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, any, any, any, any>;

async function preflightSchemaCheck(
  supabase: SupabaseAdmin,
): Promise<{ ok: boolean; errorMessage?: string }> {
  // Try selecting the new columns from cost_events. If the migration hasn't
  // run, Supabase returns an error like "column ... does not exist".
  const { error } = await supabase
    .from("cost_events")
    .select("cache_creation_input_tokens, cache_read_input_tokens")
    .limit(1);

  if (error == null) {
    return { ok: true };
  }

  const msg = error.message ?? "";
  if (
    msg.includes("cache_creation_input_tokens") ||
    msg.includes("cache_read_input_tokens") ||
    msg.includes("does not exist")
  ) {
    return {
      ok: false,
      errorMessage: msg,
    };
  }

  // Some other DB error — propagate.
  return { ok: false, errorMessage: msg };
}

function aggregate(rows: Row[]): Aggregate[] {
  const buckets = new Map<string, Aggregate>();

  for (const row of rows) {
    const key = `${row.feature}::${row.model}`;
    const existing = buckets.get(key);
    const costNum = row.cost_usd == null ? 0 : Number(row.cost_usd);

    if (existing == null) {
      buckets.set(key, {
        feature: row.feature,
        model: row.model,
        calls: 1,
        input: row.input_tokens ?? 0,
        output: row.output_tokens ?? 0,
        cache_create: row.cache_creation_input_tokens ?? 0,
        cache_read: row.cache_read_input_tokens ?? 0,
        cost_usd: costNum,
        earliest: row.created_at,
        latest: row.created_at,
      });
      continue;
    }

    existing.calls += 1;
    existing.input += row.input_tokens ?? 0;
    existing.output += row.output_tokens ?? 0;
    existing.cache_create += row.cache_creation_input_tokens ?? 0;
    existing.cache_read += row.cache_read_input_tokens ?? 0;
    existing.cost_usd += costNum;
    if (row.created_at < existing.earliest) existing.earliest = row.created_at;
    if (row.created_at > existing.latest) existing.latest = row.created_at;
  }

  return Array.from(buckets.values()).sort((a, b) => b.cost_usd - a.cost_usd);
}

function printReport(aggs: Aggregate[], hours: number): void {
  if (aggs.length === 0) {
    console.log(
      `\nNo cost_events rows found in the last ${hours}h. ` +
        `Trigger a generation request (Blueprint, Ask, etc.) and re-run.\n`,
    );
    return;
  }

  let cachingFeatures = 0;
  let totalSavedUsd = 0;

  console.log(`\nProd cache stats — last ${hours}h\n`);
  console.log("=".repeat(96));

  for (const a of aggs) {
    const totalInputLikeTokens = a.input + a.cache_create + a.cache_read;
    const cacheHitRatio =
      totalInputLikeTokens > 0 ? a.cache_read / totalInputLikeTokens : 0;
    const inputRate = MODEL_PRICING[a.model]?.input_per_1m_usd ?? 0;
    // Saved = what cache_read would have cost at full input rate minus what it
    // actually cost (0.10x). Saved per token = input_rate * 0.90.
    const savedUsd = (a.cache_read / 1_000_000) * inputRate * 0.9;
    totalSavedUsd += savedUsd;

    if (a.cache_read > 0) cachingFeatures += 1;

    const cacheState =
      a.cache_read > 0
        ? "✓ CACHING"
        : a.cache_create > 0
        ? "~ first write"
        : "✗ no cache";

    console.log(`\n[${cacheState}]  ${a.feature}  ·  ${a.model}`);
    console.log(`  calls=${a.calls}  cost=$${a.cost_usd.toFixed(6)}`);
    console.log(
      `  tokens: input=${fmt(a.input)}  output=${fmt(a.output)}  ` +
        `cache_create=${fmt(a.cache_create)}  cache_read=${fmt(a.cache_read)}`,
    );
    console.log(
      `  cache_hit_ratio=${(cacheHitRatio * 100).toFixed(1)}%  ` +
        `savings=$${savedUsd.toFixed(6)}`,
    );
    console.log(`  window: ${a.earliest}  →  ${a.latest}`);
  }

  console.log("\n" + "=".repeat(96));
  console.log(
    `\nSummary: ${cachingFeatures}/${aggs.length} feature+model combos are ` +
      `hitting the cache; total realized savings $${totalSavedUsd.toFixed(6)}.\n`,
  );

  if (cachingFeatures === 0 && aggs.some((a) => a.cache_create > 0)) {
    console.log(
      "Notes: cache writes are happening but no reads yet — this is expected " +
        "for the FIRST request to each unique cached prefix. Within 5 minutes, " +
        "a second request with the same stable prefix should hit the cache.\n",
    );
  }
}

async function main() {
  const { hours, feature } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url == null || url === "") {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL in env.");
    process.exit(1);
  }
  if (serviceRoleKey == null || serviceRoleKey === "") {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  // Pre-flight: confirm the new cache token columns exist.
  const preflight = await preflightSchemaCheck(supabase);
  if (!preflight.ok) {
    console.error(
      `\n✗ Migration sql/015_cache_tokens.sql is NOT applied.\n` +
        `  Error: ${preflight.errorMessage}\n\n` +
        `To apply: open the Supabase Dashboard SQL Editor for this project and run:\n\n` +
        "─".repeat(72) +
        "\n" +
        loadMigrationSql() +
        "─".repeat(72) +
        "\n\n" +
        `Then re-run this script.\n`,
    );
    process.exit(1);
  }

  // Window start.
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  let query = supabase
    .from("cost_events")
    .select(
      "feature, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_usd, created_at",
    )
    .gte("created_at", since)
    .eq("provider", "anthropic")
    .order("created_at", { ascending: false });

  if (feature != null) {
    query = query.eq("feature", feature);
  }

  const { data, error } = await query;
  if (error != null) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }

  printReport(aggregate((data ?? []) as Row[]), hours);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
