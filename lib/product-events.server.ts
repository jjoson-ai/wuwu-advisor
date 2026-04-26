import "server-only";

import type { ProductEvent } from "@/lib/product-events";
import {
  dispatchPaidMediaConversion,
  resolveAttributionForEvent,
  upsertUserAttributionFirstTouch,
} from "@/lib/paid-media.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function logProductEvent(event: ProductEvent) {
  console.info("[product_event]", JSON.stringify(event));

  // Resolve the first-touch attribution snapshot for this event. Reads the
  // `wuwu_attr_ft` cookie on the current request; falls back to the persisted
  // user_attribution row when the request context has no cookie (e.g. Stripe
  // webhook firing pro_activated from Stripe's origin). Returns an all-null
  // snapshot + channel="direct" when neither source has data.
  const { snapshot, channel } = await resolveAttributionForEvent(event.user_id);

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
      attribution_channel: channel,
      utm_source: snapshot.utm_source,
      utm_medium: snapshot.utm_medium,
      utm_campaign: snapshot.utm_campaign,
      utm_content: snapshot.utm_content,
      utm_term: snapshot.utm_term,
      gclid: snapshot.gclid,
      fbclid: snapshot.fbclid,
      landing_path: snapshot.landing_path,
      referrer_host: snapshot.referrer_host,
    });

    if (error !== null) {
      console.error("[product_event_persist_failed]", error.message);
    }
  } catch (error) {
    console.error("[product_event_persist_failed]", error);
  }

  // Signup completion → persist first-touch attribution at the user level.
  // This is the row that powers LTV-by-channel and paid-vs-organic retention;
  // writing here (instead of in the signup form's server action) guarantees
  // every signup_completed event has a matching user_attribution row with
  // the same attribution snapshot we just stamped on the event.
  if (event.event_name === "signup_completed" && event.user_id !== null) {
    await upsertUserAttributionFirstTouch(
      event.user_id,
      snapshot,
      channel,
      event.timestamp,
    );
  }

  try {
    await dispatchPaidMediaConversion(event);
  } catch (error) {
    console.error("[paid_media_dispatch_failed]", error);
  }
}
