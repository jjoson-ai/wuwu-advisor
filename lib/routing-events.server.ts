import "server-only";

import type { RoutingEvent } from "@/lib/routing-events";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function logRoutingEvent(event: RoutingEvent) {
  console.info("[routing_event]", JSON.stringify(event));

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("routing_events").insert({
      occurred_at: event.timestamp,
      request_id: event.request_id,
      feature: event.feature,
      tier: event.tier,
      platform: event.platform,
      final_model_selected: event.final_model_selected,
      path_taken: event.path_taken,
      fallback_triggered: event.fallback_triggered,
      fallback_reason: event.fallback_reason,
      complexity_score: event.complexityScore,
      conflict_score: event.conflictScore,
      emotional_intensity: event.emotionalIntensity,
      decision_ambiguity: event.decisionAmbiguity,
      phase_shift_score: event.phaseShiftScore,
      synthesis_burden: event.synthesisBurden,
      forced_frontier_reasons_json: event.forced_frontier_reasons,
      tone_preference: event.tone_preference ?? null,
    });

    if (error !== null) {
      console.error("[routing_event_persist_failed]", error.message);
    }
  } catch (error) {
    console.error("[routing_event_persist_failed]", error);
  }
}
