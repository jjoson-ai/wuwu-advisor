import { z } from "zod";

import type { DecisionGuidance } from "@/domain/decision/decision.types";
import type { AskTurnRow } from "@/domain/decision/decision.types";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelForPass } from "@/lib/model-routing";

const SuggestedFollowupsSchema = z.object({
  suggested_followups: z.array(z.string().min(1)).min(1).max(3),
});

function formatGuidanceSummary(guidance: DecisionGuidance): string {
  return [
    `Recommendation: ${guidance.recommendation.headline} (stance: ${guidance.recommendation.stance})`,
    `Why: ${guidance.why_this_answer.description}`,
    `Timing: ${guidance.timing_posture.description}`,
    `Watch out for: ${guidance.what_to_watch_out_for.items.join("; ")}`,
  ].join("\n");
}

function formatPriorTurns(turns: AskTurnRow[]): string {
  if (turns.length === 0) return "";

  return turns
    .map(
      (turn) =>
        `User: ${turn.user_message}\nAssistant: ${turn.assistant_response}`,
    )
    .join("\n\n");
}

export function buildFollowUpRequest(params: {
  originalQuestion: string;
  initialGuidance: DecisionGuidance;
  priorTurns: AskTurnRow[];
  newMessage: string;
}) {
  const systemPrompt = [
    "You are a thoughtful astrologer continuing a follow-up conversation about a specific decision.",
    "The user has already received structured guidance on their question.",
    "Respond directly and specifically to what they just said.",
    "Stay grounded in the context of the original question and guidance.",
    "Add new depth, a different angle, or a concrete next step — do not repeat the original guidance verbatim.",
    "Be practical and precise. 2–3 paragraphs maximum.",
    "Do not use markdown. Do not use bullet points. Write in plain prose.",
    "Do not mention internal terms like 'synthesis pass', 'routing', or model names.",
  ].join("\n");

  const context: string[] = [
    `Original question: ${params.originalQuestion}`,
    "",
    "Original guidance:",
    formatGuidanceSummary(params.initialGuidance),
  ];

  const priorTurnsText = formatPriorTurns(params.priorTurns);

  if (priorTurnsText !== "") {
    context.push("", "Conversation so far:", priorTurnsText);
  }

  context.push("", `User now says: ${params.newMessage}`);

  return {
    systemPrompt,
    userPrompt: context.join("\n"),
  };
}

export function buildSuggestionsRequest(params: {
  originalQuestion: string;
  priorTurns: AskTurnRow[];
  latestExchange: { userMessage: string; assistantResponse: string };
}) {
  const systemPrompt = [
    "Return exactly one JSON object and nothing else.",
    "Generate 2–3 short follow-up questions the user might naturally want to ask next.",
    "Each question must be concrete, 12 words or less, and directly related to the conversation.",
    "Do not repeat what has already been asked.",
  ].join("\n");

  const context = [
    `Original question: ${params.originalQuestion}`,
    "",
    "Latest exchange:",
    `User: ${params.latestExchange.userMessage}`,
    `Assistant: ${params.latestExchange.assistantResponse}`,
  ].join("\n");

  return {
    systemPrompt,
    userPrompt: context,
    structuredOutput: {
      name: "suggested_followups",
      schema: {
        type: "object",
        properties: {
          suggested_followups: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["suggested_followups"],
        additionalProperties: false,
      },
    },
    maxOutputTokens: 200,
  };
}

export async function generateFollowUpSuggestions(params: {
  originalQuestion: string;
  priorTurns: AskTurnRow[];
  latestExchange: { userMessage: string; assistantResponse: string };
}): Promise<string[]> {
  const model = getModelForPass("extract");
  const request = buildSuggestionsRequest(params);

  try {
    const result = await generateJsonObjectWithMeta({
      provider: model.provider,
      model: model.model,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      structuredOutput: request.structuredOutput,
      maxOutputTokens: request.maxOutputTokens,
      stepName: "follow-up suggestions",
    });

    const parsed = SuggestedFollowupsSchema.safeParse(result.parsedJson);

    return parsed.success ? parsed.data.suggested_followups : [];
  } catch {
    return [];
  }
}
