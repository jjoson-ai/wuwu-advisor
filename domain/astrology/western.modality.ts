import type { WesternOutput } from "@/domain/astrology/schemas";
import {
  ModalitySignalSchema,
  type ModalitySignal,
} from "@/domain/modality/modality.types";

function inferDecisionBias(output: WesternOutput): ModalitySignal["decision_bias"] {
  if (output.energy.level === "high") return "act";
  if (output.energy.level === "low") return "hold";
  return "refine";
}

function inferTimingBias(output: WesternOutput): ModalitySignal["timing_bias"] {
  if (output.energy.level === "high") return "early";
  if (output.energy.level === "low") return "late";
  return "mixed";
}

export function buildWesternModalitySignal(output: WesternOutput): ModalitySignal {
  return ModalitySignalSchema.parse({
    modality: "western",
    confidence: output.confidence,
    themes: [
      output.executive_signal,
      output.relationships.energy,
      output.energy.best_use,
    ],
    decision_bias: inferDecisionBias(output),
    timing_bias: inferTimingBias(output),
    relationship_tone: output.relationships.best_action,
    money_posture: "Western signal is secondary for money posture; defer to timing and synthesis.",
    energy_posture: output.energy.best_use,
    limitations: [
      "This is a lightweight adapter from the existing Western output, not a separate Western modality model.",
    ],
  });
}
