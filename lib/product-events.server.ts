import "server-only";

import type { ProductEvent } from "@/lib/product-events";
import { dispatchPaidMediaConversion } from "@/lib/paid-media.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function logProductEvent(event: ProductEvent) {
  console.info("[product_event]", JSON.stringify(event));

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("product_events").insert({
      occurred_at: event.timestamp,
      user_id: event.user_id,
      event_name: event.event_name,
      tier: event.tier,
      platform: event.platform,
      feature: event.feature,
      plan_type: event.plan_type,
      upgrade_surface: event.upgrade_surface,
      request_id: event.request_id,
      final_model_selected: event.final_model_selected,
      generation_path: event.generation_path,
      fallback_triggered: event.fallback_triggered,
      request_cost_estimate_usd: event.request_cost_estimate_usd,
      request_cost_is_estimated: event.request_cost_is_estimated,
      is_first_use: event.is_first_use,
      repeat_within_24h: event.repeat_within_24h,
    });

    if (error !== null) {
      console.error("[product_event_persist_failed]", error.message);
    }
  } catch (error) {
    console.error("[product_event_persist_failed]", error);
  }

  try {
    await dispatchPaidMediaConversion(event);
  } catch (error) {
    console.error("[paid_media_dispatch_failed]", error);
  }
}
