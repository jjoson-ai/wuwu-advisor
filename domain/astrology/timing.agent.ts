import type { AstrologyContext } from "@/domain/astrology/context";
import {
  buildTimingUserPrompt,
  timingSystemPrompt,
} from "@/domain/astrology/prompts";
import {
  DailyBriefingInput,
  DailyBriefingInputSchema,
  TimingOutput,
  TimingOutputSchema,
} from "@/domain/astrology/schemas";
import type { FreeAstroDailyContext } from "@/lib/freeastroapi";

export function buildTimingAgentRequest(
  input: DailyBriefingInput,
  astrologyContext: AstrologyContext,
  freeAstroDailyContext: FreeAstroDailyContext,
) {
  const parsedInput = DailyBriefingInputSchema.parse(input);

  return {
    systemPrompt: timingSystemPrompt(parsedInput),
    userPrompt: buildTimingUserPrompt(
      parsedInput,
      astrologyContext,
      freeAstroDailyContext,
    ),
    outputSchema: TimingOutputSchema,
    schemaName: "TimingOutput",
  };
}

export function validateTimingOutput(parsedJson: unknown): TimingOutput {
  return TimingOutputSchema.parse(parsedJson);
}
