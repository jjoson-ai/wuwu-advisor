import { toJSONSchema } from "zod";

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
  expandFreeForecastToForecast,
  normalizeFreeForecastSummary,
  normalizePaidForecastSummary,
  type Forecast,
  type ForecastHorizon,
} from "@/domain/forecast/forecast.types";
import type { NumerologyContext } from "@/domain/numerology/context";
import { CULT_PHRASE_RULES, FINANCIAL_SAFETY_RULES } from "@/domain/safety/prompt-rules";
import { assertNoForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

type ForecastAgentInput = {
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  chineseAstrologyContext: ChineseAstrologyContext | null;
  chineseAstrologySignal: ChineseAstrologySignal | null;
  horizon: ForecastHorizon;
  /**
   * Optional per-user calibration fragment from
   * `domain/accuracy/calibration.service.ts`. When non-null, spliced into the
   * forecast system prompt so medium-horizon guidance tunes to themes this
   * user has rated as hitting or missing over the last 30 days. See that
   * module for the gate logic.
   */
  calibrationFragment?: string | null;
};

export type ForecastOutputDepth = "free" | "full";

function buildForecastSystemPrompt(
  input: DailyBriefingInput,
  outputDepth: ForecastOutputDepth,
  calibrationFragment: string | null = null,
) {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, commentary, bullet points, or extra keys.",
    `Write a compact forecast for the ${DEFAULT_FORECAST_HORIZON_LABEL.toLowerCase()}, not for a single day and not for a whole year.`,
    "This should feel more strategic than a daily briefing and more time-sensitive than a birth blueprint.",
    "Use medium-horizon signals only: natal astrology, current solar context, personal year and personal month numerology, and stable Chinese astrology identity context.",
    "You may use current Moon only lightly as supporting context. Do not make this feel like a daily reading.",
    "Keep the tone grounded, human, useful, and concise.",
    "Avoid corporate language, doom language, and excessive mystical phrasing.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    ...FINANCIAL_SAFETY_RULES,
    ...CULT_PHRASE_RULES,
    "Reject generic phrasing such as 'today is a good day' or 'you may feel'.",
    "Do not use weekday-specific phrasing or intraday timing language.",
    "Instead describe the active phase, what is accumulating, what is gaining momentum, what should be built steadily, and what should not be forced.",
    "Focus on what pattern is active now, where to lean in patiently, where to hold back, and what kind of pacing or planning fits this period.",
    "Avoid generic lines like 'this month is good for' unless the claim is tightly grounded and specific.",
    "The summary must stand on its own as a compact 30-day planning brief for the visible free Forecast experience.",
    "Structure the summary as short labeled blocks, not as an essay.",
    outputDepth === "free"
      ? "This is the free Forecast path. Put the full user value into title and summary only. Do not spend tokens on hidden supporting sections. The summary must contain exactly these labeled blocks, in this order: What’s unfolding this month, What is gaining momentum, What to build steadily, What to avoid forcing, Likely turning point. Use exactly one sentence per block. Do not add current phase as a separate block. Do not add continuation paragraphs, extra commentary, or unlabeled overflow after the fifth block. The first block is mandatory and must read like a direct month-level thesis under the hero title, not like a sub-section. Each block has a distinct job: What’s unfolding this month = one decisive sentence naming the month’s core pattern across the next 30 days. What is gaining momentum = one concrete channel, process, or domain where traction is building. What to build steadily = one specific effort, structure, or commitment to reinforce over the next 30 days. What to avoid forcing = one concrete mistake pattern, overreach, or timing error to avoid. Likely turning point = one plain-language timing shift or inflection point inside this 30-day window. Each block must add new information and must not restate another block in softer wording. Do not repeat the same tension across multiple blocks. Avoid broad executive-coach phrasing or generic filler such as build foundations, be selective, many ideas, or do not force unless it is tied to a specific planning signal. Prefer one sharp planning insight over abstract explanation, and prefer one clear domain or process over broad life advice."
      : "This is the paid Forecast path. Use one user-facing summary section system only, in this exact order: What’s unfolding this month, Current phase, What is gaining momentum, What to build steadily, What to avoid forcing, Likely turning point. Do not invent or expose internal editorial labels such as DOMINANT PATTERN, WHERE EFFORT BELONGS, WHAT IS ACCUMULATING, WHAT TO DELAY, or KEY TENSION. If those concepts matter, express them inside the matching user-facing section instead of naming them separately. Fill every section with useful medium-horizon planning detail.",
    `Tone preference: ${input.tone_preference}.`,
    "career_and_money should help with medium-horizon planning, not minute-by-minute decisions.",
    "best_use_of_this_period should describe where patient accumulation is likely to pay off over the next month.",
    "what_to_avoid should name patterns of overreach, mis-timing, unnecessary friction, or work that should be delayed during this period.",
    "Every value must be a plain JSON string except the fixed object structure.",
    ...(calibrationFragment === null ? [] : [calibrationFragment]),
  ].join("\n\n");
}

function buildForecastUserPrompt(input: ForecastAgentInput) {
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
      numerology: {
        life_path_number: input.numerologyContext.life_path_number,
        birthday_number: input.numerologyContext.birthday_number,
        attitude_number: input.numerologyContext.attitude_number,
        name_number: input.numerologyContext.name_number,
        personal_year: input.numerologyContext.personal_year,
        personal_month: input.numerologyContext.personal_month,
      },
      chinese_astrology: {
        context: input.chineseAstrologyContext,
        signal: input.chineseAstrologySignal,
      },
    },
    null,
    2,
  );
}

export function buildForecastAgentRequest(
  input: ForecastAgentInput,
  outputDepth: ForecastOutputDepth = "full",
) {
  const outputSchema =
    outputDepth === "free" ? FreeForecastSchema : ForecastSchema;

  return {
    systemPrompt: buildForecastSystemPrompt(
      input.briefingInput,
      outputDepth,
      input.calibrationFragment ?? null,
    ),
    userPrompt: buildForecastUserPrompt(input),
    outputSchema,
    schemaName: "Forecast",
    structuredOutput: {
      name: "forecast_output",
      schema: toJSONSchema(outputSchema),
      strict: true,
    },
  };
}

export function validateForecastOutput(
  parsedJson: unknown,
  outputDepth: ForecastOutputDepth = "full",
): Forecast {
  const output = (() => {
    if (outputDepth === "free") {
      const freeForecast = FreeForecastSchema.parse(parsedJson);

      return expandFreeForecastToForecast({
        ...freeForecast,
        summary: normalizeFreeForecastSummary(freeForecast.summary),
      });
    }

    const forecast = ForecastSchema.parse(parsedJson);

    return {
      ...forecast,
      summary: normalizePaidForecastSummary(forecast.summary),
    };
  })();

  assertNoForbiddenInternalTermsInUserOutput(output, "Forecast output");
  return output;
}
