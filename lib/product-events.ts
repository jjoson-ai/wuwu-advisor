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
};

export function getRequestPlatform(request: Request): ProductPlatform {
  return request.headers.get(PRODUCT_PLATFORM_HEADER) === "mobile"
    ? "mobile"
    : "web";
}

export function logProductEvent(event: ProductEvent) {
  console.info("[product_event]", JSON.stringify(event));
}
