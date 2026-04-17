import { z } from "zod";

import { ConfidenceSchema } from "@/domain/astrology/schemas";

export const ModalityNameSchema = z.enum(["western", "numerology"]);
export const DecisionBiasSchema = z.enum([
  "act",
  "wait",
  "refine",
  "review",
  "hold",
]);
export const TimingBiasSchema = z.enum(["early", "midday", "late", "mixed"]);

export const ModalitySignalSchema = z.object({
  modality: ModalityNameSchema,
  confidence: ConfidenceSchema,
  themes: z.array(z.string()).min(1).max(4),
  decision_bias: DecisionBiasSchema,
  timing_bias: TimingBiasSchema,
  relationship_tone: z.string(),
  money_posture: z.string(),
  energy_posture: z.string(),
  limitations: z.array(z.string()),
});

export type ModalitySignal = z.infer<typeof ModalitySignalSchema>;
