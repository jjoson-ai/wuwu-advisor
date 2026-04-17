type EvalProvider = "openai" | "gemini" | "anthropic" | "deepseek";

export type EvalUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
};

export type EvalProviderResult = {
  rawText: string;
  parsedJson: unknown;
  usage: EvalUsage | null;
  latencyMs: number;
  estimatedCostUsd: number | null;
};

type GenerateStructuredEvalInput = {
  provider: EvalProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  stepName: string;
};

const OPENAI_BASE_URL = "https://api.openai.com/v1/responses";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions";
const REQUEST_TIMEOUT_MS = 120_000;

// Pricing is intentionally left nullable until we have a reviewed price table for the
// exact evaluation model IDs in use. The comparison document still exposes usage.
const MODEL_PRICING_USD_PER_1M: Partial<
  Record<string, { input: number; output: number }>
> = {};

function getProviderApiKey(provider: EvalProvider) {
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY ?? null;
  }

  if (provider === "gemini") {
    return process.env.GEMINI_API_KEY ?? null;
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ?? null;
  }

  return process.env.DEEPSEEK_API_KEY ?? null;
}

function getMissingApiKeyMessage(provider: EvalProvider) {
  if (provider === "openai") {
    return "Missing OPENAI_API_KEY.";
  }

  if (provider === "gemini") {
    return "Missing GEMINI_API_KEY.";
  }

  if (provider === "anthropic") {
    return "Missing ANTHROPIC_API_KEY.";
  }

  return "Missing DEEPSEEK_API_KEY.";
}

function stripCodeFences(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractBalancedJsonObject(text: string) {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (startIndex === -1) {
      if (character === "{") {
        startIndex = index;
        depth = 1;
      }

      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseJsonText(rawText: string, stepName: string) {
  const trimmedText = rawText.replace(/^\uFEFF/, "").trim();

  if (trimmedText === "") {
    throw new Error(`Provider returned empty text output during ${stepName}.`);
  }

  const strippedText = stripCodeFences(trimmedText);
  const candidates = [
    trimmedText,
    strippedText,
    extractBalancedJsonObject(strippedText),
  ].filter((candidate): candidate is string => candidate != null && candidate !== "");

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error(
    `Provider returned non-JSON text during ${stepName}. Preview: ${JSON.stringify(
      stripCodeFences(trimmedText).slice(0, 240),
    )}`,
  );
}

function looksLikeTruncatedJson(rawText: string) {
  const text = stripCodeFences(rawText.replace(/^\uFEFF/, "").trim());

  if (text.startsWith("{") === false && text.startsWith("[") === false) {
    return false;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (const character of text) {
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      depth += 1;
      continue;
    }

    if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }

  return depth > 0 || inString;
}

function mergeUsage(usages: Array<EvalUsage | null>): EvalUsage | null {
  const presentUsages = usages.filter((usage): usage is EvalUsage => usage !== null);

  if (presentUsages.length === 0) {
    return null;
  }

  const sumField = (field: keyof EvalUsage) =>
    presentUsages.every((usage) => usage[field] == null)
      ? null
      : presentUsages.reduce((sum, usage) => sum + (usage[field] ?? 0), 0);

  return {
    input_tokens: sumField("input_tokens"),
    output_tokens: sumField("output_tokens"),
    total_tokens: sumField("total_tokens"),
  };
}

function getRetryMaxOutputTokens(maxOutputTokens: number) {
  return Math.min(6400, Math.max(maxOutputTokens + 1800, Math.ceil(maxOutputTokens * 2)));
}

function getTruncationHint(stopReason: string | null, rawText: string) {
  if (stopReason === "max_tokens" || stopReason === "MAX_TOKENS") {
    return ` Likely truncated at the provider output token limit (stop reason: ${stopReason}).`;
  }

  if (looksLikeTruncatedJson(rawText)) {
    return " The returned JSON appears incomplete or truncated.";
  }

  return "";
}

function sanitizeJsonSchema(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeJsonSchema(item, [...path, String(index)]));
  }

  if (value == null || typeof value !== "object") {
    return value;
  }

  const sanitizedEntries = Object.entries(value).flatMap(([key, nestedValue]) => {
    const insidePropertiesMap = path[path.length - 1] === "properties";

    if (
      key === "$schema" ||
      key === "default" ||
      ((key === "title" || key === "description") && insidePropertiesMap === false)
    ) {
      return [];
    }

    return [[key, sanitizeJsonSchema(nestedValue, [...path, key])]];
  });

  return Object.fromEntries(sanitizedEntries);
}

function estimateCostUsd(model: string, usage: EvalUsage | null) {
  if (usage === null) {
    return null;
  }

  const pricing = MODEL_PRICING_USD_PER_1M[model];

  if (
    pricing == null ||
    usage.input_tokens == null ||
    usage.output_tokens == null
  ) {
    return null;
  }

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;

  return Number((inputCost + outputCost).toFixed(6));
}

async function fetchJsonWithTiming(
  url: string,
  init: RequestInit,
  stepName: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const responseText = await response.text();
    let parsedBody: unknown = null;

    try {
      parsedBody = responseText === "" ? null : JSON.parse(responseText);
    } catch {
      parsedBody = {
        error: {
          message: `Non-JSON response body during ${stepName}.`,
        },
      };
    }

    if (!response.ok) {
      const errorMessage =
        typeof parsedBody === "object" &&
        parsedBody !== null &&
        "error" in parsedBody &&
        typeof parsedBody.error === "object" &&
        parsedBody.error !== null &&
        "message" in parsedBody.error &&
        typeof parsedBody.error.message === "string"
          ? parsedBody.error.message
          : `Request failed with status ${response.status} during ${stepName}.`;

      throw new Error(errorMessage);
    }

    return {
      body: parsedBody,
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getOpenAiText(response: unknown, stepName: string) {
  if (
    typeof response === "object" &&
    response !== null &&
    "output_text" in response &&
    typeof response.output_text === "string" &&
    response.output_text.trim() !== ""
  ) {
    return response.output_text;
  }

  if (
    typeof response === "object" &&
    response !== null &&
    "output" in response &&
    Array.isArray(response.output)
  ) {
    for (const item of response.output) {
      if (
        item == null ||
        typeof item !== "object" ||
        item.type !== "message" ||
        item.role !== "assistant" ||
        Array.isArray(item.content) === false
      ) {
        continue;
      }

      for (const contentItem of item.content) {
        if (contentItem == null || typeof contentItem !== "object") {
          continue;
        }

        const candidateText =
          typeof contentItem.text === "string"
            ? contentItem.text
            : typeof contentItem.text === "object" &&
                contentItem.text !== null &&
                typeof contentItem.text.value === "string"
              ? contentItem.text.value
              : null;

        if (
          (contentItem.type === "output_text" || contentItem.type === "text") &&
          candidateText != null &&
          candidateText.trim() !== ""
        ) {
          return candidateText;
        }
      }
    }
  }

  throw new Error(
    `OpenAI response shape mismatch during ${stepName}: no assistant text output found.`,
  );
}

function getOpenAiUsage(response: unknown): EvalUsage | null {
  if (
    typeof response !== "object" ||
    response === null ||
    "usage" in response === false ||
    typeof response.usage !== "object" ||
    response.usage === null
  ) {
    return null;
  }

  const usage = response.usage as Record<string, unknown>;

  return {
    input_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
    output_tokens:
      typeof usage.output_tokens === "number" ? usage.output_tokens : null,
    total_tokens: typeof usage.total_tokens === "number" ? usage.total_tokens : null,
  };
}

function getGeminiText(response: unknown, stepName: string) {
  if (
    typeof response !== "object" ||
    response === null ||
    "candidates" in response === false ||
    Array.isArray(response.candidates) === false
  ) {
    throw new Error(`Gemini response shape mismatch during ${stepName}.`);
  }

  const firstCandidate = response.candidates[0];

  if (
    firstCandidate == null ||
    typeof firstCandidate !== "object" ||
    typeof firstCandidate.content !== "object" ||
    firstCandidate.content === null ||
    Array.isArray(firstCandidate.content.parts) === false
  ) {
    throw new Error(`Gemini response is missing candidate content during ${stepName}.`);
  }

  const parts = firstCandidate.content.parts as Array<Record<string, unknown>>;
  const text = parts
    .map((part: Record<string, unknown>) =>
      part != null && typeof part === "object" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("")
    .trim();

  if (text === "") {
    throw new Error(`Gemini returned empty candidate text during ${stepName}.`);
  }

  return text;
}

function getGeminiUsage(response: unknown): EvalUsage | null {
  if (
    typeof response !== "object" ||
    response === null ||
    "usageMetadata" in response === false ||
    typeof response.usageMetadata !== "object" ||
    response.usageMetadata === null
  ) {
    return null;
  }

  const usage = response.usageMetadata as Record<string, unknown>;

  return {
    input_tokens:
      typeof usage.promptTokenCount === "number"
        ? usage.promptTokenCount
        : null,
    output_tokens:
      typeof usage.candidatesTokenCount === "number"
        ? usage.candidatesTokenCount
        : null,
    total_tokens:
      typeof usage.totalTokenCount === "number"
        ? usage.totalTokenCount
        : null,
  };
}

function getGeminiFinishReason(response: unknown) {
  if (
    typeof response !== "object" ||
    response === null ||
    "candidates" in response === false ||
    Array.isArray(response.candidates) === false
  ) {
    return null;
  }

  const firstCandidate = response.candidates[0];

  if (
    firstCandidate == null ||
    typeof firstCandidate !== "object" ||
    typeof firstCandidate.finishReason !== "string"
  ) {
    return null;
  }

  return firstCandidate.finishReason;
}

function getAnthropicText(response: unknown, stepName: string) {
  if (
    typeof response !== "object" ||
    response === null ||
    "content" in response === false ||
    Array.isArray(response.content) === false
  ) {
    throw new Error(`Anthropic response shape mismatch during ${stepName}.`);
  }

  const text = response.content
    .map((item) =>
      item != null && typeof item === "object" && item.type === "text"
        ? typeof item.text === "string"
          ? item.text
          : ""
        : "",
    )
    .join("")
    .trim();

  if (text === "") {
    throw new Error(`Anthropic returned empty text during ${stepName}.`);
  }

  return text;
}

function getAnthropicUsage(response: unknown): EvalUsage | null {
  if (
    typeof response !== "object" ||
    response === null ||
    "usage" in response === false ||
    typeof response.usage !== "object" ||
    response.usage === null
  ) {
    return null;
  }

  const usage = response.usage as Record<string, unknown>;

  return {
    input_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
    output_tokens:
      typeof usage.output_tokens === "number" ? usage.output_tokens : null,
    total_tokens:
      typeof usage.input_tokens === "number" &&
      typeof usage.output_tokens === "number"
        ? usage.input_tokens + usage.output_tokens
        : null,
  };
}

function getAnthropicStopReason(response: unknown) {
  if (typeof response !== "object" || response === null) {
    return null;
  }

  const message = response as Record<string, unknown>;

  return typeof message.stop_reason === "string" ? message.stop_reason : null;
}

function getDeepSeekText(response: unknown, stepName: string) {
  if (
    typeof response !== "object" ||
    response === null ||
    "choices" in response === false ||
    Array.isArray(response.choices) === false
  ) {
    throw new Error(`DeepSeek response shape mismatch during ${stepName}.`);
  }

  const firstChoice = response.choices[0];

  if (
    firstChoice == null ||
    typeof firstChoice !== "object" ||
    typeof firstChoice.message !== "object" ||
    firstChoice.message === null ||
    typeof firstChoice.message.content !== "string"
  ) {
    throw new Error(`DeepSeek response is missing assistant content during ${stepName}.`);
  }

  const text = firstChoice.message.content.trim();

  if (text === "") {
    throw new Error(`DeepSeek returned empty text during ${stepName}.`);
  }

  return text;
}

function getDeepSeekUsage(response: unknown): EvalUsage | null {
  if (
    typeof response !== "object" ||
    response === null ||
    "usage" in response === false ||
    typeof response.usage !== "object" ||
    response.usage === null
  ) {
    return null;
  }

  const usage = response.usage as Record<string, unknown>;

  return {
    input_tokens:
      typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : null,
    output_tokens:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : null,
    total_tokens:
      typeof usage.total_tokens === "number"
        ? usage.total_tokens
        : null,
  };
}

async function callOpenAi(input: GenerateStructuredEvalInput) {
  const apiKey = getProviderApiKey("openai");

  if (apiKey == null || apiKey === "") {
    throw new Error(getMissingApiKeyMessage("openai"));
  }

  const { body, latencyMs } = await fetchJsonWithTiming(
    OPENAI_BASE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: input.systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: input.userPrompt }],
          },
        ],
        max_output_tokens: input.maxOutputTokens ?? 1200,
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            strict: true,
            schema: sanitizeJsonSchema(input.schema),
          },
        },
      }),
    },
    input.stepName,
  );

  const rawText = getOpenAiText(body, input.stepName);
  const usage = getOpenAiUsage(body);

  return {
    rawText,
    parsedJson: parseJsonText(rawText, input.stepName),
    usage,
    latencyMs,
    estimatedCostUsd: estimateCostUsd(input.model, usage),
  };
}

async function callGemini(input: GenerateStructuredEvalInput) {
  const apiKey = getProviderApiKey("gemini");

  if (apiKey == null || apiKey === "") {
    throw new Error(getMissingApiKeyMessage("gemini"));
  }

  const geminiApiKey = apiKey;

  async function runGeminiAttempt(maxOutputTokens: number) {
    const { body, latencyMs } = await fetchJsonWithTiming(
      `${GEMINI_BASE_URL}/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: input.systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: input.userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: sanitizeJsonSchema(input.schema),
            maxOutputTokens,
          },
        }),
      },
      input.stepName,
    );

    return {
      body,
      latencyMs,
      usage: getGeminiUsage(body),
      finishReason: getGeminiFinishReason(body),
      rawText: getGeminiText(body, input.stepName),
    };
  }

  const initialMaxOutputTokens = input.maxOutputTokens ?? 1200;
  const firstAttempt = await runGeminiAttempt(initialMaxOutputTokens);

  try {
    const parsedJson = parseJsonText(firstAttempt.rawText, input.stepName);

    return {
      rawText: firstAttempt.rawText,
      parsedJson,
      usage: firstAttempt.usage,
      latencyMs: firstAttempt.latencyMs,
      estimatedCostUsd: estimateCostUsd(input.model, firstAttempt.usage),
    };
  } catch (error) {
    const retryMaxOutputTokens = getRetryMaxOutputTokens(initialMaxOutputTokens);
    const shouldRetry =
      retryMaxOutputTokens > initialMaxOutputTokens &&
      (firstAttempt.finishReason === "MAX_TOKENS" ||
        looksLikeTruncatedJson(firstAttempt.rawText));

    if (shouldRetry) {
      const retryAttempt = await runGeminiAttempt(retryMaxOutputTokens);

      try {
        const parsedJson = parseJsonText(retryAttempt.rawText, input.stepName);
        const mergedUsage = mergeUsage([firstAttempt.usage, retryAttempt.usage]);

        return {
          rawText: retryAttempt.rawText,
          parsedJson,
          usage: mergedUsage,
          latencyMs: firstAttempt.latencyMs + retryAttempt.latencyMs,
          estimatedCostUsd: estimateCostUsd(input.model, mergedUsage),
        };
      } catch (retryError) {
        const baseMessage =
          retryError instanceof Error ? retryError.message : "Gemini JSON parsing failed.";

        throw new Error(
          `${baseMessage}${getTruncationHint(
            retryAttempt.finishReason,
            retryAttempt.rawText,
          )} Retried once with a higher max output token budget.`,
        );
      }
    }

    const baseMessage =
      error instanceof Error ? error.message : "Gemini JSON parsing failed.";

    throw new Error(
      `${baseMessage}${getTruncationHint(firstAttempt.finishReason, firstAttempt.rawText)}`,
    );
  }
}

async function callAnthropic(input: GenerateStructuredEvalInput) {
  const apiKey = getProviderApiKey("anthropic");

  if (apiKey == null || apiKey === "") {
    throw new Error(getMissingApiKeyMessage("anthropic"));
  }

  const anthropicApiKey = apiKey;

  async function runAnthropicAttempt(maxOutputTokens: number) {
    const { body, latencyMs } = await fetchJsonWithTiming(
      ANTHROPIC_BASE_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: maxOutputTokens,
          system: input.systemPrompt,
          messages: [
            {
              role: "user",
              content: input.userPrompt,
            },
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: sanitizeJsonSchema(input.schema),
            },
          },
        }),
      },
      input.stepName,
    );

    return {
      body,
      latencyMs,
      usage: getAnthropicUsage(body),
      stopReason: getAnthropicStopReason(body),
      rawText: getAnthropicText(body, input.stepName),
    };
  }

  const initialMaxOutputTokens = input.maxOutputTokens ?? 1200;
  const firstAttempt = await runAnthropicAttempt(initialMaxOutputTokens);

  try {
    const parsedJson = parseJsonText(firstAttempt.rawText, input.stepName);

    return {
      rawText: firstAttempt.rawText,
      parsedJson,
      usage: firstAttempt.usage,
      latencyMs: firstAttempt.latencyMs,
      estimatedCostUsd: estimateCostUsd(input.model, firstAttempt.usage),
    };
  } catch (error) {
    const retryMaxOutputTokens = getRetryMaxOutputTokens(initialMaxOutputTokens);
    const shouldRetry =
      retryMaxOutputTokens > initialMaxOutputTokens &&
      (firstAttempt.stopReason === "max_tokens" ||
        looksLikeTruncatedJson(firstAttempt.rawText));

    if (shouldRetry) {
      const retryAttempt = await runAnthropicAttempt(retryMaxOutputTokens);

      try {
        const parsedJson = parseJsonText(retryAttempt.rawText, input.stepName);
        const mergedUsage = mergeUsage([firstAttempt.usage, retryAttempt.usage]);

        return {
          rawText: retryAttempt.rawText,
          parsedJson,
          usage: mergedUsage,
          latencyMs: firstAttempt.latencyMs + retryAttempt.latencyMs,
          estimatedCostUsd: estimateCostUsd(input.model, mergedUsage),
        };
      } catch (retryError) {
        const baseMessage =
          retryError instanceof Error
            ? retryError.message
            : "Anthropic JSON parsing failed.";

        throw new Error(
          `${baseMessage}${getTruncationHint(
            retryAttempt.stopReason,
            retryAttempt.rawText,
          )} Retried once with a higher max output token budget.`,
        );
      }
    }

    const baseMessage =
      error instanceof Error ? error.message : "Anthropic JSON parsing failed.";

    throw new Error(
      `${baseMessage}${getTruncationHint(firstAttempt.stopReason, firstAttempt.rawText)}`,
    );
  }
}

async function callDeepSeek(input: GenerateStructuredEvalInput) {
  const apiKey = getProviderApiKey("deepseek");

  if (apiKey == null || apiKey === "") {
    throw new Error(getMissingApiKeyMessage("deepseek"));
  }

  const { body, latencyMs } = await fetchJsonWithTiming(
    DEEPSEEK_BASE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content: `${input.systemPrompt}\n\nReturn valid JSON only. Match the requested schema exactly.\n\nJSON schema:\n${JSON.stringify(
              sanitizeJsonSchema(input.schema),
              null,
              2,
            )}`,
          },
          {
            role: "user",
            content: input.userPrompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        max_tokens: input.maxOutputTokens ?? 1200,
      }),
    },
    input.stepName,
  );

  const rawText = getDeepSeekText(body, input.stepName);
  const usage = getDeepSeekUsage(body);

  return {
    rawText,
    parsedJson: parseJsonText(rawText, input.stepName),
    usage,
    latencyMs,
    estimatedCostUsd: estimateCostUsd(input.model, usage),
  };
}

export async function generateStructuredEvalOutput(
  input: GenerateStructuredEvalInput,
): Promise<EvalProviderResult> {
  if (input.provider === "openai") {
    return callOpenAi(input);
  }

  if (input.provider === "gemini") {
    return callGemini(input);
  }

  if (input.provider === "anthropic") {
    return callAnthropic(input);
  }

  return callDeepSeek(input);
}
