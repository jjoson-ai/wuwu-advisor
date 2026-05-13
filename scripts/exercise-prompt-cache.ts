/**
 * End-to-end prompt-cache exercise — makes 2 sequential Anthropic API calls
 * per cached prefix (blueprint on Opus, decision-guidance on Sonnet), writes
 * both to cost_events via the same logLlmCost path the prod routes use, and
 * reports the cache_creation / cache_read tokens returned by Anthropic.
 *
 * Why this exists: simulating "two users with the same tone preference hit
 * Blueprint within 5 minutes" through the UI is annoying. This script
 * deterministically exercises the cache wiring against the live API.
 *
 * Cost: ~$0.13 per run (2 Opus calls + 2 Sonnet calls with short outputs).
 *
 * Run via: npm run verify:cache:e2e
 *
 * Pre-flight: requires sql/015_cache_tokens.sql applied (so cost_events
 * has the cache token columns). Re-uses the schema check from verify:cache.
 */
// MUST be the first import — populates process.env from .env.local before
// lib/llm.ts's module-load IIFE reads ANTHROPIC_ZDR_ENABLED.
import "./_env";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildBlueprintCachedSystemBlock } from "@/domain/blueprint/blueprint.agent";
import { DECISION_GUIDANCE_CACHED_SYSTEM_BLOCK } from "@/domain/decision/decision.two-pass.agent";
import { logLlmCost } from "@/lib/cost-events.server";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { HAIKU_MODEL, SONNET_MODEL, OPUS_MODEL } from "@/lib/model-routing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, any, any, any, any>;

type TestCase = {
  label: string;
  feature: string; // used as cost_events.feature for traceability
  model: string;
  cachedSystemBlock: string;
  systemPrompt: string;
};

const TEST_CASES: TestCase[] = [
  {
    label: "Blueprint (Opus 4.7, ~1900-tok cached prefix)",
    feature: "test_cache_blueprint",
    model: OPUS_MODEL,
    cachedSystemBlock: buildBlueprintCachedSystemBlock("full"),
    systemPrompt: "Tone preference: grounded.",
  },
  {
    label: "Decision guidance (Sonnet 4.6, ~1077-tok cached prefix)",
    feature: "test_cache_decision",
    model: SONNET_MODEL,
    cachedSystemBlock: DECISION_GUIDANCE_CACHED_SYSTEM_BLOCK,
    systemPrompt: "Tone preference: grounded.",
  },
];

// Tiny user prompt + tiny structured output so we pay for the cached
// prefix and the model+API plumbing, not for output tokens. The schema is
// deliberately permissive so any Sonnet/Opus response shape can satisfy it.
const TEST_USER_PROMPT =
  "Reply with the JSON object {\"acknowledged\": true} and nothing else. Do not invoke any rules.";

const TEST_STRUCTURED_OUTPUT = {
  name: "test_cache_ack",
  schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["acknowledged"],
    properties: {
      acknowledged: { type: "boolean" as const },
    },
  },
  strict: true,
};

async function preflightSchemaCheck(
  supabase: SupabaseAdmin,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const { error } = await supabase
    .from("cost_events")
    .select("cache_creation_input_tokens, cache_read_input_tokens")
    .limit(1);

  if (error == null) return { ok: true };

  return { ok: false, errorMessage: error.message ?? "unknown" };
}

async function runOneCall(
  testCase: TestCase,
  callNumber: 1 | 2,
): Promise<{
  inputTokens: number;
  outputTokens: number;
  cacheCreate: number;
  cacheRead: number;
  costUsd: number | null;
  durationMs: number;
}> {
  const result = await generateJsonObjectWithMeta({
    provider: "anthropic",
    model: testCase.model,
    cachedSystemBlock: testCase.cachedSystemBlock,
    systemPrompt: testCase.systemPrompt,
    userPrompt: TEST_USER_PROMPT,
    maxOutputTokens: 100,
    stepName: `cache-exercise ${testCase.feature} call ${callNumber}`,
    structuredOutput: TEST_STRUCTURED_OUTPUT,
  });

  // Log to cost_events so npm run verify:cache picks these up too.
  logLlmCost({
    meta: result,
    feature: testCase.feature,
    passLabel: `call_${callNumber}`,
    model: testCase.model,
    userId: null,
    tier: null,
    requestId: `cache-exercise-${Date.now()}-${callNumber}`,
  });

  return {
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
    cacheCreate: result.usage?.cache_creation_input_tokens ?? 0,
    cacheRead: result.usage?.cache_read_input_tokens ?? 0,
    costUsd: result.estimatedCostUsd,
    durationMs: result.duration_ms,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

async function runTestCase(testCase: TestCase): Promise<boolean> {
  console.log(`\n─── ${testCase.label} ───`);
  console.log(`  feature=${testCase.feature}  model=${testCase.model}`);

  console.log(`\n  Call 1 (expect cache write)…`);
  const a = await runOneCall(testCase, 1);
  console.log(
    `    input=${fmt(a.inputTokens)}  output=${fmt(a.outputTokens)}  ` +
      `cache_create=${fmt(a.cacheCreate)}  cache_read=${fmt(a.cacheRead)}`,
  );
  console.log(`    cost=$${a.costUsd?.toFixed(6) ?? "0"}  duration=${a.durationMs}ms`);

  // Brief pause to let Anthropic's cache replicate (cache is regional, may
  // need a moment to be readable on a subsequent request).
  await new Promise((r) => setTimeout(r, 1500));

  console.log(`\n  Call 2 (expect cache read)…`);
  const b = await runOneCall(testCase, 2);
  console.log(
    `    input=${fmt(b.inputTokens)}  output=${fmt(b.outputTokens)}  ` +
      `cache_create=${fmt(b.cacheCreate)}  cache_read=${fmt(b.cacheRead)}`,
  );
  console.log(`    cost=$${b.costUsd?.toFixed(6) ?? "0"}  duration=${b.durationMs}ms`);

  const hit = b.cacheRead > 0;
  if (hit) {
    const savedTokens = b.cacheRead;
    const savedFraction = a.cacheCreate > 0 ? savedTokens / a.cacheCreate : 0;
    console.log(
      `\n  ✓ CACHE HIT — call 2 read ${fmt(savedTokens)} tokens from cache ` +
        `(${(savedFraction * 100).toFixed(0)}% of the cached prefix).`,
    );
  } else if (a.cacheCreate > 0) {
    console.log(
      `\n  ✗ Cache wrote on call 1 (${fmt(a.cacheCreate)} tokens) but call 2 did NOT read. ` +
        `Possible causes: prefix mismatch, regional cache miss, or sub-1024-tok prefix.`,
    );
  } else {
    console.log(
      `\n  ✗ Cache NEVER wrote — prefix is likely under the cache token threshold ` +
        `(${testCase.model.includes("haiku") ? "2048" : "1024"} tokens minimum).`,
    );
  }

  return hit;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (url == null || url === "") {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL.");
    process.exit(1);
  }
  if (serviceRoleKey == null || serviceRoleKey === "") {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (anthropicKey == null || anthropicKey === "") {
    console.error("Missing ANTHROPIC_API_KEY.");
    process.exit(1);
  }

  // Suppress the [llm] ZDR startup log noise during the run.
  // (The IIFE in lib/llm.ts has already fired by the time we get here.)

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const preflight = await preflightSchemaCheck(supabase);
  if (!preflight.ok) {
    console.error(
      `\n✗ Migration sql/015_cache_tokens.sql is NOT applied (${preflight.errorMessage}).\n` +
        `  Run npm run verify:cache for instructions, then re-run this script.\n`,
    );
    process.exit(1);
  }

  console.log("Anthropic prompt-cache end-to-end exercise");
  console.log("==========================================");
  console.log(
    "Making 2 sequential API calls per cached prefix; expect cache_read>0 on call 2.\n" +
      "Cost: ~$0.13/run. Rows are written to cost_events for npm run verify:cache.",
  );

  // Sanity-check: don't accidentally drag Haiku into this — it has a
  // 2048-tok cache minimum that none of our prefixes hit.
  for (const c of TEST_CASES) {
    if (c.model === HAIKU_MODEL) {
      console.error(`Test case ${c.label} targets Haiku — caching will not happen at this prefix length. Skipping.`);
    }
  }

  let allHit = true;
  for (const c of TEST_CASES) {
    if (c.model === HAIKU_MODEL) continue;
    const hit = await runTestCase(c);
    if (!hit) allHit = false;
  }

  // logLlmCost is fire-and-forget; the underlying Supabase insert is in
  // flight when the loop returns. Pause briefly so the last few rows
  // commit before we exit — otherwise the trailing cost_events rows
  // are silently dropped on quick CLI runs.
  await new Promise((r) => setTimeout(r, 3000));

  console.log(`\n${"=".repeat(60)}`);
  if (allHit) {
    console.log(
      "✓ All cached prefixes hit the cache on call 2. End-to-end pipeline verified.\n" +
        "  Run `npm run verify:cache` to see the test rows aggregated in cost_events.",
    );
    process.exit(0);
  } else {
    console.log(
      "✗ At least one cached prefix did NOT hit the cache. See diagnostics above.\n",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
