import { toJSONSchema } from "zod";

import type { BaziContext } from "@/domain/bazi/context";
import type { AstrologyContext } from "@/domain/astrology/context";
import type {
  ChineseAstrologyContext,
  ChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import { formatBaziChartForPrompt } from "@/domain/bazi/bazi.formatter";
import type { HumanDesignContext } from "@/domain/human_design/context";
import type { DailyBriefingInput } from "@/domain/astrology/schemas";
import {
  BlueprintSchema,
  FreeBlueprintSchema,
  expandFreeBlueprintToBlueprint,
  type Blueprint,
} from "@/domain/blueprint/blueprint.types";
import type { NumerologyContext } from "@/domain/numerology/context";
import {
  CULT_PHRASE_RULES,
  FINANCIAL_SAFETY_RULES,
  VOICE_DISCIPLINE_RULES,
} from "@/domain/safety/prompt-rules";
import { sanitizeForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";

type BlueprintAgentInput = {
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  chineseAstrologyContext: ChineseAstrologyContext;
  chineseAstrologySignal: ChineseAstrologySignal;
  baziContext: BaziContext;
  humanDesignContext: HumanDesignContext;
};

export type BlueprintOutputDepth = "free" | "full";

// Stable blueprint instructions — everything except the per-user tone preference.
// Placed in cachedSystemBlock so the ~1900-token prefix is shared across users with
// the same output depth (only 2 cache variants: free / full), saving 90% on
// cache-hit calls to Opus 4.7 (1024-token minimum cacheable prefix).
//
// Exported so scripts/exercise-prompt-cache.ts can validate the prefix
// reaches the cache threshold against the live Anthropic API.
export function buildBlueprintCachedSystemBlock(
  outputDepth: BlueprintOutputDepth,
): string {
  return [
    "Return exactly one JSON object and nothing else.",
    "Do not write markdown, headings outside JSON, bullet points, or commentary.",
    "Do not add keys outside the required schema.",
    "Write a stable personal blueprint, not a daily forecast.",
    "Use only durable signals: natal astrology, core numerology, stable Chinese astrology, and available BaZi or Human Design chart data.",
    "Use Chinese astrology as a third stable modality focused on temperament, instinctive social style, family tone, and steadiness versus adaptability.",
    "Use BaZi/Four Pillars only if bazi.is_available is true and a real chart is present. If BaZi is unavailable, do not infer, approximate, or invent pillars or day-master language.",
    "Use Human Design only if human_design.is_available is true and a real chart is present. If Human Design is unavailable, do not infer, approximate, or invent Human Design fields.",
    "Ignore daily_context, personal_year, personal_month, and personal_day for the final framing. The blueprint should feel durable, not date-fragile.",
    "Be human, grounded, and concise.",
    "Write in direct second-person voice.",
    "Use you and your throughout the summary and every descriptive section.",
    "Do not write in third person. Avoid phrases like this person, the person, the individual, they, or the native.",
    "If a sentence can be written with you or your, do that instead of any third-person construction.",
    "Do not describe the user from the outside. Address the user directly.",
    "Write the summary and every section description as if you are speaking to the user, not writing about them.",
    "Prefer sentence openings like You..., Your..., You tend to..., Your work style..., and Under pressure, you....",
    "Avoid sentence openings like This person..., The individual..., They are..., or [Name] is....",
    "If a draft sentence sounds like profile narration, rewrite it into direct guidance about how you operate.",
    "Avoid mystical filler, doom language, and generic corporate personality language.",
    ...FINANCIAL_SAFETY_RULES,
    ...CULT_PHRASE_RULES,
    ...VOICE_DISCIPLINE_RULES,
    "Focus on how the person tends to operate: strengths, friction points, connection style, work and money style, energy and stress pattern, and growth edge.",
    "Astrology and numerology should feel co-equal. Astrology should mainly explain emotional makeup, communication tone, relationship style, and energy or stress style.",
    "Numerology should mainly explain life lesson, motivation, long-term operating style, leadership or service orientation, purpose pattern, and growth edge.",
    "Chinese astrology should mainly explain temperament, social or family tone, instinctive style, and whether the person leans more toward steadiness, structure, adaptability, or change.",
    "BaZi should mainly explain structural life pattern, work and money tendencies, discipline versus flexibility, pressure pattern, deeper operating constitution, and how the person performs under challenge.",
    "Human Design should mainly explain decision style, energy strategy, how the person engages opportunities, and what tends to create resistance or friction.",
    "If natal_context.near_sign_boundary is true, you may mention adjacent_sign as nearby nuance only. Do not describe the user as equally both signs.",
    "Use these stable inputs first: sun_sign, cusp proximity, moon_sign, mercury_sign, venus_sign, mars_sign, birth_time_confidence, life_path_number, birthday_number, attitude_number, and name_number.",
    "Also use chinese zodiac animal, element, yin/yang polarity, and chinese signal summaries as real identity inputs, not decorative extras.",
    "If BaZi is available, use it as another stable modality. If it is unavailable, leave bazi_signature as unavailable and do not compensate by inventing pillar language.",
    "If BaZi is available, it should materially influence work_and_money_style, energy_and_stress, and growth_edge. Use it to clarify pressure response, structural discipline, resilience, and what kind of pace or challenge pattern suits the person best.",
    "If Human Design is available, use its chart fields as another stable modality. If it is unavailable, leave human_design_signature as unavailable and do not compensate by inventing similar language.",
    "The bazi_signature object should use deterministic BaZi values only. If BaZi is unavailable, use unavailable for day_master and the pillars.",
    "The guiding_numbers object should make numerology explicit and compact. Use strings like 9, 1, 3, or unknown.",
    "The chinese_signature object should make Chinese astrology explicit and compact. Use the deterministic animal, element, and polarity values directly.",
    "The human_design_signature object should use deterministic Human Design values only. If Human Design is unavailable, use unavailable for type, authority, and profile.",
    "Do not let numerology collapse into one supporting sentence. It should materially inform summary, work and money style, and growth edge.",
    "Do not let Chinese astrology collapse into one supporting sentence. It should materially inform core pattern and communication and connection.",
    "Do not let BaZi dominate the full blueprint. It should sharpen work and money style, constitution under pressure, discipline, longer-cycle operating pattern, and how the person holds up under stress when available.",
    "Do not let Human Design dominate the full blueprint. It should sharpen decision style, work pattern, energy use, and alignment language when available.",
    "Communication and connection should lean more on astrology. Growth edge and long-term pattern should lean more on numerology.",
    "Core pattern may blend multiple modalities, but Chinese astrology should be especially useful for instinctive style and social or family tone, while BaZi should be especially useful for work and money style, discipline, pressure pattern, and deeper structural pattern.",
    "When using BaZi terms, translate them into plain English. Prefer readable phrasing like Jia (Yang Wood) over raw stem names alone.",
    "Keep each description compact, specific, and plain-language.",
    "Section headlines may be short labels, but the summary and all section descriptions must still address the user directly as you.",
    "Never mention internal scores, routing metadata, debug fields, hidden system variables, or internal classifier names.",
    outputDepth === "free"
      ? "This is the free Blueprint path. Put the value into the overview, guiding numbers, Chinese signature, core pattern, and communication and connection only. Do not spend tokens on hidden premium sections."
      : "Return the full Blueprint object with all visible and premium sections filled in.",
    "Every value in the JSON must be a plain string except the fixed object structure.",
  ].join("\n\n");
}

export function buildBlueprintUserPrompt(input: BlueprintAgentInput) {
  return JSON.stringify(
    {
      display_name: input.briefingInput.display_name,
      stable_astrology: {
        natal_context: input.astrologyContext.natal_context,
      },
      core_numerology: {
        life_path_number: input.numerologyContext.life_path_number,
        birthday_number: input.numerologyContext.birthday_number,
        attitude_number: input.numerologyContext.attitude_number,
        name_number: input.numerologyContext.name_number,
        limitations: input.numerologyContext.limitations,
      },
      chinese_astrology: {
        context: input.chineseAstrologyContext,
        signal: input.chineseAstrologySignal,
      },
      bazi: {
        ...input.baziContext,
        readable_chart:
          input.baziContext.chart === null
            ? null
            : formatBaziChartForPrompt(input.baziContext.chart),
      },
      human_design: input.humanDesignContext,
    },
    null,
    2,
  );
}

export function buildBlueprintAgentRequest(
  input: BlueprintAgentInput,
  outputDepth: BlueprintOutputDepth = "full",
) {
  const outputSchema =
    outputDepth === "free" ? FreeBlueprintSchema : BlueprintSchema;

  return {
    cachedSystemBlock: buildBlueprintCachedSystemBlock(outputDepth),
    systemPrompt: `Tone preference: ${input.briefingInput.tone_preference}.`,
    userPrompt: buildBlueprintUserPrompt(input),
    outputSchema,
    schemaName: "Blueprint",
    structuredOutput: {
      name: "blueprint_output",
      schema: toJSONSchema(outputSchema),
      strict: true,
    },
  };
}

export function validateBlueprintOutput(
  parsedJson: unknown,
  outputDepth: BlueprintOutputDepth = "full",
): Blueprint {
  const output =
    outputDepth === "free"
      ? expandFreeBlueprintToBlueprint(FreeBlueprintSchema.parse(parsedJson))
      : BlueprintSchema.parse(parsedJson);
  return sanitizeForbiddenInternalTermsInUserOutput(output);
}
