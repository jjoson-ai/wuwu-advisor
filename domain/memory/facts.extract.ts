import "server-only";

import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelForPass } from "@/lib/model-routing";
import { logLlmCost } from "@/lib/cost-events.server";
import { EXTRACTION_SYSTEM_PROMPT } from "@/domain/memory/facts.extract.prompts";
import {
  ExtractionOutputSchema,
  type ExtractedFact,
} from "@/domain/memory/facts.schema";

/**
 * Extracts durable facts from a single Ask exchange (user_message +
 * assistant_response). Runs with temperature 0 via Haiku 4.5.
 *
 * Fire-and-forget safe: all errors are logged and an empty array returned —
 * never throws.
 *
 * Guard rails applied here (before storage):
 *  - confidence < 0.7 → dropped by schema
 *  - empty array is expected and fine
 *
 * Additional guard rails (evidence grounding, dedup, rejection-list) are
 * applied in facts.store.ts after embedding.
 */
export async function extractFactsFromExchange(params: {
  userMessage: string;
  assistantResponse: string;
  existingFactTexts: string[]; // passed to avoid re-extracting known facts
}): Promise<ExtractedFact[]> {
  const memoryEnabled = process.env.MEMORY_EXTRACTION_ENABLED === "true";

  if (!memoryEnabled) return [];

  const model = getModelForPass("extract"); // Haiku 4.5

  const alreadyKnownSection =
    params.existingFactTexts.length > 0
      ? [
          "",
          "Already stored facts for this user — do NOT re-extract these:",
          ...params.existingFactTexts.map((f) => `- ${f}`),
        ].join("\n")
      : "";

  const userPrompt = [
    `User message:\n${params.userMessage.slice(0, 2000)}`,
    "",
    `Assistant response:\n${params.assistantResponse.slice(0, 2000)}`,
    alreadyKnownSection,
  ]
    .join("\n")
    .trim();

  try {
    const result = await generateJsonObjectWithMeta({
      provider: model.provider,
      model: model.model,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      stepName: "memory fact extraction",
      maxOutputTokens: 600,
      structuredOutput: {
        name: "fact_extraction",
        schema: {
          type: "object",
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fact_text: { type: "string" },
                  category: {
                    type: "string",
                    enum: [
                      "relational",
                      "situational",
                      "identity",
                      "ongoing_decision",
                      "preference",
                    ],
                  },
                  evidence_quote: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["fact_text", "category", "evidence_quote", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["facts"],
          additionalProperties: false,
        },
        strict: true,
      },
    });

    logLlmCost({
      meta: result,
      feature: "memory_extract",
      passLabel: "extract",
      model: model.model,
    });

    const parsed = ExtractionOutputSchema.safeParse(result.parsedJson);

    if (!parsed.success) {
      console.error(
        "[memory:extract] Schema validation failed:",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
      return [];
    }

    return parsed.data.facts;
  } catch (err) {
    console.error("[memory:extract] extractFactsFromExchange failed:", err);
    return [];
  }
}
