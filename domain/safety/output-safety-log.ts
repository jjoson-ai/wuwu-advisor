import "server-only";

import type { OutputSafetyResult } from "@/domain/safety/output-safety";
import type { ProductFeature, ProductPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

/**
 * Output-safety event logging.
 *
 * Unlike crisis telemetry, these events describe the MODEL's output — not
 * user text — so we retain `user_id` for operational audit (e.g. identifying
 * that a specific user's onboarding triggers repeated protected-class
 * generalizations, which would be a prompt regression). No user prompt text
 * is logged in any case.
 *
 * Two event names:
 * - `output_safety_flagged` — emitted whenever the classifier returns unsafe,
 *   regardless of downstream response. Useful for drift monitoring.
 * - `output_safety_blocked` — emitted when the flag resulted in a blocked
 *   generation (MVP: every flag). Kept distinct so a future regen-once retry
 *   can differentiate "flagged, recovered on retry" from "flagged, ultimately
 *   blocked".
 *
 * Roadmap reference: 1.8.
 */

export type OutputSafetyLogInput = {
  userId: string | null;
  feature: ProductFeature;
  platform: ProductPlatform;
  requestId: string | null;
  result: OutputSafetyResult;
  modelUsed: string | null;
};

export async function logOutputSafetyFlagged(
  input: OutputSafetyLogInput,
): Promise<void> {
  console.warn(
    "[output_safety_flagged]",
    JSON.stringify({
      user_id: input.userId,
      feature: input.feature,
      platform: input.platform,
      category: input.result.category,
      severity: input.result.severity,
      detection_path: input.result.detectionPath,
      rationale: input.result.rationale,
      model_used: input.modelUsed,
      request_id: input.requestId,
      timestamp: new Date().toISOString(),
    }),
  );

  try {
    await logProductEvent({
      event_name: "output_safety_flagged",
      timestamp: new Date().toISOString(),
      user_id: input.userId,
      tier: null,
      platform: input.platform,
      feature: input.feature,
      plan_type: null,
      upgrade_surface: null,
      request_id: input.requestId,
      final_model_selected: input.modelUsed,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });
  } catch (error) {
    console.error("[output_safety_flagged_persist_failed]", error);
  }
}

export async function logOutputSafetyBlocked(
  input: OutputSafetyLogInput,
): Promise<void> {
  try {
    await logProductEvent({
      event_name: "output_safety_blocked",
      timestamp: new Date().toISOString(),
      user_id: input.userId,
      tier: null,
      platform: input.platform,
      feature: input.feature,
      plan_type: null,
      upgrade_surface: null,
      request_id: input.requestId,
      final_model_selected: input.modelUsed,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });
  } catch (error) {
    console.error("[output_safety_blocked_persist_failed]", error);
  }
}
