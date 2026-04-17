import modelPricingData from "@/bakeoff/config/model-pricing.json";
import type { LlmProvider } from "@/lib/model-routing";

type GenerateJsonInput = {
  systemPrompt: string;
  userPrompt: string;
  provider?: LlmProvider;
  model?: string;
  maxOutputTokens?: number;
  stepName?: string;
  structuredOutput?:
    | {
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      }
    | undefined;
};

type AnthropicResponse = {
  error?: {
    message?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type LlmUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
};

export type GenerateJsonResultMeta = {
  parsedJson: unknown;
  usage: LlmUsage | null;
  estimatedCostUsd: number | null;
  costIsEstimated: boolean;
};

type ModelPricingEntry = {
  input_per_1m_usd?: number;
  output_per_1m_usd?: number;
};

const MODEL_PRICING = (
  modelPricingData as {
    models?: Record<string, ModelPricingEntry>;
  }
).models ?? {};

function getAnthropicConfig(model?: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallbackModel = process.env.ANTHROPIC_MODEL;
  const resolvedModel = model ?? fallbackModel;

  if (apiKey == null || apiKey === "") {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  if (resolvedModel == null || resolvedModel === "") {
    throw new Error("No model specified and ANTHROPIC_MODEL env var is not set.");
  }

  return { apiKey, model: resolvedModel };
}

function stripCodeFences(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function parseJsonText(rawText: string, stepName: string) {
  const trimmedText = rawText.trim();

  if (trimmedText === "") {
    throw new Error(`Anthropic returned empty text output during ${stepName}.`);
  }

  const candidates = [
    trimmedText,
    stripCodeFences(trimmedText),
    extractFirstJsonObject(stripCodeFences(trimmedText)),
  ].filter((candidate): candidate is string => candidate != null && candidate !== "");

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  const debugPreview = stripCodeFences(trimmedText).slice(0, 240);

  throw new Error(
    `Anthropic returned non-JSON text during ${stepName}. JSON.parse failed after direct parse, code-fence stripping, and JSON object extraction fallback. Preview: ${JSON.stringify(debugPreview)}`,
  );
}

function stripUnsupportedAnthropicSchemaKeywords(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedAnthropicSchemaKeywords);
  }

  if (value == null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as Record<string, unknown>;
  const nextEntries = Object.entries(objectValue)
    .filter(
      ([key]) =>
        key !== "$schema" &&
        key !== "minItems" &&
        key !== "maxItems" &&
        key !== "minimum" &&
        key !== "maximum" &&
        key !== "minLength" &&
        key !== "maxLength",
    )
    .map(([key, nestedValue]) => [
      key,
      stripUnsupportedAnthropicSchemaKeywords(nestedValue),
    ]);

  return Object.fromEntries(nextEntries);
}

function buildAnthropicResponseFormat(
  structuredOutput: GenerateJsonInput["structuredOutput"],
) {
  if (structuredOutput == null) {
    return undefined;
  }

  // Anthropic's output_config schema support is narrower than the JSON Schema
  // produced by zod. Keep local Zod parsing as the real validator and strip the
  // unsupported provider-side validation keywords here.
  const schema = stripUnsupportedAnthropicSchemaKeywords(structuredOutput.schema);

  return {
    format: {
      type: "json_schema",
      schema,
    },
  };
}

function extractAnthropicText(response: AnthropicResponse, stepName: string) {
  if (Array.isArray(response.content) === false) {
    throw new Error(`Anthropic response shape mismatch during ${stepName}.`);
  }

  const text = response.content
    .map((item) =>
      item != null && item.type === "text" && typeof item.text === "string"
        ? item.text
        : "",
    )
    .join("")
    .trim();

  if (text === "") {
    throw new Error(`Anthropic returned empty text during ${stepName}.`);
  }

  return text;
}

function getAnthropicUsage(response: AnthropicResponse): LlmUsage | null {
  if (response.usage == null) {
    return null;
  }

  const inputTokens =
    typeof response.usage.input_tokens === "number"
      ? response.usage.input_tokens
      : null;
  const outputTokens =
    typeof response.usage.output_tokens === "number"
      ? response.usage.output_tokens
      : null;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens:
      inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : null,
  };
}

function estimateCostUsd(model: string, usage: LlmUsage | null) {
  if (
    usage == null ||
    usage.input_tokens == null ||
    usage.output_tokens == null
  ) {
    return null;
  }

  const pricing = MODEL_PRICING[model];

  if (
    pricing?.input_per_1m_usd == null ||
    pricing.output_per_1m_usd == null
  ) {
    return null;
  }

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input_per_1m_usd;
  const outputCost =
    (usage.output_tokens / 1_000_000) * pricing.output_per_1m_usd;

  return Number((inputCost + outputCost).toFixed(6));
}

export async function generateJsonObjectWithMeta({
  systemPrompt,
  userPrompt,
  provider = "anthropic",
  model,
  maxOutputTokens = 1200,
  stepName = "generation",
  structuredOutput,
}: GenerateJsonInput): Promise<GenerateJsonResultMeta> {
  if (provider !== "anthropic") {
    throw new Error(`Unsupported provider: ${provider}. Only Anthropic is supported.`);
  }

  const config = getAnthropicConfig(model);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: maxOutputTokens,
      output_config: buildAnthropicResponseFormat(structuredOutput),
    }),
  });

  const data = (await response.json()) as AnthropicResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || "Anthropic request failed.");
  }

  const outputText = extractAnthropicText(data, stepName);
  const usage = getAnthropicUsage(data);

  return {
    parsedJson: parseJsonText(outputText, stepName),
    usage,
    estimatedCostUsd: estimateCostUsd(config.model, usage),
    costIsEstimated: true,
  };
}

export async function generateJsonObject(
  input: GenerateJsonInput,
): Promise<unknown> {
  const result = await generateJsonObjectWithMeta(input);
  return result.parsedJson;
}

type AnthropicStreamEvent = {
  type: string;
  delta?: { type: string; text?: string };
  message?: { usage?: { input_tokens?: number } };
  usage?: { output_tokens?: number };
};

export async function generateTextStream({
  provider = "anthropic",
  model,
  systemPrompt,
  userPrompt,
  maxOutputTokens = 1200,
  onChunk,
}: {
  provider?: LlmProvider;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  onChunk: (text: string) => void;
}): Promise<{ usage: LlmUsage | null; estimatedCostUsd: number | null; costIsEstimated: boolean }> {
  if (provider !== "anthropic") {
    throw new Error(`Unsupported provider: ${provider}. Only Anthropic is supported.`);
  }

  const config = getAnthropicConfig(model);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: maxOutputTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnthropicResponse;
    throw new Error(errorData.error?.message || "Anthropic streaming request failed.");
  }

  if (!response.body) {
    throw new Error("Anthropic streaming response has no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6);

          if (json === "[DONE]") continue;

          try {
            const event = JSON.parse(json) as AnthropicStreamEvent;

            if (
              event.type === "message_start" &&
              event.message?.usage?.input_tokens != null
            ) {
              inputTokens = event.message.usage.input_tokens;
            } else if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text != null
            ) {
              onChunk(event.delta.text);
            } else if (
              event.type === "message_delta" &&
              event.usage?.output_tokens != null
            ) {
              outputTokens = event.usage.output_tokens;
            }
          } catch {
            // skip malformed events
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const usage: LlmUsage | null =
    inputTokens !== null || outputTokens !== null
      ? {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens:
            inputTokens != null && outputTokens != null
              ? inputTokens + outputTokens
              : null,
        }
      : null;

  return {
    usage,
    estimatedCostUsd: estimateCostUsd(config.model, usage),
    costIsEstimated: true,
  };
}
