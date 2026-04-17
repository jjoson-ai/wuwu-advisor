import { toJSONSchema, z } from "zod";

import type { AstrologyContext } from "@/domain/astrology/context";
import type { DailyBriefingInput } from "@/domain/astrology/schemas";
import type {
  ChineseAstrologyContext,
  ChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import type { DecisionType } from "@/domain/decision/decision.classifier";
import type { DecisionFeasibility } from "@/domain/decision/decision.feasibility";
import type { DecisionHorizon } from "@/domain/decision/decision.horizon";
import type { DecisionIntent } from "@/domain/decision/decision.intent";
import {
  DecisionGuidanceSchema,
  type DecisionGuidance,
} from "@/domain/decision/decision.types";
import { validateDecisionGuidanceOutput } from "@/domain/decision/decision.agent";
import type { NumerologyContext } from "@/domain/numerology/context";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelForPass, type GenerationPass } from "@/lib/model-routing";

const RoutingScoreSchema = z.number().min(0).max(1);

export const DecisionSignalsSchema = z.object({
  intent: z.string().min(1),
  decision_type: z.string().min(1),
  emotional_tone: z.string().min(1),
  risk_level: z.enum(["low", "medium", "high"]),
  relevant_signals: z.array(z.string().min(1)).min(1).max(6),
  core_tradeoff: z.string().min(1),
  time_sensitivity: z.enum(["low", "medium", "high"]),
  routing: z.object({
    complexityScore: RoutingScoreSchema,
    conflictScore: RoutingScoreSchema,
    emotionalIntensity: RoutingScoreSchema,
    decisionAmbiguity: RoutingScoreSchema,
  }),
});

export type DecisionSignals = z.infer<typeof DecisionSignalsSchema>;

type DecisionTwoPassInput = {
  question: string;
  decisionType: DecisionType;
  decisionHorizon: DecisionHorizon;
  decisionIntent: DecisionIntent;
  decisionFeasibility: DecisionFeasibility;
  contextEmphasis: {
    primary: string[];
    secondary: string[];
    guidance: string;
  };
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  chineseAstrologyContext: ChineseAstrologyContext;
  chineseAstrologySignal: ChineseAstrologySignal;
  latestBriefing: unknown | null;
  latestForecast: unknown | null;
  latestBlueprint: unknown | null;
};

type DecisionGuidanceFromSignalsInput = DecisionTwoPassInput & {
  signals: DecisionSignals;
};

function buildDecisionSignalsSystemPrompt(input: DailyBriefingInput) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, commentary, or extra keys.",
    "You are extracting structured decision signals for a second-pass guidance model.",
    "Do not give advice.",
    "Do not recommend an option.",
    "Do not use direct instruction.",
    "Describe intent, tradeoff, signal relevance, and time sensitivity only.",
    "Keep each field concise and specific to the question.",
    "Routing metadata is internal only. Do not mention internal scores, debug fields, hidden system variables, or classifier names in any string field.",
    "No generic coaching or generic horoscope phrasing.",
    `Tone preference reference: ${input.tone_preference}.`,
  ].join("\n\n");
}

function buildDecisionSignalsUserPrompt(input: DecisionTwoPassInput) {
  return JSON.stringify(
    {
      question: input.question,
      decision_type: input.decisionType,
      decision_horizon: input.decisionHorizon,
      decision_intent: input.decisionIntent,
      decision_feasibility: input.decisionFeasibility,
      context_emphasis: input.contextEmphasis,
      display_name: input.briefingInput.display_name,
      astrology_context: input.astrologyContext,
      numerology_context: input.numerologyContext,
      chinese_astrology: {
        context: input.chineseAstrologyContext,
        signal: input.chineseAstrologySignal,
      },
      latest_briefing: input.latestBriefing,
      latest_forecast: input.latestForecast,
      latest_blueprint: input.latestBlueprint,
    },
    null,
    2,
  );
}

export function buildDecisionSignalsRequest(input: DecisionTwoPassInput) {
  return {
    systemPrompt: buildDecisionSignalsSystemPrompt(input.briefingInput),
    userPrompt: buildDecisionSignalsUserPrompt(input),
    schemaName: "decision_signals",
    structuredOutput: {
      name: "decision_signals",
      schema: toJSONSchema(DecisionSignalsSchema),
      strict: true,
    },
    maxOutputTokens: 700,
  };
}

function buildDecisionGuidanceSystemPrompt(
  input: DailyBriefingInput,
  pass: GenerationPass,
) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, commentary, or extra keys.",
    "You are interpreting structured decision signals into one piece of grounded guidance.",
    "You must take a stance.",
    "Do NOT present multiple equal options.",
    "Do NOT hedge excessively.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Instead: name the specific tradeoff, the decision posture, and the next move.",
    "Every statement must map to a specific signal.",
    "Avoid vague filler.",
    "Prefer concrete recommendation and timing language.",
    "Recommendation must be clear and practical.",
    "Why this fits, timing, and risks must stay tightly tied to the provided signals.",
    pass === "compose"
      ? "Keep the output shorter and simpler than the synthesize pass, but still decisive and grounded."
      : "Use more nuance where the signals support it, but stay concise.",
    `Tone preference: ${input.tone_preference}.`,
  ].join("\n\n");
}

function buildDecisionGuidanceUserPrompt(input: DecisionGuidanceFromSignalsInput) {
  return JSON.stringify(
    {
      question: input.question,
      decision_type: input.decisionType,
      decision_horizon: input.decisionHorizon,
      decision_intent: input.decisionIntent,
      decision_feasibility: input.decisionFeasibility,
      context_emphasis: input.contextEmphasis,
      display_name: input.briefingInput.display_name,
      signals: input.signals,
      astrology_context: input.astrologyContext,
      numerology_context: input.numerologyContext,
      chinese_astrology: {
        context: input.chineseAstrologyContext,
        signal: input.chineseAstrologySignal,
      },
      latest_briefing: input.latestBriefing,
      latest_forecast: input.latestForecast,
      latest_blueprint: input.latestBlueprint,
    },
    null,
    2,
  );
}

export function buildDecisionGuidanceRequest(
  input: DecisionGuidanceFromSignalsInput,
  pass: GenerationPass,
) {
  return {
    systemPrompt: buildDecisionGuidanceSystemPrompt(input.briefingInput, pass),
    userPrompt: buildDecisionGuidanceUserPrompt(input),
    schemaName: "decision_guidance",
    structuredOutput: {
      name: "decision_guidance",
      schema: toJSONSchema(DecisionGuidanceSchema),
      strict: true,
    },
    maxOutputTokens: pass === "compose" ? 1100 : 1400,
  };
}

export function hasStrongDecisionSignals(signals: DecisionSignals | null) {
  if (signals === null) {
    return false;
  }

  return (
    signals.intent.trim() !== "" &&
    signals.decision_type.trim() !== "" &&
    signals.core_tradeoff.trim() !== "" &&
    signals.relevant_signals.length > 0
  );
}

export async function generateAskSignals(input: DecisionTwoPassInput) {
  const model = getModelForPass("extract");
  const request = buildDecisionSignalsRequest(input);
  const result = await generateJsonObjectWithMeta({
    provider: model.provider,
    model: model.model,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    structuredOutput: request.structuredOutput,
    stepName: "decision signals generation",
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    data: DecisionSignalsSchema.parse(result.parsedJson),
    estimatedCostUsd: result.estimatedCostUsd,
    costIsEstimated: result.costIsEstimated,
  };
}

async function generateAskGuidanceForPass(
  input: DecisionGuidanceFromSignalsInput,
  pass: GenerationPass,
) {
  const model = getModelForPass(pass);
  const request = buildDecisionGuidanceRequest(input, pass);
  const result = await generateJsonObjectWithMeta({
    provider: model.provider,
    model: model.model,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    structuredOutput: request.structuredOutput,
    stepName: `decision ${pass} guidance generation`,
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    data: validateDecisionGuidanceOutput(result.parsedJson) as DecisionGuidance,
    estimatedCostUsd: result.estimatedCostUsd,
    costIsEstimated: result.costIsEstimated,
  };
}

export async function generateAskGuidanceFrontier(
  input: DecisionGuidanceFromSignalsInput,
) {
  return generateAskGuidanceForPass(input, "synthesize");
}

export async function generateAskGuidanceCheap(
  input: DecisionGuidanceFromSignalsInput,
) {
  return generateAskGuidanceForPass(input, "compose");
}
