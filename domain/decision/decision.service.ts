import "server-only";

import { PostgrestError } from "@supabase/supabase-js";

import type {
  AskConversationData,
  AskConversationRow,
  AskTurnRow,
  DecisionGuidance,
  DecisionGuidanceRow,
} from "@/domain/decision/decision.types";
import type { DecisionType } from "@/domain/decision/decision.classifier";
import type { DecisionFeasibility } from "@/domain/decision/decision.feasibility";
import type { DecisionHorizon } from "@/domain/decision/decision.horizon";
import type { DecisionIntent } from "@/domain/decision/decision.intent";
import type { NumerologyGenerationData } from "@/domain/numerology/numerology.agent";
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

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Rerun sql/001_init.sql in Supabase, verify public.decision_guidance exists, and confirm your local Supabase env values point to that same project.`;
  }

  return error.message || fallback;
}

const DECISION_GUIDANCE_FIELDS =
  "id, user_id, question_text, decision_type, decision_horizon, decision_intent, decision_feasibility, guidance_json, numerology_context_json, generation_access_level, conversation_id, created_at";

export async function getLatestDecisionGuidanceForUser(
  userId: string,
  accessToken?: string | null,
): Promise<DecisionGuidanceRow | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("decision_guidance")
    .select(DECISION_GUIDANCE_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to load latest decision guidance."),
    );
  }

  return (result.data as DecisionGuidanceRow | null) ?? null;
}

export async function getDecisionGuidanceByIdForUser(
  userId: string,
  decisionGuidanceId: string,
  accessToken?: string | null,
): Promise<DecisionGuidanceRow | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("decision_guidance")
    .select(DECISION_GUIDANCE_FIELDS)
    .eq("user_id", userId)
    .eq("id", decisionGuidanceId)
    .maybeSingle();

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to load the selected decision guidance."),
    );
  }

  return (result.data as DecisionGuidanceRow | null) ?? null;
}

export async function listRecentDecisionGuidanceForUser(
  userId: string,
  limit = 5,
  accessToken?: string | null,
): Promise<DecisionGuidanceRow[]> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("decision_guidance")
    .select(DECISION_GUIDANCE_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to load recent decision guidance."),
    );
  }

  return (result.data as DecisionGuidanceRow[] | null) ?? [];
}

export async function countDecisionGuidanceForUser(
  userId: string,
  accessToken?: string | null,
) {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);
  const result = await supabase
    .from("decision_guidance")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (result.error !== null) {
    throw new Error(
      formatDbError(result.error, "Unable to count decision guidance."),
    );
  }

  return result.count ?? 0;
}

export async function insertDecisionGuidance(params: {
  userId: string;
  accessToken?: string | null;
  questionText: string;
  decisionType: DecisionType;
  decisionHorizon: DecisionHorizon;
  decisionIntent: DecisionIntent;
  decisionFeasibility: DecisionFeasibility;
  guidance: DecisionGuidance;
  numerologyContext: NumerologyGenerationData;
  generationAccessLevel: AccessLevel;
}) {
  const supabase = await getSupabaseServerClient(params.accessToken ?? undefined);

  const convResult = await supabase
    .from("ask_conversations")
    .insert({ user_id: params.userId })
    .select("id")
    .single();

  if (convResult.error !== null) {
    return {
      success: false as const,
      message: formatDbError(convResult.error, "Unable to create ask conversation."),
    };
  }

  const conversationId = convResult.data.id as string;

  const result = await supabase
    .from("decision_guidance")
    .insert({
      user_id: params.userId,
      question_text: params.questionText,
      decision_type: params.decisionType,
      decision_horizon: params.decisionHorizon,
      decision_intent: params.decisionIntent,
      decision_feasibility: params.decisionFeasibility,
      guidance_json: params.guidance,
      numerology_context_json: params.numerologyContext,
      generation_access_level: params.generationAccessLevel,
      conversation_id: conversationId,
    })
    .select(DECISION_GUIDANCE_FIELDS)
    .single();

  if (result.error !== null) {
    return {
      success: false as const,
      message: formatDbError(result.error, "Unable to save decision guidance."),
    };
  }

  return {
    success: true as const,
    guidance: result.data as DecisionGuidanceRow,
    conversationId,
  };
}

export async function getConversationDataForUser(
  userId: string,
  conversationId: string,
  accessToken?: string | null,
): Promise<AskConversationData | null> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const [convResult, guidanceResult, turnsResult] = await Promise.all([
    supabase
      .from("ask_conversations")
      .select("id, user_id, created_at")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("decision_guidance")
      .select(DECISION_GUIDANCE_FIELDS)
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("ask_turns")
      .select("id, conversation_id, user_id, turn_number, user_message, assistant_response, suggested_followups, model_used, created_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("turn_number", { ascending: true }),
  ]);

  if (convResult.error !== null) {
    throw new Error(formatDbError(convResult.error, "Unable to load conversation."));
  }

  if (guidanceResult.error !== null) {
    throw new Error(formatDbError(guidanceResult.error, "Unable to load conversation guidance."));
  }

  if (turnsResult.error !== null) {
    throw new Error(formatDbError(turnsResult.error, "Unable to load conversation turns."));
  }

  if (convResult.data === null || guidanceResult.data === null) {
    return null;
  }

  return {
    conversation: convResult.data as AskConversationRow,
    initialGuidance: guidanceResult.data as DecisionGuidanceRow,
    turns: (turnsResult.data ?? []) as AskTurnRow[],
  };
}

export async function insertAskTurn(params: {
  userId: string;
  conversationId: string;
  turnNumber: number;
  userMessage: string;
  assistantResponse: string;
  suggestedFollowups: string[];
  modelUsed: string | null;
  accessToken?: string | null;
}): Promise<{ success: true; turn: AskTurnRow } | { success: false; message: string }> {
  const supabase = await getSupabaseServerClient(params.accessToken ?? undefined);
  const result = await supabase
    .from("ask_turns")
    .insert({
      conversation_id: params.conversationId,
      user_id: params.userId,
      turn_number: params.turnNumber,
      user_message: params.userMessage,
      assistant_response: params.assistantResponse,
      suggested_followups: params.suggestedFollowups,
      model_used: params.modelUsed,
    })
    .select("id, conversation_id, user_id, turn_number, user_message, assistant_response, suggested_followups, model_used, created_at")
    .single();

  if (result.error !== null) {
    return {
      success: false as const,
      message: formatDbError(result.error, "Unable to save conversation turn."),
    };
  }

  return {
    success: true as const,
    turn: result.data as AskTurnRow,
  };
}
