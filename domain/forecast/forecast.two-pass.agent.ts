import { toJSONSchema, z } from "zod";

import type { AstrologyContext } from "@/domain/astrology/context";
import type { DailyBriefingInput } from "@/domain/astrology/schemas";
import type {
  ChineseAstrologyContext,
  ChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import {
  DEFAULT_FORECAST_HORIZON_LABEL,
  FreeForecastSchema,
  ForecastSchema,
  type Forecast,
  type ForecastHorizon,
} from "@/domain/forecast/forecast.types";
import {
  validateForecastOutput,
  type ForecastOutputDepth,
} from "@/domain/forecast/forecast.agent";
import type { NumerologyContext } from "@/domain/numerology/context";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelForPass, type GenerationPass } from "@/lib/model-routing";

const RoutingScoreSchema = z.number().min(0).max(1);

export const ForecastSignalsSchema = z.object({
  phase_summary: z.string().min(1),
  key_themes: z.array(z.string().min(1)).min(1).max(6),
  risks: z.array(z.string().min(1)).min(1).max(5),
  opportunities: z.array(z.string().min(1)).min(1).max(5),
  energy_trend: z.string().min(1),
  next_shift: z.string().min(1),
  routing: z.object({
    complexityScore: RoutingScoreSchema,
    conflictScore: RoutingScoreSchema,
    phaseShiftScore: RoutingScoreSchema,
  }),
});

export type ForecastSignals = z.infer<typeof ForecastSignalsSchema>;

type ForecastTwoPassInput = {
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  chineseAstrologyContext: ChineseAstrologyContext | null;
  chineseAstrologySignal: ChineseAstrologySignal | null;
  horizon: ForecastHorizon;
  blueprintContext: unknown | null;
  /**
   * Optional per-user calibration fragment from
   * `domain/accuracy/calibration.service.ts`. When non-null, spliced into the
   * narrative system prompt so the forecast tunes to themes this user rates
   * as hitting or missing. Not used by the signals extraction pass — signals
   * should stay user-agnostic for prompt caching.
   */
  calibrationFragment?: string | null;
};

type ForecastNarrativeInput = ForecastTwoPassInput & {
  signals: ForecastSignals;
};

function buildForecastSignalsSystemPrompt(input: DailyBriefingInput) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, commentary, or extra keys.",
    `You are extracting medium-horizon signals for a second-pass forecast model covering the ${DEFAULT_FORECAST_HORIZON_LABEL.toLowerCase()}.`,
    "Do not give advice.",
    "Do not write planning recommendations.",
    "Do not write narrative paragraphs.",
    "Describe the current phase, what is gaining momentum, the next shift, the likely shift window, risks, opportunities, and energy trend only.",
    "Routing scores (complexityScore, conflictScore, phaseShiftScore) are floats between 0.0 and 1.0 inclusive. Use 0.0 for 'none', 0.3 for 'mild', 0.5 for 'moderate', 0.7 for 'strong', 1.0 for 'extreme'. Never emit values above 1.0 or on a 0-10 or 0-100 scale.",
    "complexityScore: how many distinct medium-horizon threads (transits, numerology cycles, chinese-astrology shifts) need to be weighed together across this period.",
    "conflictScore: how strongly the active period signals pull against each other (e.g. an expansion phase layered on a grounding numerology year).",
    "phaseShiftScore: how pronounced the shift between the current phase and the next one is over this horizon.",
    "Routing metadata is internal only. Do not mention internal scores, debug fields, hidden system variables, or classifier names in any string field.",
    "Keep it specific to this period. No generic monthly horoscope phrasing.",
    "Do not use today, weekday, morning, afternoon, evening, or intraday timing language.",
    "Use period language such as this stretch, this phase, over the next month, and what is changing next.",
    "Treat Forecast as a strategic 30-day planning read, not a second daily briefing.",
    `Tone preference reference: ${input.tone_preference}.`,
  ].join("\n\n");
}

function buildForecastSignalsUserPrompt(input: ForecastTwoPassInput) {
  return JSON.stringify(
    {
      display_name: input.briefingInput.display_name,
      forecast_horizon: input.horizon,
      stable_astrology: {
        natal_context: input.astrologyContext.natal_context,
      },
      current_astrology: {
        current_sun_sign: input.astrologyContext.daily_context.current_sun_sign,
        current_sun_longitude_degrees:
          input.astrologyContext.daily_context.current_sun_longitude_degrees,
        current_moon_sign: input.astrologyContext.daily_context.current_moon_sign,
      },
      numerology_context: input.numerologyContext,
      chinese_astrology: {
        context: input.chineseAstrologyContext,
        signal: input.chineseAstrologySignal,
      },
    },
    null,
    2,
  );
}

export function buildForecastSignalsRequest(input: ForecastTwoPassInput) {
  return {
    systemPrompt: buildForecastSignalsSystemPrompt(input.briefingInput),
    userPrompt: buildForecastSignalsUserPrompt(input),
    schemaName: "forecast_signals",
    structuredOutput: {
      name: "forecast_signals",
      schema: toJSONSchema(ForecastSignalsSchema),
      strict: true,
    },
    maxOutputTokens: 700,
  };
}

function buildForecastNarrativeSystemPrompt(
  input: DailyBriefingInput,
  pass: GenerationPass,
  outputDepth: ForecastOutputDepth,
  calibrationFragment: string | null = null,
) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, commentary, or extra keys.",
    `You are interpreting structured medium-horizon signals into one planning forecast for the ${DEFAULT_FORECAST_HORIZON_LABEL.toLowerCase()}.`,
    "Do NOT generalize.",
    "Do NOT produce generic horoscope language.",
    "Base every section on the provided signals.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Do not use weekday-specific phrasing or intraday timing language.",
    "Instead: describe the active phase, what is accumulating, where effort belongs, what to build steadily, what to delay, and what not to force.",
    "Every statement must map to a specific signal.",
    "Avoid vague filler.",
    "Prefer concrete planning and timing language.",
    "Avoid generic lines like 'this month is good for' unless the claim is tightly grounded and specific.",
    "The summary must stand on its own as a compact 30-day planning brief for the visible free Forecast experience.",
    "Structure the summary as short labeled blocks, not as an essay.",
    outputDepth === "free"
      ? "This is the free Forecast path. Return only the title and summary. Put the full planning value there and do not spend tokens on hidden supporting sections. The summary must contain exactly these labeled blocks, in this order: What’s unfolding this month, What is gaining momentum, What to build steadily, What to avoid forcing, Likely turning point. Use exactly one sentence per block. Do not add current phase as a separate block. Do not add continuation paragraphs, extra commentary, or unlabeled overflow after the fifth block. The first block is mandatory and must read like a direct month-level thesis under the hero title, not like a sub-section. Each block has a distinct job: What’s unfolding this month = one decisive sentence naming the month’s core pattern across the next 30 days. What is gaining momentum = one concrete channel, process, or domain where traction is building. What to build steadily = one specific effort, structure, or commitment to reinforce over the next 30 days. What to avoid forcing = one concrete mistake pattern, overreach, or timing error to avoid. Likely turning point = one plain-language timing shift or inflection point inside this 30-day window. Each block must add new information and must not restate another block in softer wording. Do not repeat the same tension across multiple blocks. Avoid broad executive-coach phrasing or generic filler such as build foundations, be selective, many ideas, or do not force unless it is tied to a specific planning signal. Prefer one sharp planning insight over abstract explanation, and prefer one clear domain or process over broad life advice."
      : "This is the paid Forecast path. Use one user-facing summary section system only, in this exact order: What’s unfolding this month, Current phase, What is gaining momentum, What to build steadily, What to avoid forcing, Likely turning point. Do not invent or expose internal editorial labels such as DOMINANT PATTERN, WHERE EFFORT BELONGS, WHAT IS ACCUMULATING, WHAT TO DELAY, or KEY TENSION. If those concepts matter, express them inside the matching user-facing section instead of naming them separately. Return the full Forecast object with supporting sections filled in.",
    "Current phase should explain the dominant pattern now across the 30-day window.",
    "Best use of this period should describe what to build steadily and where patient accumulation is likely to pay off.",
    "What to avoid should name what not to force or what to delay during this window, not what to avoid on a single day.",
    pass === "compose"
      ? "Keep the output shorter and simpler than the synthesize pass, but still grounded and planning-oriented."
      : "Use more nuance where the signals support it, but keep it compact.",
    `Tone preference: ${input.tone_preference}.`,
    ...(calibrationFragment === null ? [] : [calibrationFragment]),
  ].join("\n\n");
}

/**
 * Stable per-user/per-session context. Emitted as a cached system block so
 * prompt caching can amortize it across repeated Forecast generations.
 */
function buildForecastCachedContextBlock(input: ForecastNarrativeInput) {
  return JSON.stringify(
    {
      stable_user_context: {
        natal_context: input.astrologyContext.natal_context,
        numerology_context: input.numerologyContext,
        chinese_astrology_context: input.chineseAstrologyContext,
        blueprint_context: input.blueprintContext,
      },
    },
    null,
    2,
  );
}

function buildForecastNarrativeUserPrompt(input: ForecastNarrativeInput) {
  return JSON.stringify(
    {
      display_name: input.briefingInput.display_name,
      forecast_horizon: input.horizon,
      signals: input.signals,
      current_astrology: {
        current_sun_sign: input.astrologyContext.daily_context.current_sun_sign,
        current_sun_longitude_degrees:
          input.astrologyContext.daily_context.current_sun_longitude_degrees,
        current_moon_sign: input.astrologyContext.daily_context.current_moon_sign,
      },
      chinese_astrology_signal: input.chineseAstrologySignal,
    },
    null,
    2,
  );
}

export function buildForecastNarrativeRequest(
  input: ForecastNarrativeInput,
  pass: GenerationPass,
  outputDepth: ForecastOutputDepth,
) {
  const outputSchema =
    outputDepth === "free" ? FreeForecastSchema : ForecastSchema;

  return {
    systemPrompt: buildForecastNarrativeSystemPrompt(
      input.briefingInput,
      pass,
      outputDepth,
      input.calibrationFragment ?? null,
    ),
    userPrompt: buildForecastNarrativeUserPrompt(input),
    cachedSystemBlock: buildForecastCachedContextBlock(input),
    schemaName: "forecast_narrative",
    structuredOutput: {
      name: "forecast_narrative",
      schema: toJSONSchema(outputSchema),
      strict: true,
    },
    maxOutputTokens:
      outputDepth === "free"
        ? pass === "compose"
          ? 700
          : 900
        : pass === "compose"
          ? 1600
          : 2200,
  };
}

export function hasStrongForecastSignals(signals: ForecastSignals | null) {
  if (signals === null) {
    return false;
  }

  return (
    signals.phase_summary.trim() !== "" &&
    signals.key_themes.length > 0 &&
    signals.risks.length > 0 &&
    signals.opportunities.length > 0
  );
}

export async function generateForecastSignals(input: ForecastTwoPassInput) {
  const model = getModelForPass("extract");
  const request = buildForecastSignalsRequest(input);
  const result = await generateJsonObjectWithMeta({
    provider: model.provider,
    model: model.model,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    structuredOutput: request.structuredOutput,
    stepName: "forecast signals generation",
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    data: ForecastSignalsSchema.parse(result.parsedJson),
    estimatedCostUsd: result.estimatedCostUsd,
    costIsEstimated: result.costIsEstimated,
    usage: result.usage,
  };
}

async function generateForecastNarrativeForPass(
  input: ForecastNarrativeInput,
  pass: GenerationPass,
  outputDepth: ForecastOutputDepth,
) {
  const model = getModelForPass(pass, "forecast");
  const request = buildForecastNarrativeRequest(input, pass, outputDepth);
  const result = await generateJsonObjectWithMeta({
    provider: model.provider,
    model: model.model,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    cachedSystemBlock: request.cachedSystemBlock,
    structuredOutput: request.structuredOutput,
    stepName: `forecast ${pass} narrative generation`,
    maxOutputTokens: request.maxOutputTokens,
  });

  return {
    data: validateForecastOutput(result.parsedJson, outputDepth) as Forecast,
    estimatedCostUsd: result.estimatedCostUsd,
    costIsEstimated: result.costIsEstimated,
    usage: result.usage,
  };
}

export async function generateForecastNarrativeFrontier(
  input: ForecastNarrativeInput,
  outputDepth: ForecastOutputDepth = "full",
) {
  return generateForecastNarrativeForPass(input, "synthesize", outputDepth);
}

export async function generateForecastNarrativeCheap(
  input: ForecastNarrativeInput,
  outputDepth: ForecastOutputDepth = "full",
) {
  return generateForecastNarrativeForPass(input, "compose", outputDepth);
}
