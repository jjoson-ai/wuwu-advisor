import type { AstrologyContext } from "@/domain/astrology/context";
import "server-only";

import { PostgrestError } from "@supabase/supabase-js";

import type { BriefingOutput } from "@/domain/astrology/schemas";
import type { DailyBriefingRow } from "@/domain/briefing/briefing.types";
import type { NumerologyGenerationData } from "@/domain/numerology/numerology.agent";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";
import type { AccessLevel } from "@/lib/access";
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

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Rerun sql/001_init.sql in Supabase, verify public.daily_briefings exists, and confirm your local Supabase env values point to that same project.`;
  }

  return error.message || fallback;
}

export async function getLatestBriefingForUser(
  userId: string,
  accessToken?: string | null,
): Promise<DailyBriefingRow | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("daily_briefings")
    .select(
      "id, user_id, briefing_date, astrology_context_json, numerology_context_json, freeastro_context_json, western_payload_json, timing_payload_json, synthesis_payload_json, generation_access_level, created_at",
    )
    .eq("user_id", userId)
    .order("briefing_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to load the latest daily briefing."),
    );
  }

  return (result.data as DailyBriefingRow | null) ?? null;
}

export async function countDailyBriefingsForUser(
  userId: string,
  accessToken?: string | null,
) {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("daily_briefings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to count daily briefings."),
    );
  }

  return result.count ?? 0;
}

export async function upsertDailyBriefing(params: {
  userId: string;
  accessToken?: string | null;
  briefingDate: string;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyGenerationData;
  freeAstroContext: FreeAstroDailyContext;
  westernPayload: unknown;
  timingPayload: unknown;
  synthesisPayload: BriefingOutput;
  generationAccessLevel: AccessLevel;
}) {
  const supabase = await getSupabaseServerClient(params.accessToken ?? undefined);
  const result = await supabase
    .from("daily_briefings")
    .upsert(
      {
        user_id: params.userId,
        briefing_date: params.briefingDate,
        astrology_context_json: params.astrologyContext,
        numerology_context_json: params.numerologyContext,
        freeastro_context_json: params.freeAstroContext,
        western_payload_json: params.westernPayload,
        timing_payload_json: params.timingPayload,
        synthesis_payload_json: params.synthesisPayload,
        generation_access_level: params.generationAccessLevel,
      },
      { onConflict: "user_id,briefing_date" },
    )
    .select(
      "id, user_id, briefing_date, astrology_context_json, numerology_context_json, freeastro_context_json, western_payload_json, timing_payload_json, synthesis_payload_json, generation_access_level, created_at",
    )
    .single();

  if (result.error !== null) {
    return {
      success: false as const,
      message: formatDbError(result.error, "Unable to save daily briefing."),
    };
  }

  return {
    success: true as const,
    briefing: result.data as DailyBriefingRow,
  };
}
