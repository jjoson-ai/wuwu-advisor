/**
 * Unit-economics telemetry — server-side only.
 *
 * logCostEvent()  — fire-and-forget; never throws; inserts one cost_events row.
 * logLlmCost()    — thin wrapper for Anthropic / OpenAI calls; accepts the
 *                   GenerateJsonResultMeta / generateTextStream return value
 *                   directly so callers don't have to destructure.
 *
 * server-only guard: deliberately omitted here because output-safety.ts
 * (which has no server-only constraint) imports this file. The module is
 * server-side by design — it depends on Supabase admin credentials that are
 * unavailable in the browser, and Next.js's bundler will error if it ends up
 * in a client chunk. The .server.ts suffix signals intent.
 *
 * Roadmap reference: 2.2
 */
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { LlmUsage } from "@/lib/llm";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CostEventInput = {
  /** Feature that triggered this call. E.g. 'today', 'blueprint', 'memory_extract'. */
  feature: string;
  /** Which pass within the feature. E.g. 'signals', 'narrative', 'safety_judge'. */
  pass_label?: string | null;
  /** API provider: 'anthropic' | 'openai' | 'freeastroapi' */
  provider: string;
  /** Model identifier, e.g. 'claude-haiku-4-5-20251001', 'text-embedding-3-small'. */
  model: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  /** Estimated cost in USD. Null for subscription-priced APIs (FreeAstroAPI). */
  cost_usd?: number | null;
  cost_is_estimated?: boolean;
  /** Wall-clock duration of the API call in milliseconds. */
  duration_ms: number;
  user_id?: string | null;
  /** 'free' | 'pro' | null */
  tier?: string | null;
  succeeded: boolean;
  /** Correlates with product_events.request_id for cross-table joins. */
  request_id?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Core fire-and-forget logger
// ─────────────────────────────────────────────────────────────────────────────

/** Fire-and-forget: insert one row into cost_events. Never throws. */
export function logCostEvent(event: CostEventInput): void {
  void _insertCostEvent(event).catch((err) => {
    console.error(
      "[cost_events] insert failed",
      JSON.stringify({
        feature: event.feature,
        pass_label: event.pass_label ?? null,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}

async function _insertCostEvent(event: CostEventInput): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("cost_events").insert({
    feature: event.feature,
    pass_label: event.pass_label ?? null,
    provider: event.provider,
    model: event.model,
    input_tokens: event.input_tokens ?? null,
    output_tokens: event.output_tokens ?? null,
    cost_usd: event.cost_usd ?? null,
    cost_is_estimated: event.cost_is_estimated ?? true,
    duration_ms: event.duration_ms,
    user_id: event.user_id ?? null,
    tier: event.tier ?? null,
    succeeded: event.succeeded,
    request_id: event.request_id ?? null,
  });

  if (error != null) {
    throw new Error(`cost_events insert: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper for Anthropic / OpenAI LLM calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logs an LLM call using the meta object returned by generateJsonObjectWithMeta
 * or generateTextStream (both now include duration_ms).
 *
 * Usage:
 *   const result = await generateJsonObjectWithMeta({...});
 *   logLlmCost({ meta: result, feature: "blueprint", passLabel: "blueprint",
 *                model: blueprintModel.model, userId: user.id, tier: ... });
 */
export function logLlmCost(params: {
  meta: {
    usage: LlmUsage | null;
    estimatedCostUsd: number | null;
    costIsEstimated: boolean;
    duration_ms: number;
  };
  feature: string;
  passLabel: string;
  model: string;
  provider?: string;
  userId?: string | null;
  tier?: string | null;
  succeeded?: boolean;
  requestId?: string | null;
}): void {
  logCostEvent({
    feature: params.feature,
    pass_label: params.passLabel,
    provider: params.provider ?? "anthropic",
    model: params.model,
    input_tokens: params.meta.usage?.input_tokens ?? null,
    output_tokens: params.meta.usage?.output_tokens ?? null,
    cost_usd: params.meta.estimatedCostUsd ?? null,
    cost_is_estimated: params.meta.costIsEstimated,
    duration_ms: params.meta.duration_ms,
    user_id: params.userId ?? null,
    tier: params.tier ?? null,
    succeeded: params.succeeded ?? true,
    request_id: params.requestId ?? null,
  });
}
