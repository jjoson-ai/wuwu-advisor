import "server-only";

import { createHash } from "node:crypto";

import type { CrisisDetectionResult } from "@/domain/safety/crisis-detection";
import type { ProductFeature, ProductPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";

/**
 * Crisis event logging — deliberately anonymized.
 *
 * Two sinks, both privacy-preserving:
 *
 * 1. `product_events` row with `user_id: null`. This gives us volume,
 *    platform breakdown, and feature-level rate, but the row cannot be
 *    linked to any auth.users record. If the table leaked tomorrow,
 *    nobody's crisis data is exposed.
 *
 * 2. `console.warn` with a salted SHA-256 hash of the user_id (16-char
 *    prefix). This sink is captured by the log drain and lets us answer
 *    "is the same pseudonymous user repeatedly triggering Care Mode in
 *    one session?" — the only per-user signal we ever need from crisis
 *    telemetry. The hash is one-way and uses a server-only salt, so the
 *    log drain holder cannot reverse it without the salt.
 *
 * We NEVER log the user's question text, the matched phrase, or any
 * surrounding context. Only: feature, layer, severity, pattern index.
 *
 * Roadmap reference: 1.7.
 */

export type CrisisLogInput = {
  userId: string;
  feature: ProductFeature;
  platform: ProductPlatform;
  detection: CrisisDetectionResult;
  requestId: string | null;
};

function hashUserId(userId: string): string {
  const salt = process.env.CRISIS_LOG_SALT ?? "wuwu-crisis-v1";
  return createHash("sha256")
    .update(`${salt}:${userId}`)
    .digest("hex")
    .slice(0, 16);
}

export async function logCrisisDetected(input: CrisisLogInput): Promise<void> {
  const hashedUserId = hashUserId(input.userId);

  // Rich, privacy-safe console warning — captured by log drain for ops.
  console.warn(
    "[crisis_detected]",
    JSON.stringify({
      hashed_user_id: hashedUserId,
      feature: input.feature,
      layer: input.detection.layer,
      severity: input.detection.severity,
      pattern_index: input.detection.patternIndex,
      request_id: input.requestId,
      timestamp: new Date().toISOString(),
    }),
  );

  // Persist an anonymized counter row in product_events. We intentionally
  // pass user_id: null so the DB row is unlinkable to any account.
  try {
    await logProductEvent({
      event_name: "crisis_detected",
      timestamp: new Date().toISOString(),
      user_id: null,
      tier: null,
      platform: input.platform,
      feature: input.feature,
      plan_type: null,
      upgrade_surface: null,
      request_id: input.requestId,
      final_model_selected: null,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });
  } catch (error) {
    // Log failure must never block the Care Mode path. Swallow.
    console.error("[crisis_detected_persist_failed]", error);
  }
}

export async function logCareModeShown(input: {
  userId: string;
  feature: ProductFeature;
  platform: ProductPlatform;
  requestId: string | null;
}): Promise<void> {
  try {
    await logProductEvent({
      event_name: "care_mode_shown",
      timestamp: new Date().toISOString(),
      user_id: null,
      tier: null,
      platform: input.platform,
      feature: input.feature,
      plan_type: null,
      upgrade_surface: null,
      request_id: input.requestId,
      final_model_selected: null,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });
  } catch (error) {
    console.error("[care_mode_shown_persist_failed]", error);
  }
}
