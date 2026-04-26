import type { AstrologyContext } from "@/domain/astrology/context";
import {
  buildSynthesisUserPrompt,
  synthesisSystemPrompt,
} from "@/domain/astrology/prompts";
import type { ModalitySignal } from "@/domain/modality/modality.types";
import type { NumerologyContext } from "@/domain/numerology/context";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";
import { assertNoForbiddenInternalTermsInUserOutput } from "@/lib/output-safety";
import {
  DailyBriefingInput,
  DailyBriefingInputSchema,
  FinalSynthesisOutput,
  FinalSynthesisOutputSchema,
  TimingOutput,
  TimingOutputSchema,
  WesternOutput,
  WesternOutputSchema,
} from "@/domain/astrology/schemas";

type SynthesisAgentInput = {
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  numerologySignal: ModalitySignal;
  freeAstroDailyContext: FreeAstroDailyContext;
  westernModalitySignal: ModalitySignal;
  westernOutput: WesternOutput;
  timingOutput: TimingOutput;
  /**
   * Optional per-user calibration fragment from
   * `domain/accuracy/calibration.service.ts`. When non-null, gets spliced into
   * the synthesis system prompt so the final briefing tunes to the themes
   * this user has rated as hitting or missing. See that module for the gate
   * logic (env flag + minimum rating volume).
   */
  calibrationFragment?: string | null;
};

export function buildSynthesisAgentRequest(input: SynthesisAgentInput) {
  const briefingInput = DailyBriefingInputSchema.parse(input.briefingInput);
  const westernOutput = WesternOutputSchema.parse(input.westernOutput);
  const timingOutput = TimingOutputSchema.parse(input.timingOutput);

  return {
    systemPrompt: synthesisSystemPrompt(
      briefingInput,
      input.calibrationFragment ?? null,
    ),
    userPrompt: buildSynthesisUserPrompt({
      briefingInput,
      astrologyContext: input.astrologyContext,
      numerologyContext: input.numerologyContext,
      numerologySignal: input.numerologySignal,
      freeAstroDailyContext: input.freeAstroDailyContext,
      westernModalitySignal: input.westernModalitySignal,
      westernOutput,
      timingOutput,
    }),
    outputSchema: FinalSynthesisOutputSchema,
    schemaName: "FinalSynthesisOutput",
  };
}

export function validateFinalSynthesisOutput(
  parsedJson: unknown,
): FinalSynthesisOutput {
  const output = FinalSynthesisOutputSchema.parse(parsedJson);
  assertNoForbiddenInternalTermsInUserOutput(output, "Today output");
  return output;
}
