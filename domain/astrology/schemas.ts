import { z } from "zod";

import {
  BIRTH_TIME_CONFIDENCE_OPTIONS,
  TONE_PREFERENCE_OPTIONS,
} from "@/lib/config";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

export const DateStringSchema = z
  .string()
  .regex(datePattern, "Expected date in YYYY-MM-DD format.");

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export const EnergyLevelSchema = z.enum(["low", "medium", "high"]);
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);

export const DailyBriefingInputSchema = z.object({
  display_name: z.string().trim().min(1),
  birth_date: DateStringSchema,
  birth_time: z
    .string()
    .regex(timePattern, "Expected birth_time in HH:MM format.")
    .nullable(),
  birth_time_confidence: z.enum(BIRTH_TIME_CONFIDENCE_OPTIONS),
  birth_city: z.string().trim().min(1),
  birth_country: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
  tone_preference: z.enum(TONE_PREFERENCE_OPTIONS),
  date: DateStringSchema,
  weekday: z.string().trim().min(1),
});

export type DailyBriefingInput = z.infer<typeof DailyBriefingInputSchema>;

export const WesternOutputSchema = z.object({
  source: z.literal("western"),
  confidence: ConfidenceSchema,
  executive_signal: z.string(),
  career: z.object({
    best_move: z.string(),
    watch_out: z.string(),
  }),
  relationships: z.object({
    energy: z.string(),
    best_action: z.string(),
    avoid: z.string(),
  }),
  energy: z.object({
    level: EnergyLevelSchema,
    best_use: z.string(),
    avoid: z.string(),
  }),
  micro_claim: z.object({
    statement: z.string(),
    horizon: z.literal("24h"),
    track_prompt: z.string(),
  }),
});

export type WesternOutput = z.infer<typeof WesternOutputSchema>;

export const TimingOutputSchema = z.object({
  source: z.literal("timing"),
  confidence: ConfidenceSchema,
  decision_of_day: z.object({
    scenario: z.string(),
    do: z.string(),
    avoid: z.string(),
    why: z.string(),
  }),
  timing: z.object({
    best_window: z.string(),
    avoid_window: z.string(),
  }),
  money_risk: z.object({
    lean_toward: z.string(),
    avoid: z.string(),
    risk_level: RiskLevelSchema,
  }),
  clarity: z.object({
    focus: z.string(),
    good_for: z.string(),
    not_ideal_for: z.string(),
  }),
});

export type TimingOutput = z.infer<typeof TimingOutputSchema>;

export const FinalSynthesisOutputSchema = z.object({
  date: DateStringSchema,
  confidence: ConfidenceSchema,
  executive_summary: z.string(),
  decision_of_day: z.object({
    scenario: z.string(),
    do: z.string(),
    avoid: z.string(),
    why: z.string(),
  }),
  cards: z.object({
    career: z.object({
      headline: z.string(),
      best_move: z.string(),
      watch_out: z.string(),
    }),
    money: z.object({
      headline: z.string(),
      lean_toward: z.string(),
      avoid: z.string(),
      risk_level: RiskLevelSchema,
    }),
    relationships: z.object({
      headline: z.string(),
      best_action: z.string(),
      avoid: z.string(),
    }),
    health: z.object({
      headline: z.string(),
      best_use: z.string(),
      avoid: z.string(),
    }),
    personal_growth: z.object({
      headline: z.string(),
      focus: z.string(),
      good_for: z.string(),
      not_ideal_for: z.string(),
    }),
  }),
  timing: z.object({
    best_window: z.string(),
    avoid_window: z.string(),
  }),
  micro_claim: z.object({
    statement: z.string(),
    horizon: z.literal("24h"),
    track_prompt: z.string(),
  }),
});

export type FinalSynthesisOutput = z.infer<typeof FinalSynthesisOutputSchema>;
