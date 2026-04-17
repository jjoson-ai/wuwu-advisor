import { z } from "zod";

import { ConfidenceSchema } from "@/domain/astrology/schemas";
import type { DecisionType } from "@/domain/decision/decision.classifier";
import type { DecisionFeasibility } from "@/domain/decision/decision.feasibility";
import type { DecisionHorizon } from "@/domain/decision/decision.horizon";
import type { DecisionIntent } from "@/domain/decision/decision.intent";
import type { NumerologyGenerationData } from "@/domain/numerology/numerology.agent";
import type { AccessLevel } from "@/lib/access";

export const DecisionStanceSchema = z.enum([
  "go",
  "wait",
  "go_small",
  "avoid",
  "unclear",
]);

export const DecisionListSectionSchema = z.object({
  headline: z.string(),
  items: z.array(z.string()).min(1).max(5),
});

export const DecisionTextSectionSchema = z.object({
  headline: z.string(),
  description: z.string(),
});

export const DecisionGuidanceSchema = z.object({
  question: z.string(),
  recommendation: z.object({
    headline: z.string(),
    stance: DecisionStanceSchema,
  }),
  why_this_answer: DecisionTextSectionSchema,
  supporting_signals: DecisionListSectionSchema,
  what_to_watch_out_for: DecisionListSectionSchema,
  timing_posture: DecisionTextSectionSchema,
  confidence: ConfidenceSchema,
});

export type DecisionGuidance = z.infer<typeof DecisionGuidanceSchema>;

function normalizeListSection(section: unknown) {
  if (section == null || typeof section !== "object") {
    return section;
  }

  const objectSection = section as {
    headline?: unknown;
    items?: unknown;
  };

  return {
    ...objectSection,
    items: Array.isArray(objectSection.items)
      ? objectSection.items
          .filter((item): item is string => typeof item === "string" && item.trim() !== "")
          .slice(0, 5)
      : objectSection.items,
  };
}

export function normalizeDecisionGuidanceOutput(input: unknown) {
  if (input == null || typeof input !== "object") {
    return input;
  }

  const objectInput = input as Record<string, unknown>;

  return {
    ...objectInput,
    supporting_signals: normalizeListSection(objectInput.supporting_signals),
    what_to_watch_out_for: normalizeListSection(
      objectInput.what_to_watch_out_for,
    ),
  };
}

export type DecisionGuidanceRow = {
  id: string;
  user_id: string;
  question_text: string;
  decision_type: DecisionType | null;
  decision_horizon: DecisionHorizon | null;
  decision_intent: DecisionIntent | null;
  decision_feasibility: DecisionFeasibility | null;
  guidance_json: DecisionGuidance;
  numerology_context_json: NumerologyGenerationData | null;
  generation_access_level: AccessLevel | null;
  conversation_id: string | null;
  created_at: string;
};

export type FormattedDecisionGuidance = DecisionGuidance & {
  id: string;
  generation_access_level: AccessLevel | null;
  conversation_id: string | null;
  created_at: string;
};

export type AskConversationRow = {
  id: string;
  user_id: string;
  created_at: string;
};

export type AskTurnRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  turn_number: number;
  user_message: string;
  assistant_response: string;
  suggested_followups: string[];
  model_used: string | null;
  created_at: string;
};

export type AskConversationData = {
  conversation: AskConversationRow;
  initialGuidance: DecisionGuidanceRow;
  turns: AskTurnRow[];
};
