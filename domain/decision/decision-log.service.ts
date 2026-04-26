import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CreateDecisionLogInput,
  DecisionLogRow,
  SubmitDecisionOutcomeInput,
} from "@/domain/decision/decision-log.types";

/**
 * 5.3 Decision log service.
 *
 * Handles the lifecycle of a decision log entry:
 *   1. User gets Ask guidance
 *   2. User optionally logs what they decided + picks a revisit date
 *   3. On revisit date, "how did it go?" prompt appears
 *   4. User submits outcome (went_well / mixed / went_poorly)
 */

function migrationErrorMessage(msg: string) {
  if (
    msg.includes("decision_logs") ||
    msg.includes("schema cache") ||
    msg.includes("PGRST205")
  ) {
    return "Supabase setup error: decision_logs table missing. Run sql/008_decision_logs.sql in your Supabase project.";
  }
  return msg;
}

/**
 * Create or update the decision log for a guidance row.
 * Upserts on (decision_guidance_id, user_id) so re-submitting the form
 * updates the existing log rather than creating a duplicate.
 */
export async function upsertDecisionLog(
  input: CreateDecisionLogInput,
  accessToken?: string | null,
): Promise<DecisionLogRow> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const { data, error } = await supabase
    .from("decision_logs")
    .upsert(
      {
        user_id: input.userId,
        decision_guidance_id: input.decisionGuidanceId,
        committed_action: input.committedAction,
        revisit_at: input.revisitAt,
        // Reset outcome fields if user updates the log before follow-up.
        outcome: null,
        outcome_note: null,
        outcome_submitted_at: null,
      },
      {
        onConflict: "decision_guidance_id,user_id",
        ignoreDuplicates: false,
      },
    )
    .select(
      "id, user_id, decision_guidance_id, committed_action, revisit_at, outcome, outcome_note, outcome_submitted_at, created_at",
    )
    .single();

  if (error !== null) {
    throw new Error(migrationErrorMessage(error.message || "Unable to save decision log."));
  }

  return data as DecisionLogRow;
}

/**
 * Load the log entry for a specific guidance row, if any.
 */
export async function getDecisionLog(
  userId: string,
  decisionGuidanceId: string,
  accessToken?: string | null,
): Promise<DecisionLogRow | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const { data, error } = await supabase
    .from("decision_logs")
    .select(
      "id, user_id, decision_guidance_id, committed_action, revisit_at, outcome, outcome_note, outcome_submitted_at, created_at",
    )
    .eq("user_id", userId)
    .eq("decision_guidance_id", decisionGuidanceId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(migrationErrorMessage(error.message || "Unable to load decision log."));
  }

  return (data as DecisionLogRow | null) ?? null;
}

/**
 * Return logs where the revisit date has passed and the outcome has not yet
 * been submitted. Used to surface the "how did it go?" prompt.
 *
 * todayIso: "YYYY-MM-DD" in the user's local timezone — caller computes this.
 */
export async function getOverdueDecisionLogs(
  userId: string,
  todayIso: string,
  accessToken?: string | null,
): Promise<DecisionLogRow[]> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const { data, error } = await supabase
    .from("decision_logs")
    .select(
      "id, user_id, decision_guidance_id, committed_action, revisit_at, outcome, outcome_note, outcome_submitted_at, created_at",
    )
    .eq("user_id", userId)
    .lte("revisit_at", todayIso)
    .is("outcome", null)
    .order("revisit_at", { ascending: true });

  if (error !== null) {
    // If the migration hasn't been applied, silently return empty so the
    // rest of the page still loads.
    if (
      error.code === "PGRST205" ||
      error.message.includes("schema cache") ||
      error.message.includes("decision_logs")
    ) {
      return [];
    }
    throw new Error(error.message || "Unable to load decision follow-ups.");
  }

  return (data ?? []) as DecisionLogRow[];
}

/**
 * Record the outcome of a logged decision.
 */
export async function submitDecisionOutcome(
  input: SubmitDecisionOutcomeInput,
  accessToken?: string | null,
): Promise<void> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const { error } = await supabase
    .from("decision_logs")
    .update({
      outcome: input.outcome,
      outcome_note: input.outcomeNote ?? null,
      outcome_submitted_at: new Date().toISOString(),
    })
    .eq("id", input.logId)
    .eq("user_id", input.userId); // RLS + app-layer ownership check

  if (error !== null) {
    throw new Error(migrationErrorMessage(error.message || "Unable to save outcome."));
  }
}
