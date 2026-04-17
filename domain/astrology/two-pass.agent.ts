import { toJSONSchema, z } from "zod";

import type { AstrologyContext } from "@/domain/astrology/context";
import {
  ConfidenceSchema,
  DailyBriefingInputSchema,
  EnergyLevelSchema,
  FinalSynthesisOutputSchema,
  type DailyBriefingInput,
  type FinalSynthesisOutput,
} from "@/domain/astrology/schemas";
import { validateFinalSynthesisOutput } from "@/domain/astrology/synthesis.agent";
import type { ModalitySignal } from "@/domain/modality/modality.types";
import type { NumerologyContext } from "@/domain/numerology/context";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelForPass, type GenerationPass } from "@/lib/model-routing";

const RoutingScoreSchema = z.number().min(0).max(1);

export const TodaySignalsSchema = z.object({
  core_tension: z.string().min(1),
  primary_opportunity: z.string().min(1),
  primary_risk: z.string().min(1),
  energy_level: EnergyLevelSchema,
  timing_windows: z.array(z.string().min(1)).min(1).max(3),
  domains: z.object({
    work: z.string().min(1),
    money: z.string().min(1),
    relationships: z.string().min(1),
    energy: z.string().min(1),
  }),
  confidence: ConfidenceSchema,
  routing: z.object({
    complexityScore: RoutingScoreSchema,
    conflictScore: RoutingScoreSchema,
    emotionalIntensity: RoutingScoreSchema,
    decisionAmbiguity: RoutingScoreSchema,
  }),
});

export type TodaySignals = z.infer<typeof TodaySignalsSchema>;

type TodaySignalsInput = {
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  numerologySignal: ModalitySignal;
  freeAstroDailyContext: FreeAstroDailyContext;
  blueprintContext: unknown | null;
};

type TodayNarrativeInput = TodaySignalsInput & {
  signals: TodaySignals;
};

function buildTodaySignalsSystemPrompt(input: DailyBriefingInput) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, headings, commentary, or extra keys.",
    "You are extracting structured daily signals for a second-pass narrative model.",
    "Do not give advice.",
    "Do not write recommendations.",
    "Do not write narrative paragraphs.",
    "Do not use 'you should', 'try to', or direct instruction.",
    "State tensions, opportunities, risks, timing, and domain conditions only.",
    "Use short factual phrases, not prose.",
    "Routing metadata is internal only. Do not mention internal scores, debug fields, hidden system variables, or classifier names in any string field.",
    "Ground every field in the provided context. No generic horoscope phrasing.",
    `Tone preference reference: ${input.tone_preference}.`,
  ].join("\n\n");
}

function buildTodaySignalsUserPrompt(input: TodaySignalsInput) {
  return JSON.stringify(
    {
      briefing_input: DailyBriefingInputSchema.parse(input.briefingInput),
      astrology_context: input.astrologyContext,
      numerology_context: input.numerologyContext,
      numerology_signal: input.numerologySignal,
      freeastro_daily_context: input.freeAstroDailyContext,
    },
    null,
    2,
  );
}

export function buildTodaySignalsRequest(input: TodaySignalsInput) {
  return {
    systemPrompt: buildTodaySignalsSystemPrompt(input.briefingInput),
    userPrompt: buildTodaySignalsUserPrompt(input),
    schemaName: "today_signals",
    structuredOutput: {
      name: "today_signals",
      schema: toJSONSchema(TodaySignalsSchema),
      strict: true,
    },
    maxOutputTokens: 700,
  };
}

function buildTodayNarrativeSystemPrompt(
  input: DailyBriefingInput,
  pass: GenerationPass,
) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, headings, commentary, or extra keys.",
    "You are interpreting structured signals.",
    "Do NOT generalize.",
    "Do NOT produce generic horoscope language.",
    "Base every statement on the provided signals.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Instead: describe a specific tension, tradeoff, timing posture, or clear action.",
    "The executive_summary must be specific to the provided signals.",
    "The decision_of_day.do and decision_of_day.avoid must be practical and clear.",
    "Today at a glance, best move, and best timing must feel sharper than the supporting cards.",
    "Every statement must map to a specific signal.",
    "Avoid vague filler.",
    "Prefer concrete recommendation and timing language.",
    pass === "compose"
      ? "Keep the output shorter and simpler than the synthesize pass, but still grounded and specific."
      : "Use more nuance where the signals support it, but keep the output tight.",
    "Keep the tone grounded, precise, and useful.",
    `Tone preference: ${input.tone_preference}.`,
  ].join("\n\n");
}

function buildTodayNarrativeUserPrompt(input: TodayNarrativeInput) {
  return JSON.stringify(
    {
      briefing_input: DailyBriefingInputSchema.parse(input.briefingInput),
      signals: input.signals,
      astrology_context: input.astrologyContext,
      numerology_context: input.numerologyContext,
      numerology_signal: input.numerologySignal,
      freeastro_daily_context: input.freeAstroDailyContext,
      blueprint_context: input.blueprintContext,
    },
    null,
    2,
  );
}

export function buildTodayNarrativeRequest(
  input: TodayNarrativeInput,
  pass: GenerationPass,
) {
  return {
    systemPrompt: buildTodayNarrativeSystemPrompt(input.briefingInput, pass),
    userPrompt: buildTodayNarrativeUserPrompt(input),
    schemaName: "today_narrative",
    structuredOutput: {
      name: "today_narrative",
      schema: toJSONSchema(FinalSynthesisOutputSchema),
      strict: true,
    },
    maxOutputTokens: pass === "compose" ? 1200 : 1600,
  };
}

export function hasStrongTodaySignals(signals: TodaySignals | null) {
  if (signals === null) {
    return false;
  }

  return (
    signals.core_tension.trim() !== "" &&
    signals.primary_opportunity.trim() !== "" &&
    signals.primary_risk.trim() !== "" &&
    signals.timing_windows.length > 0 &&
    signals.domains.work.trim() !== "" &&
    signals.domains.money.trim() !== "" &&
    signals.domains.relationships.trim() !== "" &&
    signals.domains.energy.trim() !== ""
  );
}

export async function generateTodaySignals(input: TodaySignalsInput) {
  const model = getModelForPass("extract");
  const request = buildTodaySignalsRequest(input);
  const result = await generateJsonObjectWithMeta({
    provider: model.provider,
    model: model.model,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    structuredOutput: request.structuredOutput,
    stepName: "today signals generation",
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    data: TodaySignalsSchema.parse(result.parsedJson),
    estimatedCostUsd: result.estimatedCostUsd,
    costIsEstimated: result.costIsEstimated,
  };
}

async function generateTodayNarrativeForPass(
  input: TodayNarrativeInput,
  pass: GenerationPass,
) {
  const model = getModelForPass(pass);
  const request = buildTodayNarrativeRequest(input, pass);
  const result = await generateJsonObjectWithMeta({
    provider: model.provider,
    model: model.model,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    structuredOutput: request.structuredOutput,
    stepName: `today ${pass} narrative generation`,
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    data: validateFinalSynthesisOutput(result.parsedJson) as FinalSynthesisOutput,
    estimatedCostUsd: result.estimatedCostUsd,
    costIsEstimated: result.costIsEstimated,
  };
}

export async function generateTodayNarrativeFrontier(input: TodayNarrativeInput) {
  return generateTodayNarrativeForPass(input, "synthesize");
}

export async function generateTodayNarrativeCheap(input: TodayNarrativeInput) {
  return generateTodayNarrativeForPass(input, "compose");
}
