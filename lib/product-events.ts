import { z } from "zod";

import type { AccessLevel } from "@/lib/access";
import type { RoutingPathTaken } from "@/lib/routing-events";

export const PRODUCT_PLATFORM_HEADER = "x-wuwu-platform";

export const ProductPlatformSchema = z.enum(["web", "mobile"]);
export const ProductFeatureSchema = z.enum([
  "today",
  "forecast",
  "blueprint",
  "ask",
]);
export const ProductEventNameSchema = z.enum([
  "signup_started",
  "signup_completed",
  "onboarding_completed",
  "paywall_shown",
  "upgrade_clicked",
  "checkout_started",
  "checkout_completed",
  "pro_activated",
  "today_generated",
  "forecast_generated",
  "blueprint_generated",
  "ask_submitted",
  "ask_regenerated",
  "first_today_generated",
  "first_forecast_generated",
  "first_blueprint_generated",
  "first_ask_submitted",
  "age_gate_confirmed",
  "age_gate_declined",
  "age_gate_rejected_dob",
  "age_gate_rejected_onboarding",
  "crisis_detected",
  "care_mode_shown",
  "sos_button_clicked",
  "output_safety_flagged",
  "output_safety_blocked",
  "briefing_rating_submitted",
  "accuracy_report_viewed",
  "decision_logged",
  "decision_outcome_submitted",
]);

export type ProductPlatform = z.infer<typeof ProductPlatformSchema>;
export type ProductFeature = z.infer<typeof ProductFeatureSchema>;
export type ProductEventName = z.infer<typeof ProductEventNameSchema>;
export type GenerationPathTaken = RoutingPathTaken | "single_pass";

export const ClientProductEventInputSchema = z.object({
  event_name: ProductEventNameSchema,
  feature: ProductFeatureSchema.nullish(),
  plan_type: z.enum(["free", "pro"]).nullish(),
  upgrade_surface: z.string().trim().min(1).max(80).nullish(),
});

export type ClientProductEventInput = z.infer<
  typeof ClientProductEventInputSchema
>;

export type ProductEvent = {
  event_name: ProductEventName;
  timestamp: string;
  user_id: string | null;
  tier: AccessLevel | null;
  platform: ProductPlatform;
  feature: ProductFeature | null;
  plan_type: "free" | "pro" | null;
  upgrade_surface: string | null;
  request_id: string | null;
  final_model_selected: string | null;
  generation_path: GenerationPathTaken | null;
  fallback_triggered: boolean | null;
  request_cost_estimate_usd: number | null;
  request_cost_is_estimated: boolean | null;
  is_first_use: boolean | null;
  repeat_within_24h: boolean | null;
  /**
   * True when the per-user accuracy calibration fragment was injected into
   * this generation's prompt (see domain/accuracy/calibration.service.ts).
   * Null for events unrelated to briefing/forecast generation. Optional in the
   * type to avoid a mass-rewrite of every existing call site — when omitted,
   * the field is treated as null by downstream dashboards.
   */
  calibration_applied?: boolean | null;
  /**
   * Total emoji ratings the user has in the 30-day window at generation time.
   * Paired with calibration_applied so /ops can see the volume that unlocked
   * (or didn't unlock) calibration. Null for events unrelated to generation.
   */
  calibration_rating_count?: number | null;
  /**
   * Transaction-accurate value for paid-media dispatch. When present, overrides
   * the env fallback (PAID_MEDIA_PRO_VALUE_USD) for Google/Meta conversion
   * value. Only populated by Stripe webhook / billing-complete route where the
   * real charge amount is known (session.amount_total or first-charge unit
   * amount). Not persisted to product_events (transient dispatch hint).
   */
  paid_media_value_usd?: number | null;
  /** ISO 4217 currency code for paid_media_value_usd. Typically "USD". */
  paid_media_currency?: string | null;
};

export function getRequestPlatform(request: Request): ProductPlatform {
  return request.headers.get(PRODUCT_PLATFORM_HEADER) === "mobile"
    ? "mobile"
    : "web";
}

export function logProductEvent(event: ProductEvent) {
  console.info("[product_event]", JSON.stringify(event));
}
