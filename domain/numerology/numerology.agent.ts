import type { DailyBriefingInput } from "@/domain/astrology/schemas";
import type { ModalitySignal } from "@/domain/modality/modality.types";
import {
  ModalitySignalSchema,
} from "@/domain/modality/modality.types";
import {
  buildNumerologyContext,
  type NumerologyContext,
} from "@/domain/numerology/context";

export type NumerologyGenerationData = {
  context: NumerologyContext;
  signal: ModalitySignal;
};

function getDecisionBias(personalDay: number): ModalitySignal["decision_bias"] {
  if ([1, 8].includes(personalDay)) return "act";
  if ([4, 7].includes(personalDay)) return "review";
  if ([2, 6].includes(personalDay)) return "refine";
  if ([5, 9].includes(personalDay)) return "hold";
  return "wait";
}

function getTimingBias(personalDay: number): ModalitySignal["timing_bias"] {
  if ([1, 5, 8].includes(personalDay)) return "early";
  if ([3, 6].includes(personalDay)) return "midday";
  if ([2, 7, 9].includes(personalDay)) return "late";
  return "mixed";
}

function getConfidence(context: NumerologyContext): ModalitySignal["confidence"] {
  if ([11, 22, 33].includes(context.personal_day)) {
    return "medium";
  }

  return "high";
}

export function buildNumerologySignal(
  input: Pick<DailyBriefingInput, "birth_date" | "date"> & {
    full_birth_name_for_numerology?: string | null;
  },
): NumerologyGenerationData {
  const context = buildNumerologyContext(input);
  const signal: ModalitySignal = {
    modality: "numerology",
    confidence: getConfidence(context),
    themes: [
      `Personal day ${context.personal_day} sets the immediate rhythm.`,
      `Personal month ${context.personal_month} shapes the broader pacing context.`,
      `Life path ${context.life_path_number}, birthday ${context.birthday_number}, and attitude ${context.attitude_number} shape the stable numerology baseline behind today's action bias.`,
      context.name_number === null
        ? "Name-based numerology is unavailable, so day rhythm leans more on date-based numerology."
        : `Name number ${context.name_number} adds a personal style layer, but today's action bias should still follow the personal day first.`,
    ],
    decision_bias: getDecisionBias(context.personal_day),
    timing_bias: getTimingBias(context.personal_day),
    relationship_tone:
      context.personal_day === 2 || context.personal_day === 6
        ? "Better for receptivity, listening, and softer exchanges than blunt pressure."
        : context.personal_day === 5
          ? "Better for flexibility and lighter social contact than heavy emotional demands."
          : "Better for clear expectations and steady tone than mixed signals.",
    money_posture:
      context.personal_day === 4 || context.personal_day === 8
        ? "Better for reviewing terms, tightening spending, or making practical money decisions than impulsive buys."
        : context.personal_day === 3 || context.personal_day === 5
          ? "Keep money moves smaller and more flexible than fixed or fast commitments."
          : "Better for pause-and-check money choices than quick financial decisions.",
    energy_posture:
      context.personal_day === 1
        ? "Energy favors initiative, but it is better to channel it into one clear push than scatter it."
        : context.personal_day === 7
          ? "Energy favors reflection, quieter pacing, and mental reset more than outward push."
          : "Energy favors measured pacing and steady follow-through over extremes.",
    limitations: context.limitations,
  };

  return {
    context,
    signal: ModalitySignalSchema.parse(signal),
  };
}
