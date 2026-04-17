import type { AstrologyContext } from "@/domain/astrology/context";
import {
  buildWesternUserPrompt,
  westernSystemPrompt,
} from "@/domain/astrology/prompts";
import {
  DailyBriefingInput,
  DailyBriefingInputSchema,
  WesternOutput,
  WesternOutputSchema,
} from "@/domain/astrology/schemas";
import { toJSONSchema } from "zod";

export function buildWesternAgentRequest(
  input: DailyBriefingInput,
  astrologyContext: AstrologyContext,
) {
  const parsedInput = DailyBriefingInputSchema.parse(input);

  return {
    systemPrompt: westernSystemPrompt(parsedInput),
    userPrompt: buildWesternUserPrompt(parsedInput, astrologyContext),
    outputSchema: WesternOutputSchema,
    schemaName: "WesternOutput",
    structuredOutput: {
      name: "western_output",
      schema: toJSONSchema(WesternOutputSchema),
      strict: true,
    },
  };
}

export function validateWesternOutput(parsedJson: unknown): WesternOutput {
  return WesternOutputSchema.parse(parsedJson);
}
