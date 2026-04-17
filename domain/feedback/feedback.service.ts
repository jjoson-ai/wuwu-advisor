import "server-only";

import { PostgrestError } from "@supabase/supabase-js";

import type {
  BriefingFeedbackRow,
  SubmitBriefingFeedbackInput,
} from "@/domain/feedback/feedback.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function formatDbError(error: PostgrestError | null, fallback: string) {
  if (error === null) {
    return fallback;
  }

  const relationName =
    error.message.match(/'public\.([^']+)'/)?.[1] ??
    error.message.match(/relation "public\.([^"]+)"/)?.[1] ??
    null;

  if (error.code === "PGRST205" || error.message.includes("schema cache")) {
    const relationLabel = relationName ?? "the required tables";

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Rerun sql/001_init.sql in Supabase, verify public.briefing_feedback exists, and confirm your local Supabase env values point to that same project.`;
  }

  return error.message || fallback;
}

export async function getFeedbackForBriefing(
  userId: string,
  briefingId: string,
  accessToken?: string | null,
): Promise<BriefingFeedbackRow | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("briefing_feedback")
    .select("id, briefing_id, user_id, usefulness_score, acted_on, note, created_at")
    .eq("user_id", userId)
    .eq("briefing_id", briefingId)
    .maybeSingle();

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to load briefing feedback."),
    );
  }

  return (result.data as BriefingFeedbackRow | null) ?? null;
}

export async function upsertBriefingFeedback(
  input: SubmitBriefingFeedbackInput,
  accessToken?: string | null,
) {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("briefing_feedback")
    .upsert(
      {
        briefing_id: input.briefingId,
        user_id: input.userId,
        usefulness_score: input.usefulnessScore,
        acted_on: input.actedOn,
        note: input.note,
      },
      { onConflict: "briefing_id,user_id" },
    )
    .select("id, briefing_id, user_id, usefulness_score, acted_on, note, created_at")
    .single();

  if (result.error !== null) {
    return {
      success: false as const,
      message: formatDbError(result.error, "Unable to save briefing feedback."),
    };
  }

  return {
    success: true as const,
    feedback: result.data as BriefingFeedbackRow,
  };
}
