import { toJSONSchema } from "zod";

import { buildAstrologyContext } from "@/domain/astrology/context";
import { synthesisSystemPrompt } from "@/domain/astrology/prompts";
import {
  DailyBriefingInputSchema,
  FinalSynthesisOutputSchema,
  TimingOutputSchema,
  WesternOutputSchema,
  type DailyBriefingInput,
  type FinalSynthesisOutput,
  type TimingOutput,
  type WesternOutput,
} from "@/domain/astrology/schemas";
import {
  buildSynthesisAgentRequest,
  validateFinalSynthesisOutput,
} from "@/domain/astrology/synthesis.agent";
import {
  buildTimingAgentRequest,
  validateTimingOutput,
} from "@/domain/astrology/timing.agent";
import {
  buildWesternAgentRequest,
  validateWesternOutput,
} from "@/domain/astrology/western.agent";
import { buildWesternModalitySignal } from "@/domain/astrology/western.modality";
import { buildBaziContext } from "@/domain/bazi/context.server";
import {
  buildChineseAstrologyContext,
  buildChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import {
  formatModelComparisonHtmlDocument,
  formatModelComparisonDocument,
  renderBlueprintEvalPreview,
  renderDailyEvalPreview,
} from "@/domain/evals/model-comparison.formatter";
import {
  CandidateModelSchema,
  BlueprintJudgeOutputSchema,
  ComparisonReportTypeSchema,
  DailyJudgeOutputSchema,
  type CandidateModel,
  type ComparisonCandidateResult,
  type ComparisonDocumentData,
  type ComparisonModelConfig,
  type ComparisonScorerResult,
  type ComparisonStageResult,
  type ComparisonReportType,
  type ScorerModelConfig,
} from "@/domain/evals/model-comparison.types";
import {
  buildBlueprintAgentRequest,
  validateBlueprintOutput,
} from "@/domain/blueprint/blueprint.agent";
import { BlueprintSchema, type Blueprint } from "@/domain/blueprint/blueprint.types";
import { buildHumanDesignContext } from "@/domain/human_design/context";
import { buildNumerologyContext } from "@/domain/numerology/context";
import { buildNumerologySignal } from "@/domain/numerology/numerology.agent";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import {
  fetchFreeAstroChineseToday,
  fetchFreeAstroPanchang,
  getFreeAstroLimitation,
  hasFreeAstroApiKey,
  type FreeAstroDailyContext,
} from "@/lib/freeastroapi.server";
import {
  generateStructuredEvalOutput,
  type EvalUsage,
} from "@/lib/eval-providers";
import { isSupportedTimeZone } from "@/lib/timezones";

const DAILY_WESTERN_MAX_OUTPUT_TOKENS = 1400;
const DAILY_TIMING_MAX_OUTPUT_TOKENS = 900;
const DAILY_SYNTHESIS_MAX_OUTPUT_TOKENS = 1600;
const BLUEPRINT_MAX_OUTPUT_TOKENS = 2200;
const SCORER_MAX_OUTPUT_TOKENS = 4200;

export const COMPARISON_MODELS: ComparisonModelConfig[] = [
  { provider: "openai", model: "gpt-5.4", enabled: true },
  { provider: "anthropic", model: "claude-opus-4-6", enabled: true },
  { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true },
];

export const SCORER_MODELS: ScorerModelConfig[] = [
  { provider: "openai", model: "gpt-5.4", enabled: true },
  { provider: "gemini", model: "gemini-3.1-pro-preview", enabled: true },
];

function getDateContext(timezone: string) {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);

  return { date, weekday };
}

function getDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

async function buildFreeAstroDailyContext(params: {
  date: string;
  currentTimezone: string | null;
  birthTimezone: string | null;
  birthLatitude: number | null;
  birthLongitude: number | null;
}): Promise<FreeAstroDailyContext> {
  const notes: string[] = [];
  const limitations: FreeAstroDailyContext["limitations"] = [];

  if (hasFreeAstroApiKey() === false) {
    return {
      chinese_current_pillars: null,
      vedic_panchang: null,
      notes: [],
      limitations: [
        {
          endpoint: "configuration",
          status_code: null,
          detail:
            "FREEASTROAPI_API_KEY is not configured, so Daily FreeAstro enrichments were skipped.",
          retried: false,
        },
      ],
    };
  }

  const chineseTodayPromise = fetchFreeAstroChineseToday();
  const panchangTimezone =
    params.currentTimezone?.trim() ||
    params.birthTimezone?.trim() ||
    "AUTO";
  const panchangPromise =
    params.birthLatitude == null || params.birthLongitude == null
      ? Promise.resolve(null)
      : fetchFreeAstroPanchang({
          ...getDateParts(params.date),
          lat: params.birthLatitude,
          lng: params.birthLongitude,
          city: null,
          tzStr: panchangTimezone,
        });

  const [chineseTodayResult, panchangResult] = await Promise.allSettled([
    chineseTodayPromise,
    panchangPromise,
  ]);

  const chineseCurrentPillars =
    chineseTodayResult.status === "fulfilled" ? chineseTodayResult.value : null;
  const vedicPanchang =
    panchangResult.status === "fulfilled" ? panchangResult.value : null;

  if (chineseTodayResult.status === "rejected") {
    limitations.push(
      getFreeAstroLimitation(chineseTodayResult.reason, {
        endpoint: "/api/v1/chinese/today",
        detail: "Chinese Current Pillars could not be loaded from FreeAstroAPI.",
      }),
    );
  } else {
    notes.push(
      "Chinese Current Pillars is based on UTC time from FreeAstroAPI and is used as secondary daily timing context only.",
    );
  }

  if (params.birthLatitude == null || params.birthLongitude == null) {
    notes.push(
      "Vedic Panchang was skipped because the app does not have current coordinates and no birthplace coordinates are available as a fallback.",
    );
  } else if (panchangResult.status === "rejected") {
    limitations.push(
      getFreeAstroLimitation(panchangResult.reason, {
        endpoint: "/api/v1/vedic/panchang",
        detail: "Vedic Panchang could not be loaded from FreeAstroAPI.",
      }),
    );
  } else {
    notes.push(
      `Vedic Panchang timing labels are aligned to ${
        panchangTimezone === "AUTO" ? "automatic timezone detection" : panchangTimezone
      }. Because the MVP does not store current coordinates yet, the location calculation falls back to birthplace coordinates.`,
    );
  }

  return {
    chinese_current_pillars: chineseCurrentPillars,
    vedic_panchang: vedicPanchang,
    notes,
    limitations,
  };
}

function buildStageErrorResult(params: {
  stage: ComparisonStageResult["stage"];
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  error: string;
}): ComparisonStageResult {
  return {
    stage: params.stage,
    schemaName: params.schemaName,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    rawText: null,
    parsedJson: null,
    validatedOutput: null,
    validationError: null,
    latencyMs: null,
    usage: null,
    estimatedCostUsd: null,
    error: params.error,
  };
}

function aggregateUsage(stages: ComparisonStageResult[]): EvalUsage | null {
  const usageStages = stages.filter((stage) => stage.usage !== null);

  if (usageStages.length === 0) {
    return null;
  }

  const inputTotal = usageStages.reduce(
    (sum, stage) => sum + (stage.usage?.input_tokens ?? 0),
    0,
  );
  const outputTotal = usageStages.reduce(
    (sum, stage) => sum + (stage.usage?.output_tokens ?? 0),
    0,
  );
  const totalTotal = usageStages.reduce(
    (sum, stage) => sum + (stage.usage?.total_tokens ?? 0),
    0,
  );

  return {
    input_tokens: inputTotal,
    output_tokens: outputTotal,
    total_tokens: totalTotal,
  };
}

function aggregateLatency(stages: ComparisonStageResult[]) {
  const latencies = stages
    .map((stage) => stage.latencyMs)
    .filter((value): value is number => value != null);

  if (latencies.length === 0) {
    return null;
  }

  return latencies.reduce((sum, value) => sum + value, 0);
}

function aggregateCost(stages: ComparisonStageResult[]) {
  const costs = stages
    .map((stage) => stage.estimatedCostUsd)
    .filter((value): value is number => value != null);

  if (costs.length === 0) {
    return null;
  }

  return Number(costs.reduce((sum, value) => sum + value, 0).toFixed(6));
}

function getRubricLines(reportType: ComparisonReportType) {
  if (reportType === "daily") {
    return [
      "Personalization (1-5): feels tailored to the user, not generic.",
      "Specificity (1-5): concrete and non-vague.",
      "Readability (1-5): easy to read in plain English.",
      "Timing usefulness (1-5): helps with today-level pacing and decisions.",
      "Emotional tone (1-5): grounded, human, and not melodramatic.",
      "Premium feel (1-5): feels polished and worth paying for.",
    ];
  }

  return [
    "Personalization (1-5): feels tailored to the user, not generic.",
    "Coherence across modalities (1-5): modalities work together instead of colliding.",
    "Distinctiveness (1-5): sounds specific to this person.",
    "Clarity for English speakers (1-5): jargon is readable and explained well.",
    "Practical usefulness (1-5): helps the user understand how they operate.",
    "Premium feel (1-5): feels polished and worth paying for.",
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function normalizeConfidenceLike(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "low" || normalized === "medium" || normalized === "high"
    ? normalized
    : null;
}

function normalize24HourHorizon(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.includes("24") ? "24h" : null;
}

function normalizeCandidateModelName(value: unknown): CandidateModel | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const exactCandidate = CandidateModelSchema.options.find(
    (candidate) => candidate.toLowerCase() === normalized,
  );

  if (exactCandidate != null) {
    return exactCandidate;
  }

  const providerQualifiedCandidate = COMPARISON_MODELS.find(
    (candidate) => `${candidate.provider}:${candidate.model}`.toLowerCase() === normalized,
  );

  return providerQualifiedCandidate?.model ?? null;
}

function normalizeWesternEvalOutput(value: unknown): unknown {
  if (isRecord(value) === false) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };

  if (typeof normalized.source === "string") {
    const source = normalized.source.trim().toLowerCase();

    if (source.includes("western")) {
      normalized.source = "western";
    }
  }

  const confidence = normalizeConfidenceLike(normalized.confidence);
  if (confidence != null) {
    normalized.confidence = confidence;
  }

  if (isRecord(normalized.energy)) {
    const energy = { ...normalized.energy };
    const level = normalizeConfidenceLike(energy.level);

    if (level != null) {
      energy.level = level;
    }

    normalized.energy = energy;
  }

  if (isRecord(normalized.micro_claim)) {
    const microClaim = { ...normalized.micro_claim };
    const horizon = normalize24HourHorizon(microClaim.horizon);

    if (horizon != null) {
      microClaim.horizon = horizon;
    }

    normalized.micro_claim = microClaim;
  }

  return normalized;
}

function normalizeTimingEvalOutput(value: unknown): unknown {
  if (isRecord(value) === false) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };

  if (typeof normalized.source === "string") {
    const source = normalized.source.trim().toLowerCase();

    if (source.includes("timing")) {
      normalized.source = "timing";
    }
  }

  const confidence = normalizeConfidenceLike(normalized.confidence);
  if (confidence != null) {
    normalized.confidence = confidence;
  }

  if (isRecord(normalized.money_risk)) {
    const moneyRisk = { ...normalized.money_risk };
    const riskLevel = normalizeConfidenceLike(moneyRisk.risk_level);

    if (riskLevel != null) {
      moneyRisk.risk_level = riskLevel;
    }

    normalized.money_risk = moneyRisk;
  }

  return normalized;
}

function normalizeDailySynthesisEvalOutput(value: unknown): unknown {
  if (isRecord(value) === false) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  const confidence = normalizeConfidenceLike(normalized.confidence);

  if (confidence != null) {
    normalized.confidence = confidence;
  }

  if (isRecord(normalized.cards)) {
    const cards = { ...normalized.cards };

    if (isRecord(cards.money)) {
      const money = { ...cards.money };
      const riskLevel = normalizeConfidenceLike(money.risk_level);

      if (riskLevel != null) {
        money.risk_level = riskLevel;
      }

      cards.money = money;
    }

    normalized.cards = cards;
  }

  if (isRecord(normalized.micro_claim)) {
    const microClaim = { ...normalized.micro_claim };
    const horizon = normalize24HourHorizon(microClaim.horizon);

    if (horizon != null) {
      microClaim.horizon = horizon;
    }

    normalized.micro_claim = microClaim;
  }

  return normalized;
}

function normalizeJudgeEvalOutput(value: unknown): unknown {
  if (isRecord(value) === false) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  const strongestModel = normalizeCandidateModelName(normalized.strongest_model);

  if (strongestModel != null) {
    normalized.strongest_model = strongestModel;
  }

  if (Array.isArray(normalized.candidates)) {
    normalized.candidates = normalized.candidates.map((candidate) => {
      if (isRecord(candidate) === false) {
        return candidate;
      }

      const normalizedModel = normalizeCandidateModelName(candidate.model);

      return normalizedModel == null
        ? candidate
        : {
            ...candidate,
            model: normalizedModel,
          };
    });
  }

  return normalized;
}

async function runWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  limit: number,
  worker: (item: TInput) => Promise<TOutput>,
) {
  const results: TOutput[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );

  return results;
}

function applyBlueprintProductionOverrides(params: {
  blueprint: Blueprint;
  baziContext: Awaited<ReturnType<typeof buildBaziContext>>;
  humanDesignContext: ReturnType<typeof buildHumanDesignContext>;
}) {
  return {
    ...params.blueprint,
    bazi_signature:
      params.baziContext.chart === null
        ? {
            day_master: "unavailable",
            year_pillar: "unavailable",
            month_pillar: "unavailable",
            day_pillar: "unavailable",
            hour_pillar: "unavailable",
          }
        : {
            day_master: params.baziContext.chart.day_master,
            year_pillar: params.baziContext.chart.year_pillar,
            month_pillar: params.baziContext.chart.month_pillar,
            day_pillar: params.baziContext.chart.day_pillar,
            hour_pillar: params.baziContext.chart.hour_pillar,
          },
    human_design_signature:
      params.humanDesignContext.chart === null
        ? {
            type: "unavailable",
            authority: "unavailable",
            profile: "unavailable",
          }
        : {
            type: params.humanDesignContext.chart.type,
            authority: params.humanDesignContext.chart.authority,
            profile: params.humanDesignContext.chart.profile,
          },
  } satisfies Blueprint;
}

async function buildDailyRunContext(userId: string, userEmail: string | null) {
  const record = await getOnboardingRecord(userId);

  if (isOnboardingComplete(record) === false) {
    throw new Error("Onboarding is incomplete. Complete onboarding before running evals.");
  }

  const timezone = record.profile?.timezone;
  const birthDate = record.birthData?.birth_date;
  const birthTimeConfidence = record.birthData?.birth_time_confidence;
  const birthCity = record.birthData?.birth_city;
  const birthCountry = record.birthData?.birth_country;

  if (
    timezone == null ||
    birthDate == null ||
    birthTimeConfidence == null ||
    birthCity == null ||
    birthCountry == null
  ) {
    throw new Error("Onboarding data is missing required Daily eval fields.");
  }

  if (isSupportedTimeZone(timezone) === false) {
    throw new Error(
      "Your saved current timezone is invalid. Update it in onboarding using a timezone like Europe/Madrid.",
    );
  }

  const { date, weekday } = getDateContext(timezone);
  const briefingInput: DailyBriefingInput = DailyBriefingInputSchema.parse({
    display_name:
      record.profile?.display_name?.trim() ||
      userEmail ||
      "Astrologer On Demand user",
    birth_date: birthDate,
    birth_time: record.birthData?.birth_time ?? null,
    birth_time_confidence: birthTimeConfidence,
    birth_city: birthCity,
    birth_country: birthCountry,
    timezone,
    tone_preference: record.profile?.tone_preference ?? "grounded",
    date,
    weekday,
  });
  const astrologyContext = buildAstrologyContext({
    ...briefingInput,
    birth_latitude: record.birthData?.birth_latitude ?? null,
    birth_longitude: record.birthData?.birth_longitude ?? null,
    birth_timezone: record.birthData?.birth_timezone ?? null,
  });
  const { context: numerologyContext, signal: numerologySignal } =
    buildNumerologySignal({
      birth_date: briefingInput.birth_date,
      date: briefingInput.date,
      full_birth_name_for_numerology:
        record.birthData?.full_birth_name_for_numerology ?? null,
    });
  const freeAstroDailyContext = await buildFreeAstroDailyContext({
    date: briefingInput.date,
    currentTimezone: record.profile?.timezone ?? null,
    birthTimezone: record.birthData?.birth_timezone ?? null,
    birthLatitude: record.birthData?.birth_latitude ?? null,
    birthLongitude: record.birthData?.birth_longitude ?? null,
  });

  const westernRequest = buildWesternAgentRequest(briefingInput, astrologyContext);
  const timingRequest = buildTimingAgentRequest(
    briefingInput,
    astrologyContext,
    freeAstroDailyContext,
  );

  return {
    briefingInput,
    astrologyContext,
    numerologyContext,
    numerologySignal,
    freeAstroDailyContext,
    westernRequest,
    timingRequest,
    normalizedInputPacket: {
      briefing_input: briefingInput,
      astrology_context: astrologyContext,
      numerology_context: numerologyContext,
      numerology_signal: numerologySignal,
      freeastro_daily_context: freeAstroDailyContext,
    },
    gatingNotes: [
      ...astrologyContext.daily_context.limitations,
      ...numerologyContext.limitations,
      ...freeAstroDailyContext.notes,
      ...freeAstroDailyContext.limitations.map(
        (item) =>
          `${item.endpoint}: ${item.detail}${
            item.status_code == null ? "" : ` (status ${item.status_code})`
          }${item.retried ? ", retried once" : ""}`,
      ),
    ],
    sharedPromptContext: [
      {
        label: "Western step",
        systemPrompt: westernRequest.systemPrompt,
        userPrompt: westernRequest.userPrompt,
      },
      {
        label: "Timing step",
        systemPrompt: timingRequest.systemPrompt,
        userPrompt: timingRequest.userPrompt,
      },
      {
        label: "Synthesis step",
        systemPrompt: synthesisSystemPrompt(briefingInput),
        userPrompt: null,
        note:
          "The synthesis user prompt varies by model because it includes that model's Western and Timing JSON outputs. Those stage outputs are recorded per model below.",
      },
    ],
  };
}

async function buildBlueprintRunContext(userId: string, userEmail: string | null) {
  const record = await getOnboardingRecord(userId);

  if (isOnboardingComplete(record) === false) {
    throw new Error("Onboarding is incomplete. Complete onboarding before running evals.");
  }

  const timezone = record.profile?.timezone;
  const birthDate = record.birthData?.birth_date;
  const birthTimeConfidence = record.birthData?.birth_time_confidence;
  const birthCity = record.birthData?.birth_city;
  const birthCountry = record.birthData?.birth_country;

  if (
    timezone == null ||
    birthDate == null ||
    birthTimeConfidence == null ||
    birthCity == null ||
    birthCountry == null
  ) {
    throw new Error("Onboarding data is missing required Blueprint eval fields.");
  }

  if (isSupportedTimeZone(timezone) === false) {
    throw new Error(
      "Your saved current timezone is invalid. Update it in onboarding using a timezone like Europe/Madrid.",
    );
  }

  const { date, weekday } = getDateContext(timezone);
  const briefingInput: DailyBriefingInput = DailyBriefingInputSchema.parse({
    display_name:
      record.profile?.display_name?.trim() ||
      userEmail ||
      "Astrologer On Demand user",
    birth_date: birthDate,
    birth_time: record.birthData?.birth_time ?? null,
    birth_time_confidence: birthTimeConfidence,
    birth_city: birthCity,
    birth_country: birthCountry,
    timezone,
    tone_preference: record.profile?.tone_preference ?? "grounded",
    date,
    weekday,
  });

  const astrologyContext = buildAstrologyContext({
    ...briefingInput,
    birth_latitude: record.birthData?.birth_latitude ?? null,
    birth_longitude: record.birthData?.birth_longitude ?? null,
    birth_timezone: record.birthData?.birth_timezone ?? null,
  });
  const numerologyContext = buildNumerologyContext({
    birth_date: briefingInput.birth_date,
    date: briefingInput.date,
    full_birth_name_for_numerology:
      record.birthData?.full_birth_name_for_numerology ?? null,
  });
  const chineseAstrologyContext = buildChineseAstrologyContext({
    birth_date: briefingInput.birth_date,
  });
  const chineseAstrologySignal =
    buildChineseAstrologySignal(chineseAstrologyContext);
  const baziContext = await buildBaziContext({
    birth_date: record.birthData?.birth_date,
    birth_time: record.birthData?.birth_time,
    birth_time_confidence: record.birthData?.birth_time_confidence,
    birth_city: record.birthData?.birth_city,
    birth_latitude: record.birthData?.birth_latitude ?? null,
    birth_longitude: record.birthData?.birth_longitude ?? null,
    bazi_calculation_marker: record.birthData?.bazi_calculation_marker ?? null,
  });
  const humanDesignContext = buildHumanDesignContext({
    birth_date: record.birthData?.birth_date,
    birth_time: record.birthData?.birth_time,
    birth_time_confidence: record.birthData?.birth_time_confidence,
    birth_latitude: record.birthData?.birth_latitude ?? null,
    birth_longitude: record.birthData?.birth_longitude ?? null,
    birth_timezone: record.birthData?.birth_timezone ?? null,
  });

  const blueprintRequest = buildBlueprintAgentRequest({
    briefingInput,
    astrologyContext,
    numerologyContext,
    chineseAstrologyContext,
    chineseAstrologySignal,
    baziContext,
    humanDesignContext,
  });

  let normalizedInputPacket: Record<string, unknown>;

  try {
    normalizedInputPacket = JSON.parse(blueprintRequest.userPrompt) as Record<
      string,
      unknown
    >;
  } catch {
    normalizedInputPacket = {
      prompt_payload_parse_error: true,
    };
  }

  return {
    blueprintRequest,
    baziContext,
    humanDesignContext,
    normalizedInputPacket,
    gatingNotes: [
      ...numerologyContext.limitations,
      ...baziContext.limitations,
      ...humanDesignContext.limitations,
    ],
    sharedPromptContext: [
      {
        label: "Blueprint generation",
        systemPrompt: blueprintRequest.systemPrompt,
        userPrompt: blueprintRequest.userPrompt,
      },
    ],
  };
}

async function runDailyCandidate(
  modelConfig: ComparisonModelConfig,
  runContext: Awaited<ReturnType<typeof buildDailyRunContext>>,
): Promise<ComparisonCandidateResult> {
  const stages: ComparisonStageResult[] = [];
  let westernOutput: WesternOutput | null = null;
  let timingOutput: TimingOutput | null = null;

  try {
    const westernResult = await generateStructuredEvalOutput({
      provider: modelConfig.provider,
      model: modelConfig.model,
      systemPrompt: runContext.westernRequest.systemPrompt,
      userPrompt: runContext.westernRequest.userPrompt,
      schemaName: "WesternOutput",
      schema: toJSONSchema(WesternOutputSchema),
      maxOutputTokens: DAILY_WESTERN_MAX_OUTPUT_TOKENS,
      stepName: `${modelConfig.model} western comparison`,
    });

    let validationError: string | null = null;
    const normalizedParsedJson = normalizeWesternEvalOutput(westernResult.parsedJson);

    try {
      westernOutput = validateWesternOutput(normalizedParsedJson);
    } catch (error) {
      validationError =
        error instanceof Error ? error.message : "Western validation failed.";
    }

    stages.push({
      stage: "western",
      schemaName: "WesternOutput",
      systemPrompt: runContext.westernRequest.systemPrompt,
      userPrompt: runContext.westernRequest.userPrompt,
      rawText: westernResult.rawText,
      parsedJson: normalizedParsedJson,
      validatedOutput: westernOutput,
      validationError,
      latencyMs: westernResult.latencyMs,
      usage: westernResult.usage,
      estimatedCostUsd: westernResult.estimatedCostUsd,
      error: null,
    });
  } catch (error) {
    stages.push(
      buildStageErrorResult({
        stage: "western",
        schemaName: "WesternOutput",
        systemPrompt: runContext.westernRequest.systemPrompt,
        userPrompt: runContext.westernRequest.userPrompt,
        error: error instanceof Error ? error.message : "Western generation failed.",
      }),
    );
  }

  if (westernOutput === null) {
    return {
      provider: modelConfig.provider,
      model: modelConfig.model,
      status: "error",
      totalLatencyMs: aggregateLatency(stages),
      totalUsage: aggregateUsage(stages),
      totalEstimatedCostUsd: aggregateCost(stages),
      renderedPreview: null,
      finalOutput: null,
      stages,
      error: "Western step did not produce a valid output.",
    };
  }

  try {
    const timingResult = await generateStructuredEvalOutput({
      provider: modelConfig.provider,
      model: modelConfig.model,
      systemPrompt: runContext.timingRequest.systemPrompt,
      userPrompt: runContext.timingRequest.userPrompt,
      schemaName: "TimingOutput",
      schema: toJSONSchema(TimingOutputSchema),
      maxOutputTokens: DAILY_TIMING_MAX_OUTPUT_TOKENS,
      stepName: `${modelConfig.model} timing comparison`,
    });

    let validationError: string | null = null;
    const normalizedParsedJson = normalizeTimingEvalOutput(timingResult.parsedJson);

    try {
      timingOutput = validateTimingOutput(normalizedParsedJson);
    } catch (error) {
      validationError =
        error instanceof Error ? error.message : "Timing validation failed.";
    }

    stages.push({
      stage: "timing",
      schemaName: "TimingOutput",
      systemPrompt: runContext.timingRequest.systemPrompt,
      userPrompt: runContext.timingRequest.userPrompt,
      rawText: timingResult.rawText,
      parsedJson: normalizedParsedJson,
      validatedOutput: timingOutput,
      validationError,
      latencyMs: timingResult.latencyMs,
      usage: timingResult.usage,
      estimatedCostUsd: timingResult.estimatedCostUsd,
      error: null,
    });
  } catch (error) {
    stages.push(
      buildStageErrorResult({
        stage: "timing",
        schemaName: "TimingOutput",
        systemPrompt: runContext.timingRequest.systemPrompt,
        userPrompt: runContext.timingRequest.userPrompt,
        error: error instanceof Error ? error.message : "Timing generation failed.",
      }),
    );
  }

  if (timingOutput === null) {
    return {
      provider: modelConfig.provider,
      model: modelConfig.model,
      status: "error",
      totalLatencyMs: aggregateLatency(stages),
      totalUsage: aggregateUsage(stages),
      totalEstimatedCostUsd: aggregateCost(stages),
      renderedPreview: null,
      finalOutput: null,
      stages,
      error: "Timing step did not produce a valid output.",
    };
  }

  const synthesisRequest = buildSynthesisAgentRequest({
    briefingInput: runContext.briefingInput,
    astrologyContext: runContext.astrologyContext,
    numerologyContext: runContext.numerologyContext,
    numerologySignal: runContext.numerologySignal,
    freeAstroDailyContext: runContext.freeAstroDailyContext,
    westernModalitySignal: buildWesternModalitySignal(westernOutput),
    westernOutput,
    timingOutput,
  });

  let finalOutput: FinalSynthesisOutput | null = null;

  try {
    const synthesisResult = await generateStructuredEvalOutput({
      provider: modelConfig.provider,
      model: modelConfig.model,
      systemPrompt: synthesisRequest.systemPrompt,
      userPrompt: synthesisRequest.userPrompt,
      schemaName: "FinalSynthesisOutput",
      schema: toJSONSchema(FinalSynthesisOutputSchema),
      maxOutputTokens: DAILY_SYNTHESIS_MAX_OUTPUT_TOKENS,
      stepName: `${modelConfig.model} synthesis comparison`,
    });

    let validationError: string | null = null;
    const normalizedParsedJson = normalizeDailySynthesisEvalOutput(
      synthesisResult.parsedJson,
    );

    try {
      finalOutput = validateFinalSynthesisOutput(normalizedParsedJson);
    } catch (error) {
      validationError =
        error instanceof Error ? error.message : "Synthesis validation failed.";
    }

    stages.push({
      stage: "synthesis",
      schemaName: "FinalSynthesisOutput",
      systemPrompt: synthesisRequest.systemPrompt,
      userPrompt: synthesisRequest.userPrompt,
      rawText: synthesisResult.rawText,
      parsedJson: normalizedParsedJson,
      validatedOutput: finalOutput,
      validationError,
      latencyMs: synthesisResult.latencyMs,
      usage: synthesisResult.usage,
      estimatedCostUsd: synthesisResult.estimatedCostUsd,
      error: null,
    });
  } catch (error) {
    stages.push(
      buildStageErrorResult({
        stage: "synthesis",
        schemaName: "FinalSynthesisOutput",
        systemPrompt: synthesisRequest.systemPrompt,
        userPrompt: synthesisRequest.userPrompt,
        error:
          error instanceof Error ? error.message : "Synthesis generation failed.",
      }),
    );
  }

  return {
    provider: modelConfig.provider,
    model: modelConfig.model,
    status: finalOutput === null ? "partial" : "success",
    totalLatencyMs: aggregateLatency(stages),
    totalUsage: aggregateUsage(stages),
    totalEstimatedCostUsd: aggregateCost(stages),
    renderedPreview: finalOutput === null ? null : renderDailyEvalPreview(finalOutput),
    finalOutput,
    stages,
    error:
      finalOutput === null
        ? "Synthesis step did not produce a valid final Daily output."
        : null,
  };
}

async function runBlueprintCandidate(
  modelConfig: ComparisonModelConfig,
  runContext: Awaited<ReturnType<typeof buildBlueprintRunContext>>,
): Promise<ComparisonCandidateResult> {
  const stages: ComparisonStageResult[] = [];
  let blueprint: Blueprint | null = null;

  try {
    const blueprintResult = await generateStructuredEvalOutput({
      provider: modelConfig.provider,
      model: modelConfig.model,
      systemPrompt: runContext.blueprintRequest.systemPrompt,
      userPrompt: runContext.blueprintRequest.userPrompt,
      schemaName: "Blueprint",
      schema: toJSONSchema(BlueprintSchema),
      maxOutputTokens: BLUEPRINT_MAX_OUTPUT_TOKENS,
      stepName: `${modelConfig.model} blueprint comparison`,
    });

    let validationError: string | null = null;

    try {
      blueprint = applyBlueprintProductionOverrides({
        blueprint: validateBlueprintOutput(blueprintResult.parsedJson),
        baziContext: runContext.baziContext,
        humanDesignContext: runContext.humanDesignContext,
      });
    } catch (error) {
      validationError =
        error instanceof Error ? error.message : "Blueprint validation failed.";
    }

    stages.push({
      stage: "blueprint",
      schemaName: "Blueprint",
      systemPrompt: runContext.blueprintRequest.systemPrompt,
      userPrompt: runContext.blueprintRequest.userPrompt,
      rawText: blueprintResult.rawText,
      parsedJson: blueprintResult.parsedJson,
      validatedOutput: blueprint,
      validationError,
      latencyMs: blueprintResult.latencyMs,
      usage: blueprintResult.usage,
      estimatedCostUsd: blueprintResult.estimatedCostUsd,
      error: null,
    });
  } catch (error) {
    stages.push(
      buildStageErrorResult({
        stage: "blueprint",
        schemaName: "Blueprint",
        systemPrompt: runContext.blueprintRequest.systemPrompt,
        userPrompt: runContext.blueprintRequest.userPrompt,
        error:
          error instanceof Error ? error.message : "Blueprint generation failed.",
      }),
    );
  }

  return {
    provider: modelConfig.provider,
    model: modelConfig.model,
    status: blueprint === null ? "error" : "success",
    totalLatencyMs: aggregateLatency(stages),
    totalUsage: aggregateUsage(stages),
    totalEstimatedCostUsd: aggregateCost(stages),
    renderedPreview:
      blueprint === null ? null : renderBlueprintEvalPreview(blueprint),
    finalOutput: blueprint,
    stages,
    error: blueprint === null ? "Blueprint generation did not validate." : null,
  };
}

function buildScorerSystemPrompt(reportType: ComparisonReportType) {
  return [
    "Return exactly one JSON object and nothing else.",
    "You are scoring candidate outputs for an internal QA comparison.",
    "Use the rubric exactly as provided.",
    "Score each dimension from 1 to 5 using integers only.",
    "Judge the actual quality of the output, not the provider brand.",
    "High scores should be used sparingly.",
    "If outputs are close, say so in the overview instead of forcing a dramatic spread.",
    `Report type: ${reportType}.`,
  ].join("\n\n");
}

function buildScorerUserPrompt(params: {
  reportType: ComparisonReportType;
  rubricLines: string[];
  normalizedInputPacket: Record<string, unknown>;
  candidates: ComparisonCandidateResult[];
}) {
  return JSON.stringify(
    {
      report_type: params.reportType,
      rubric: params.rubricLines,
      normalized_input_packet: params.normalizedInputPacket,
      candidates: params.candidates
        .filter((candidate) => candidate.renderedPreview !== null)
        .map((candidate) => ({
          provider: candidate.provider,
          model: candidate.model,
          rendered_preview: candidate.renderedPreview,
        })),
    },
    null,
    2,
  );
}

async function runScorer(params: {
  scorer: ScorerModelConfig;
  reportType: ComparisonReportType;
  rubricLines: string[];
  normalizedInputPacket: Record<string, unknown>;
  candidates: ComparisonCandidateResult[];
}): Promise<ComparisonScorerResult> {
  const validCandidates = params.candidates.filter(
    (candidate) => candidate.renderedPreview !== null,
  );

  if (validCandidates.length === 0) {
    return {
      provider: params.scorer.provider,
      model: params.scorer.model,
      status: "error",
      rawText: null,
      parsedJson: null,
      validatedOutput: null,
      latencyMs: null,
      usage: null,
      estimatedCostUsd: null,
      error: "No valid candidate outputs were available for scoring.",
    };
  }

  const schema =
    params.reportType === "daily"
      ? toJSONSchema(DailyJudgeOutputSchema)
      : toJSONSchema(BlueprintJudgeOutputSchema);

  try {
    const result = await generateStructuredEvalOutput({
      provider: params.scorer.provider,
      model: params.scorer.model,
      systemPrompt: buildScorerSystemPrompt(params.reportType),
      userPrompt: buildScorerUserPrompt({
        reportType: params.reportType,
        rubricLines: params.rubricLines,
        normalizedInputPacket: params.normalizedInputPacket,
        candidates: validCandidates,
      }),
      schemaName:
        params.reportType === "daily"
          ? "DailyComparisonJudgeOutput"
          : "BlueprintComparisonJudgeOutput",
      schema,
      maxOutputTokens: SCORER_MAX_OUTPUT_TOKENS,
      stepName: `${params.scorer.model} scorer comparison`,
    });

    const validatedOutput =
      params.reportType === "daily"
        ? DailyJudgeOutputSchema.parse(normalizeJudgeEvalOutput(result.parsedJson))
        : BlueprintJudgeOutputSchema.parse(
            normalizeJudgeEvalOutput(result.parsedJson),
          );

    return {
      provider: params.scorer.provider,
      model: params.scorer.model,
      status: "success",
      rawText: result.rawText,
      parsedJson: normalizeJudgeEvalOutput(result.parsedJson),
      validatedOutput,
      latencyMs: result.latencyMs,
      usage: result.usage,
      estimatedCostUsd: result.estimatedCostUsd,
      error: null,
    };
  } catch (error) {
    return {
      provider: params.scorer.provider,
      model: params.scorer.model,
      status: "error",
      rawText: null,
      parsedJson: null,
      validatedOutput: null,
      latencyMs: null,
      usage: null,
      estimatedCostUsd: null,
      error: error instanceof Error ? error.message : "Scorer request failed.",
    };
  }
}

export async function generateModelComparison(params: {
  userId: string;
  userEmail: string | null;
  reportType: ComparisonReportType;
  includeScorers: boolean;
}) {
  const parsedReportType = ComparisonReportTypeSchema.parse(params.reportType);
  const comparedModels = COMPARISON_MODELS.filter((model) => model.enabled);
  const rubricLines = getRubricLines(parsedReportType);
  let normalizedInputPacket: Record<string, unknown>;
  let gatingNotes: string[];
  let sharedPromptContext: ComparisonDocumentData["sharedPromptContext"];
  let candidateResults: ComparisonCandidateResult[];

  if (parsedReportType === "daily") {
    const reportContext = await buildDailyRunContext(params.userId, params.userEmail);
    normalizedInputPacket = reportContext.normalizedInputPacket;
    gatingNotes = reportContext.gatingNotes;
    sharedPromptContext = reportContext.sharedPromptContext;
    candidateResults = await runWithConcurrency(comparedModels, 2, (modelConfig) =>
      runDailyCandidate(modelConfig, reportContext),
    );
  } else {
    const reportContext = await buildBlueprintRunContext(
      params.userId,
      params.userEmail,
    );
    normalizedInputPacket = reportContext.normalizedInputPacket;
    gatingNotes = reportContext.gatingNotes;
    sharedPromptContext = reportContext.sharedPromptContext;
    candidateResults = await runWithConcurrency(comparedModels, 2, (modelConfig) =>
      runBlueprintCandidate(modelConfig, reportContext),
    );
  }

  const enabledScorers = params.includeScorers
    ? SCORER_MODELS.filter((model) => model.enabled)
    : [];
  const scorerResults = params.includeScorers
    ? await runWithConcurrency(enabledScorers, 1, (scorer) =>
        runScorer({
          scorer,
          reportType: parsedReportType,
          rubricLines,
          normalizedInputPacket,
          candidates: candidateResults,
        }),
      )
    : [];

  const documentData: ComparisonDocumentData = {
    reportType: parsedReportType,
    generatedAt: new Date().toISOString(),
    comparedModels: COMPARISON_MODELS,
    scorersEnabled: params.includeScorers,
    enabledScorers,
    normalizedInputPacket,
    gatingNotes,
    sharedPromptContext,
    candidateResults,
    rubricLines,
    scorerResults,
  };

  return {
    document: formatModelComparisonDocument(documentData),
    documentHtml: formatModelComparisonHtmlDocument(documentData),
    data: documentData,
  };
}
