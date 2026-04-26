import "server-only";

import { logCostEvent } from "@/lib/cost-events.server";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_INPUT_CHARS = 8000; // ~6K tokens — hard cap before sending to API
// text-embedding-3-small pricing: $0.02 / 1M tokens (as of 2024-01)
const OPENAI_EMBEDDING_INPUT_USD_PER_1M = 0.02;

type OpenAIEmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
  error?: { message: string };
};

/**
 * Embeds a text string using OpenAI text-embedding-3-small (1536 dims).
 *
 * Returns null on any error (missing key, API failure, parse failure) so
 * callers can store the fact without an embedding and skip vector ops.
 * A fact without an embedding is still auditable; it just won't be retrieved
 * by the similarity search until re-embedded.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey == null || apiKey === "") {
    // Not an error — caller decides whether embedding is required.
    return null;
  }

  const startMs = Date.now();

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, MAX_INPUT_CHARS),
      }),
    });

    const durationMs = Date.now() - startMs;

    if (!response.ok) {
      const body = await response.text();
      console.error("[memory:embed] OpenAI API error:", response.status, body.slice(0, 200));
      logCostEvent({
        feature: "memory_embed",
        pass_label: "embed",
        provider: "openai",
        model: EMBEDDING_MODEL,
        cost_usd: null,
        cost_is_estimated: false,
        duration_ms: durationMs,
        succeeded: false,
      });
      return null;
    }

    const json = (await response.json()) as OpenAIEmbeddingResponse;

    if (json.error != null) {
      console.error("[memory:embed] OpenAI returned error:", json.error.message);
      logCostEvent({
        feature: "memory_embed",
        pass_label: "embed",
        provider: "openai",
        model: EMBEDDING_MODEL,
        cost_usd: null,
        cost_is_estimated: false,
        duration_ms: durationMs,
        succeeded: false,
      });
      return null;
    }

    // Log successful embedding with token count and estimated cost.
    const promptTokens = json.usage?.prompt_tokens ?? null;
    const costUsd =
      promptTokens != null
        ? Number(
            ((promptTokens / 1_000_000) * OPENAI_EMBEDDING_INPUT_USD_PER_1M).toFixed(8),
          )
        : null;

    logCostEvent({
      feature: "memory_embed",
      pass_label: "embed",
      provider: "openai",
      model: EMBEDDING_MODEL,
      input_tokens: promptTokens,
      output_tokens: null,
      cost_usd: costUsd,
      cost_is_estimated: true,
      duration_ms: durationMs,
      succeeded: true,
    });

    return json.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("[memory:embed] embedText failed:", err);
    logCostEvent({
      feature: "memory_embed",
      pass_label: "embed",
      provider: "openai",
      model: EMBEDDING_MODEL,
      cost_usd: null,
      cost_is_estimated: false,
      duration_ms: Date.now() - startMs,
      succeeded: false,
    });
    return null;
  }
}
