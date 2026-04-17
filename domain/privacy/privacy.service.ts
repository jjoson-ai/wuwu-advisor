import "server-only";

import type { User } from "@supabase/supabase-js";
import { PostgrestError } from "@supabase/supabase-js";

import type { UserBlueprintRow } from "@/domain/blueprint/blueprint.types";
import type { DailyBriefingRow } from "@/domain/briefing/briefing.types";
import type { DecisionGuidanceFeedbackRow } from "@/domain/decision/decision-feedback.types";
import type { DecisionGuidanceRow } from "@/domain/decision/decision.types";
import type { BriefingFeedbackRow } from "@/domain/feedback/feedback.types";
import type { UserForecastRow } from "@/domain/forecast/forecast.types";
import { getOnboardingRecord } from "@/domain/profile/profile.service";
import type {
  DeleteDataRequestResponse,
  UserDataExport,
  UserDataInventory,
} from "@/domain/privacy/privacy.types";
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

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Confirm the compliance-facing data tables exist in the same Supabase project as this app.`;
  }

  return error.message || fallback;
}

function buildPrivacyNotes() {
  return [
    "This export covers first-party Wuwu Advisor data stored in the app database and auth account.",
    "Processor-side exports and deletions for model vendors and other subprocessors still require manual follow-up through the DSAR runbook.",
    "Tracking preferences are currently stored on-device only and are not mirrored to the server yet.",
  ];
}

export async function buildUserDataExport(
  user: User,
  accessToken?: string | null,
): Promise<UserDataExport> {
  // TODO(compliance): add processor export metadata here once LLM vendor
  // minimization/pseudonymization handling is formalized and exportable.
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const onboardingRecordPromise = getOnboardingRecord(user.id, accessToken);

  const [
    onboardingRecord,
    briefingsResult,
    briefingFeedbackResult,
    blueprintResult,
    forecastResult,
    decisionGuidanceResult,
    decisionFeedbackResult,
  ] = await Promise.all([
    onboardingRecordPromise,
    supabase
      .from("daily_briefings")
      .select(
        "id, user_id, briefing_date, astrology_context_json, numerology_context_json, freeastro_context_json, western_payload_json, timing_payload_json, synthesis_payload_json, created_at",
      )
      .eq("user_id", user.id)
      .order("briefing_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("briefing_feedback")
      .select("id, briefing_id, user_id, usefulness_score, acted_on, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_blueprints")
      .select("id, user_id, blueprint_json, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_forecasts")
      .select("id, user_id, forecast_json, numerology_context_json, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("decision_guidance")
      .select("id, user_id, question_text, decision_type, decision_horizon, decision_intent, decision_feasibility, guidance_json, numerology_context_json, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("decision_guidance_feedback")
      .select("id, decision_guidance_id, user_id, usefulness_score, acted_on, note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (briefingsResult.error !== null) {
    throw new Error(formatDbError(briefingsResult.error, "Unable to export daily briefings."));
  }

  if (briefingFeedbackResult.error !== null) {
    throw new Error(
      formatDbError(briefingFeedbackResult.error, "Unable to export briefing feedback."),
    );
  }

  if (blueprintResult.error !== null) {
    throw new Error(formatDbError(blueprintResult.error, "Unable to export blueprint."));
  }

  if (forecastResult.error !== null) {
    throw new Error(formatDbError(forecastResult.error, "Unable to export forecast."));
  }

  if (decisionGuidanceResult.error !== null) {
    throw new Error(
      formatDbError(decisionGuidanceResult.error, "Unable to export decision guidance."),
    );
  }

  if (decisionFeedbackResult.error !== null) {
    throw new Error(
      formatDbError(
        decisionFeedbackResult.error,
        "Unable to export decision guidance feedback.",
      ),
    );
  }

  return {
    exportedAt: new Date().toISOString(),
    scope: "first_party_application_data",
    processorCoverage: "manual_follow_up_required",
    notes: buildPrivacyNotes(),
    account: {
      userId: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
    },
    privacyPreferences: {
      trackingEnabled: null,
      storage: "local_only",
      serverSynced: false,
      updatedAt: null,
      note: "Tracking preference is currently stored on-device only and is not copied into the server export yet.",
    },
    data: {
      profile: onboardingRecord.profile,
      birthData: onboardingRecord.birthData,
      dailyBriefings: (briefingsResult.data as DailyBriefingRow[] | null) ?? [],
      briefingFeedback:
        (briefingFeedbackResult.data as BriefingFeedbackRow[] | null) ?? [],
      blueprint: (blueprintResult.data as UserBlueprintRow | null) ?? null,
      forecast: (forecastResult.data as UserForecastRow | null) ?? null,
      decisionGuidance:
        (decisionGuidanceResult.data as DecisionGuidanceRow[] | null) ?? [],
      decisionGuidanceFeedback:
        (decisionFeedbackResult.data as DecisionGuidanceFeedbackRow[] | null) ?? [],
    },
  };
}

export async function getUserDataInventory(
  userId: string,
  accessToken?: string | null,
): Promise<UserDataInventory> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const onboardingRecordPromise = getOnboardingRecord(userId, accessToken);

  const [
    onboardingRecord,
    briefingsCount,
    briefingFeedbackCount,
    blueprintCount,
    forecastCount,
    decisionGuidanceCount,
    decisionFeedbackCount,
  ] = await Promise.all([
    onboardingRecordPromise,
    supabase.from("daily_briefings").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("briefing_feedback").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("user_blueprints").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("user_forecasts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("decision_guidance").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("decision_guidance_feedback").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const countResults = [
    [briefingsCount.error, "Unable to inspect daily briefings."],
    [briefingFeedbackCount.error, "Unable to inspect briefing feedback."],
    [blueprintCount.error, "Unable to inspect blueprints."],
    [forecastCount.error, "Unable to inspect forecasts."],
    [decisionGuidanceCount.error, "Unable to inspect decision guidance."],
    [decisionFeedbackCount.error, "Unable to inspect decision guidance feedback."],
  ] as const;

  for (const [error, fallback] of countResults) {
    if (error !== null) {
      throw new Error(formatDbError(error, fallback));
    }
  }

  return {
    profileRecords: onboardingRecord.profile === null ? 0 : 1,
    birthDataRecords: onboardingRecord.birthData === null ? 0 : 1,
    dailyBriefings: briefingsCount.count ?? 0,
    briefingFeedback: briefingFeedbackCount.count ?? 0,
    blueprints: blueprintCount.count ?? 0,
    forecasts: forecastCount.count ?? 0,
    decisionGuidance: decisionGuidanceCount.count ?? 0,
    decisionGuidanceFeedback: decisionFeedbackCount.count ?? 0,
  };
}

export async function createDeleteDataRequestResponse(
  user: User,
  accessToken?: string | null,
): Promise<DeleteDataRequestResponse> {
  const inventory = await getUserDataInventory(user.id, accessToken);

  // TODO(compliance): replace this response-only scaffold with a durable DSAR request
  // record and manual workflow trigger once the runbook integration is implemented.
  // TODO(compliance): add processor-aware deletion connectors for auth, LLM vendors,
  // and any future analytics tooling before calling deletion complete.
  return {
    requestId: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    status: "pending_manual_review",
    message:
      "Your deletion request has been received. First-party and processor-side deletion still require manual review before this flow can be marked complete.",
    inventory,
    coverage: {
      authAccount: "manual_follow_up_required",
      firstPartyDatabase: "manual_runbook_pending",
      llmVendors: "manual_follow_up_required",
      analyticsPreferences: "device_local_reset_required",
    },
    notes: [
      "This scaffold does not delete auth or processor-side records automatically yet.",
      "Follow the DSAR and retention runbooks before marking the request complete.",
      "Local device tracking preferences must still be reset on each client separately.",
    ],
  };
}
