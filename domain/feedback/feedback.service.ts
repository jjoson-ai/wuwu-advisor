import "server-only";

import { PostgrestError } from "@supabase/supabase-js";

import type {
  BriefingFeedbackRow,
  SubmitBriefingFeedbackInput,
} from "@/domain/feedback/feedback.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Single source of truth for the column list we pull back. Matches
// BriefingFeedbackRow so the cast in the helpers below stays honest.
const BRIEFING_FEEDBACK_COLUMNS =
  "id, briefing_id, user_id, rating_emoji, rating_theme_hit, rating_theme_miss, usefulness_score, acted_on, note, created_at";

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

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Rerun sql/001_init.sql + sql/006_briefing_rating.sql in Supabase, verify public.briefing_feedback exists with rating_emoji column, and confirm your local Supabase env values point to that same project.`;
  }

  // Column-missing error — user hasn't run 006 yet.
  if (
    error.code === "42703" ||
    /column .* does not exist/i.test(error.message)
  ) {
    return "Supabase setup error: briefing_feedback is missing the rating columns. Rerun sql/006_briefing_rating.sql in your connected Supabase project.";
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
    .select(BRIEFING_FEEDBACK_COLUMNS)
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
        rating_emoji: input.ratingEmoji,
        rating_theme_hit: input.ratingThemeHit,
        rating_theme_miss: input.ratingThemeMiss,
        // Legacy columns are now nullable (see 006_briefing_rating.sql).
        // Explicitly null them out so an upsert that replaces a legacy row
        // with a new-shape row doesn't leave a stale 1-5 score lying around.
        usefulness_score: null,
        acted_on: null,
        note: input.note,
      },
      { onConflict: "briefing_id,user_id" },
    )
    .select(BRIEFING_FEEDBACK_COLUMNS)
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
