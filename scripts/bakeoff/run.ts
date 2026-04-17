import { toJSONSchema } from "zod";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import askCasesJson from "../../bakeoff/cases/ask-cases.json";
import profileCasesJson from "../../bakeoff/cases/profile-cases.json";
import pricingJson from "../../bakeoff/config/model-pricing.json";

import {
  buildAstrologyContext,
  type AstrologyContext,
} from "@/domain/astrology/context";
import {
  buildSynthesisAgentRequest,
  validateFinalSynthesisOutput,
} from "@/domain/astrology/synthesis.agent";
import {
  buildTodayNarrativeRequest,
  buildTodaySignalsRequest,
  hasStrongTodaySignals,
  TodaySignalsSchema,
  type TodaySignals,
} from "@/domain/astrology/two-pass.agent";
import {
  buildTimingAgentRequest,
  validateTimingOutput,
} from "@/domain/astrology/timing.agent";
import {
  DailyBriefingInputSchema,
  type DailyBriefingInput,
  type FinalSynthesisOutput,
} from "@/domain/astrology/schemas";
import {
  buildWesternAgentRequest,
  validateWesternOutput,
} from "@/domain/astrology/western.agent";
import { buildWesternModalitySignal } from "@/domain/astrology/western.modality";
import { buildBaziContext, getBaziGateContext } from "@/domain/bazi/context";
import {
  buildChineseAstrologyContext,
  buildChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import { buildBlueprintAgentRequest, validateBlueprintOutput } from "@/domain/blueprint/blueprint.agent";
import type { Blueprint } from "@/domain/blueprint/blueprint.types";
import { classifyDecisionQuestion } from "@/domain/decision/decision.classifier";
import { classifyDecisionFeasibility } from "@/domain/decision/decision.feasibility";
import {
  classifyDecisionHorizon,
  getContextEmphasis,
} from "@/domain/decision/decision.horizon";
import { classifyDecisionIntent } from "@/domain/decision/decision.intent";
import {
  buildDecisionAgentRequest,
  validateDecisionGuidanceOutput,
} from "@/domain/decision/decision.agent";
import {
  buildDecisionGuidanceRequest,
  buildDecisionSignalsRequest,
  DecisionSignalsSchema,
  hasStrongDecisionSignals,
  type DecisionSignals,
} from "@/domain/decision/decision.two-pass.agent";
import type { DecisionGuidance } from "@/domain/decision/decision.types";
import {
  buildForecastAgentRequest,
  validateForecastOutput,
  type ForecastOutputDepth,
} from "@/domain/forecast/forecast.agent";
import {
  buildForecastNarrativeRequest,
  buildForecastSignalsRequest,
  ForecastSignalsSchema,
  hasStrongForecastSignals,
  type ForecastSignals,
} from "@/domain/forecast/forecast.two-pass.agent";
import {
  buildForecastHorizon,
  type Forecast,
} from "@/domain/forecast/forecast.types";
import {
  buildAskGenerationContext,
  buildForecastGenerationContext,
  buildTodayGenerationContext,
} from "@/domain/generation/generation-context";
import { buildHumanDesignContext } from "@/domain/human_design/context";
import { buildNumerologySignal } from "@/domain/numerology/numerology.agent";
import type { NumerologyContext } from "@/domain/numerology/context";
import {
  generateStructuredEvalOutput,
  type EvalUsage,
} from "@/lib/eval-providers";
import {
  fetchFreeAstroChineseToday,
  fetchFreeAstroPanchang,
  getFreeAstroLimitation,
  hasFreeAstroApiKey,
  type FreeAstroDailyContext,
} from "@/lib/freeastroapi";
import { getFeatureAccess } from "@/lib/access";
import { getModelRoutingDecision } from "@/lib/model-decision";
import type { LlmProvider, RoutedModel } from "@/lib/model-routing";

import { toCsv } from "@/scripts/bakeoff/csv";
import type {
  AskBakeoffCase,
  BakeoffCandidateResult,
  BakeoffProfile,
  BakeoffStageResult,
  BakeoffSurface,
  BakeoffTier,
  BlindPacketEntry,
  PricingTable,
  ProfileBakeoffCase,
  SurfacePlan,
} from "@/scripts/bakeoff/types";
import { BAKEOFF_VARIANTS } from "@/scripts/bakeoff/variants";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const profileCases = profileCasesJson as ProfileBakeoffCase[];
const askCases = askCasesJson as AskBakeoffCase[];
const pricingTable = pricingJson as PricingTable;

type StructuredRequest = {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};

type SharedProfileRuntime = {
  profileCase: ProfileBakeoffCase;
  tier: BakeoffTier;
  briefingInput: DailyBriefingInput;
  astrologyContext: AstrologyContext;
  numerologyContext: NumerologyContext;
  numerologySignal: ReturnType<typeof buildNumerologySignal>["signal"];
  chineseAstrologyContext: ReturnType<typeof buildChineseAstrologyContext>;
  chineseAstrologySignal: ReturnType<typeof buildChineseAstrologySignal>;
  freeAstroDailyContext: FreeAstroDailyContext;
  outputDepth: ForecastOutputDepth;
};

type AskFrozenContext = {
  context_id: string;
  profile_case_id: string;
  tier: BakeoffTier;
  latestBriefing: FinalSynthesisOutput | null;
  latestForecast: Forecast | null;
  latestBlueprint: Blueprint | null;
};

type CliConfig = {
  runId: string;
  surfaces: BakeoffSurface[];
  variants: string[];
  profileCaseIds: string[] | null;
  askCaseIds: string[] | null;
};

function timestampRunId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function parseList(value: string | null) {
  if (value == null || value.trim() === "") {
    return null;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();

  for (const arg of args) {
    if (arg.startsWith("--") === false) {
      continue;
    }

    const [key, rawValue] = arg.slice(2).split("=", 2);
    values.set(key, rawValue ?? "true");
  }

  const surfaces =
    (parseList(values.get("surfaces") ?? null) as BakeoffSurface[] | null) ?? [
      "today",
      "forecast",
      "blueprint",
      "ask",
    ];

  return {
    runId: values.get("run-id") ?? `${timestampRunId()}-launch-bakeoff`,
    surfaces,
    variants: parseList(values.get("variants") ?? null) ?? BAKEOFF_VARIANTS.map((variant) => variant.id),
    profileCaseIds: parseList(values.get("profiles") ?? null),
    askCaseIds: parseList(values.get("asks") ?? null),
  } satisfies CliConfig;
}

function structuredRequestFromAgentRequest(request: {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  structuredOutput?: { schema: Record<string, unknown> };
  outputSchema?: object;
  maxOutputTokens?: number;
}): StructuredRequest {
  return {
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    schemaName: request.schemaName,
    schema:
      request.structuredOutput?.schema ??
      (toJSONSchema(request.outputSchema as never) as Record<string, unknown>),
    maxOutputTokens: request.maxOutputTokens ?? 1200,
  };
}

function getWeekday(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

function getDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function getPreviewHeading(label: string, body: string | null) {
  if (body == null || body.trim() === "") {
    return `### ${label}\n\nUnavailable\n`;
  }

  return `### ${label}\n\n${body.trim()}\n`;
}

function estimateCostUsd(model: string, usage: EvalUsage | null) {
  if (usage?.input_tokens == null || usage.output_tokens == null) {
    return null;
  }

  const pricing = pricingTable.models[model];

  if (pricing == null) {
    return null;
  }

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input_per_1m_usd;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output_per_1m_usd;

  return Number((inputCost + outputCost).toFixed(6));
}

function sumUsage(stages: BakeoffStageResult[]) {
  const usageStages = stages.filter((stage) => stage.usage !== null);

  if (usageStages.length === 0) {
    return null;
  }

  const sumField = (field: keyof EvalUsage) =>
    usageStages.every((stage) => stage.usage?.[field] == null)
      ? null
      : usageStages.reduce((sum, stage) => sum + (stage.usage?.[field] ?? 0), 0);

  return {
    input_tokens: sumField("input_tokens"),
    output_tokens: sumField("output_tokens"),
    total_tokens: sumField("total_tokens"),
  } satisfies EvalUsage;
}

function sumLatency(stages: BakeoffStageResult[]) {
  const latencies = stages
    .map((stage) => stage.latency_ms)
    .filter((value): value is number => value != null);

  return latencies.length === 0 ? null : latencies.reduce((sum, value) => sum + value, 0);
}

function sumCost(stages: BakeoffStageResult[]) {
  const costs = stages
    .map((stage) => stage.estimated_cost_usd)
    .filter((value): value is number => value != null);

  return costs.length === 0 ? null : Number(costs.reduce((sum, value) => sum + value, 0).toFixed(6));
}

async function ensureDir(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, "utf8");
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
          detail: "FREEASTROAPI_API_KEY is not configured, so Daily FreeAstro enrichments were skipped.",
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
      "Vedic Panchang was skipped because the case does not include current coordinates and no birthplace coordinates are available as a fallback.",
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
      `Vedic Panchang timing labels are aligned to ${panchangTimezone === "AUTO" ? "automatic timezone detection" : panchangTimezone}.`,
    );
  }

  return {
    chinese_current_pillars: chineseCurrentPillars,
    vedic_panchang: vedicPanchang,
    notes,
    limitations,
  };
}

function buildSharedProfileRuntime(
  profileCase: ProfileBakeoffCase,
  tier: BakeoffTier,
): SharedProfileRuntime {
  const weekday = getWeekday(
    profileCase.evaluation_date,
    profileCase.profile.current_timezone,
  );
  const briefingInput: DailyBriefingInput = DailyBriefingInputSchema.parse({
    display_name: profileCase.profile.display_name,
    birth_date: profileCase.profile.birth_date,
    birth_time: profileCase.profile.birth_time,
    birth_time_confidence: profileCase.profile.birth_time_confidence,
    birth_city: profileCase.profile.birth_city,
    birth_country: profileCase.profile.birth_country,
    timezone: profileCase.profile.current_timezone,
    tone_preference: profileCase.profile.tone_preference,
    date: profileCase.evaluation_date,
    weekday,
  });
  const astrologyContext = buildAstrologyContext({
    ...briefingInput,
    birth_latitude: profileCase.profile.birth_latitude,
    birth_longitude: profileCase.profile.birth_longitude,
    birth_timezone: profileCase.profile.birth_timezone,
  });
  const numerologyData = buildNumerologySignal({
    birth_date: briefingInput.birth_date,
    date: briefingInput.date,
    full_birth_name_for_numerology: profileCase.profile.full_birth_name_for_numerology,
  });
  const chineseAstrologyContext = buildChineseAstrologyContext({
    birth_date: briefingInput.birth_date,
  });
  const chineseAstrologySignal = buildChineseAstrologySignal(chineseAstrologyContext);

  return {
    profileCase,
    tier,
    briefingInput,
    astrologyContext,
    numerologyContext: numerologyData.context,
    numerologySignal: numerologyData.signal,
    chineseAstrologyContext,
    chineseAstrologySignal,
    freeAstroDailyContext: {
      chinese_current_pillars: null,
      vedic_panchang: null,
      notes: [],
      limitations: [],
    },
    outputDepth: tier === "pro" ? "full" : "free",
  } satisfies SharedProfileRuntime;
}

async function runStructuredStage<T>(params: {
  stageId: string;
  label: string;
  model: RoutedModel;
  request: StructuredRequest;
  validate: (parsedJson: unknown) => T;
  stepName: string;
}): Promise<{ stage: BakeoffStageResult; output: T | null }> {
  try {
    const result = await generateStructuredEvalOutput({
      provider: params.model.provider,
      model: params.model.model,
      systemPrompt: params.request.systemPrompt,
      userPrompt: params.request.userPrompt,
      schemaName: params.request.schemaName,
      schema: params.request.schema,
      maxOutputTokens: params.request.maxOutputTokens,
      stepName: params.stepName,
    });

    try {
      const validatedOutput = params.validate(result.parsedJson);

      return {
        stage: {
          stage_id: params.stageId,
          label: params.label,
          provider: params.model.provider,
          model: params.model.model,
          schema_name: params.request.schemaName,
          status: "success",
          raw_text: result.rawText,
          parsed_json: result.parsedJson,
          validated_output: validatedOutput,
          validation_error: null,
          error: null,
          latency_ms: result.latencyMs,
          usage: result.usage,
          estimated_cost_usd:
            result.estimatedCostUsd ?? estimateCostUsd(params.model.model, result.usage),
        },
        output: validatedOutput,
      };
    } catch (error) {
      return {
        stage: {
          stage_id: params.stageId,
          label: params.label,
          provider: params.model.provider,
          model: params.model.model,
          schema_name: params.request.schemaName,
          status: "validation_error",
          raw_text: result.rawText,
          parsed_json: result.parsedJson,
          validated_output: null,
          validation_error: error instanceof Error ? error.message : "Validation failed.",
          error: null,
          latency_ms: result.latencyMs,
          usage: result.usage,
          estimated_cost_usd:
            result.estimatedCostUsd ?? estimateCostUsd(params.model.model, result.usage),
        },
        output: null,
      };
    }
  } catch (error) {
    return {
      stage: {
        stage_id: params.stageId,
        label: params.label,
        provider: params.model.provider,
        model: params.model.model,
        schema_name: params.request.schemaName,
        status: "error",
        raw_text: null,
        parsed_json: null,
        validated_output: null,
        validation_error: null,
        error: error instanceof Error ? error.message : "Generation failed.",
        latency_ms: null,
        usage: null,
        estimated_cost_usd: null,
      },
      output: null,
    };
  }
}

function renderTodayPreview(output: FinalSynthesisOutput) {
  return [
    getPreviewHeading("Executive summary", output.executive_summary),
    getPreviewHeading(
      "Decision of the day",
      `${output.decision_of_day.do} Avoid: ${output.decision_of_day.avoid}`,
    ),
    getPreviewHeading(
      "Timing",
      `Best window: ${output.timing.best_window} Avoid: ${output.timing.avoid_window}`,
    ),
  ].join("\n");
}

function renderForecastPreview(output: Forecast) {
  return [
    getPreviewHeading("Title", output.title),
    getPreviewHeading("Summary", output.summary),
    getPreviewHeading(
      "Current phase",
      `${output.current_phase.headline}: ${output.current_phase.description}`,
    ),
  ].join("\n");
}

function renderBlueprintPreview(output: Blueprint) {
  return [
    getPreviewHeading("Title", output.title),
    getPreviewHeading("Summary", output.summary),
    getPreviewHeading(
      "Core pattern",
      `${output.core_pattern.headline}: ${output.core_pattern.description}`,
    ),
    getPreviewHeading(
      "Communication and connection",
      `${output.communication_and_connection.headline}: ${output.communication_and_connection.description}`,
    ),
  ].join("\n");
}

function renderAskPreview(output: DecisionGuidance) {
  return [
    getPreviewHeading("Question", output.question),
    getPreviewHeading(
      "Recommendation",
      `${output.recommendation.headline} (${output.recommendation.stance})`,
    ),
    getPreviewHeading(
      "Why this answer",
      `${output.why_this_answer.headline}: ${output.why_this_answer.description}`,
    ),
    getPreviewHeading(
      "Timing posture",
      `${output.timing_posture.headline}: ${output.timing_posture.description}`,
    ),
  ].join("\n");
}

function renderPreview(surface: BakeoffSurface, output: unknown) {
  if (output == null) {
    return null;
  }

  if (surface === "today") {
    return renderTodayPreview(output as FinalSynthesisOutput);
  }

  if (surface === "forecast") {
    return renderForecastPreview(output as Forecast);
  }

  if (surface === "blueprint") {
    return renderBlueprintPreview(output as Blueprint);
  }

  return renderAskPreview(output as DecisionGuidance);
}

function buildCandidateResult(params: {
  runId: string;
  surface: BakeoffSurface;
  tier: BakeoffTier;
  caseId: string;
  caseLabel: string;
  variantId: SurfacePlan extends never ? never : string;
  variantLabel: string;
  pathTaken: BakeoffCandidateResult["path_taken"];
  finalModel: RoutedModel | null;
  output: unknown | null;
  stages: BakeoffStageResult[];
  routingMetadata: BakeoffCandidateResult["routing_metadata"];
  error: string | null;
  skipReason?: string | null;
}): BakeoffCandidateResult {
  const outputExists = params.output != null;
  const usedFallback = params.pathTaken === "fallback";
  const status = params.skipReason
    ? "skipped"
    : outputExists
      ? usedFallback
        ? "partial"
        : "success"
      : "error";

  return {
    run_id: params.runId,
    surface: params.surface,
    tier: params.tier,
    case_id: params.caseId,
    case_label: params.caseLabel,
    variant_id: params.variantId as BakeoffCandidateResult["variant_id"],
    variant_label: params.variantLabel,
    status,
    skip_reason: params.skipReason ?? null,
    path_taken: params.pathTaken,
    final_model: params.finalModel?.model ?? null,
    final_provider: params.finalModel?.provider ?? null,
    used_fallback: usedFallback,
    fallback_model_chain: params.stages
      .filter((stage) => stage.stage_id.includes("fallback"))
      .map((stage) => stage.model),
    total_latency_ms: sumLatency(params.stages),
    total_usage: sumUsage(params.stages),
    total_estimated_cost_usd: sumCost(params.stages),
    routing_metadata: params.routingMetadata,
    output_json: params.output,
    preview_markdown: renderPreview(params.surface, params.output),
    stages: params.stages,
    error: params.error,
  };
}

async function runTodayFallback(
  runtime: SharedProfileRuntime,
  fallbackModels: RoutedModel[],
  stages: BakeoffStageResult[],
) {
  const todayGenerationContext = buildTodayGenerationContext({
    featureAccess: getFeatureAccess(runtime.tier),
    freeAstroDailyContext: runtime.freeAstroDailyContext,
    latestBlueprint: null,
  });

  for (let index = 0; index < fallbackModels.length; index += 1) {
    const model = fallbackModels[index];
    const stagePrefix = `fallback-${index + 1}`;
    const westernRequest = structuredRequestFromAgentRequest(
      buildWesternAgentRequest(runtime.briefingInput, runtime.astrologyContext),
    );
    const westernResult = await runStructuredStage({
      stageId: `${stagePrefix}-western`,
      label: `Fallback western ${index + 1}`,
      model,
      request: westernRequest,
      validate: validateWesternOutput,
      stepName: `${model.model} today fallback western`,
    });
    stages.push(westernResult.stage);

    if (westernResult.output == null) {
      continue;
    }

    const timingRequest = structuredRequestFromAgentRequest(
      buildTimingAgentRequest(
        runtime.briefingInput,
        runtime.astrologyContext,
        todayGenerationContext.freeAstroDailyContext,
      ),
    );
    const timingResult = await runStructuredStage({
      stageId: `${stagePrefix}-timing`,
      label: `Fallback timing ${index + 1}`,
      model,
      request: timingRequest,
      validate: validateTimingOutput,
      stepName: `${model.model} today fallback timing`,
    });
    stages.push(timingResult.stage);

    if (timingResult.output == null) {
      continue;
    }

    const synthesisRequest = structuredRequestFromAgentRequest(
      buildSynthesisAgentRequest({
        briefingInput: runtime.briefingInput,
        astrologyContext: runtime.astrologyContext,
        numerologyContext: runtime.numerologyContext,
        numerologySignal: runtime.numerologySignal,
        freeAstroDailyContext: todayGenerationContext.freeAstroDailyContext,
        westernModalitySignal: buildWesternModalitySignal(westernResult.output),
        westernOutput: westernResult.output,
        timingOutput: timingResult.output,
      }),
    );
    const synthesisResult = await runStructuredStage({
      stageId: `${stagePrefix}-synthesis`,
      label: `Fallback synthesis ${index + 1}`,
      model,
      request: {
        ...synthesisRequest,
        maxOutputTokens: 1600,
      },
      validate: validateFinalSynthesisOutput,
      stepName: `${model.model} today fallback synthesis`,
    });
    stages.push(synthesisResult.stage);

    if (synthesisResult.output != null) {
      return {
        output: synthesisResult.output,
        finalModel: model,
      };
    }
  }

  return {
    output: null,
    finalModel: null,
  };
}

async function runSinglePassFallback<T>(params: {
  request: StructuredRequest;
  validate: (parsedJson: unknown) => T;
  stages: BakeoffStageResult[];
  fallbackModels: RoutedModel[];
  surfaceLabel: string;
}) {
  for (let index = 0; index < params.fallbackModels.length; index += 1) {
    const model = params.fallbackModels[index];
    const stageResult = await runStructuredStage({
      stageId: `fallback-${index + 1}`,
      label: `Fallback ${params.surfaceLabel} ${index + 1}`,
      model,
      request: params.request,
      validate: params.validate,
      stepName: `${model.model} ${params.surfaceLabel} fallback`,
    });
    params.stages.push(stageResult.stage);

    if (stageResult.output != null) {
      return {
        output: stageResult.output,
        finalModel: model,
      };
    }
  }

  return {
    output: null,
    finalModel: null,
  };
}

async function runTodayCase(
  runId: string,
  profileCase: ProfileBakeoffCase,
  tier: BakeoffTier,
  variantId: BakeoffCandidateResult["variant_id"],
  variantLabel: string,
  plan: SurfacePlan,
) {
  const shared = buildSharedProfileRuntime(profileCase, tier);
  shared.freeAstroDailyContext =
    tier === "pro"
      ? await buildFreeAstroDailyContext({
          date: shared.briefingInput.date,
          currentTimezone: profileCase.profile.current_timezone,
          birthTimezone: profileCase.profile.birth_timezone,
          birthLatitude: profileCase.profile.birth_latitude,
          birthLongitude: profileCase.profile.birth_longitude,
        })
      : {
          chinese_current_pillars: null,
          vedic_panchang: null,
          notes: [],
          limitations: [],
        };
  const stages: BakeoffStageResult[] = [];
  const signalsModel =
    plan.mode === "production_control" ? plan.cheap_model! : plan.primary_model!;
  const todayCtx = buildTodayGenerationContext({
    featureAccess: getFeatureAccess(tier),
    freeAstroDailyContext: shared.freeAstroDailyContext,
    latestBlueprint: null,
  });
  const signalsRequest = buildTodaySignalsRequest({
    briefingInput: shared.briefingInput,
    astrologyContext: shared.astrologyContext,
    numerologyContext: shared.numerologyContext,
    numerologySignal: shared.numerologySignal,
    freeAstroDailyContext: todayCtx.freeAstroDailyContext,
    blueprintContext: todayCtx.blueprintContext,
  });
  const signalsResult = await runStructuredStage({
    stageId: "signals",
    label: "Signals",
    model: signalsModel,
    request: structuredRequestFromAgentRequest(signalsRequest),
    validate: (parsedJson) => TodaySignalsSchema.parse(parsedJson),
    stepName: `${signalsModel.model} today signals`,
  });
  stages.push(signalsResult.stage);
  const routingMetadata =
    signalsResult.output == null
      ? null
      : (() => {
          const decision = getModelRoutingDecision({
            feature: "today",
            signals: signalsResult.output.routing,
            userContext: {
              isFreeUser: tier === "free",
              hasBlueprint: tier === "pro",
              recentUsageCount: 0,
            },
          });

          return {
            use_frontier: decision.useFrontier,
            synthesis_burden: decision.synthesisBurden,
            forced_frontier_reasons: decision.forcedFrontierReasons,
            normalized_signals: decision.normalizedSignals,
          };
        })();

  if (signalsResult.output != null && hasStrongTodaySignals(signalsResult.output)) {
    const narrativeModel =
      plan.mode === "production_control"
        ? routingMetadata?.use_frontier
          ? plan.frontier_model!
          : plan.cheap_model!
        : plan.primary_model!;
    const narrativeRequest = buildTodayNarrativeRequest(
      {
        briefingInput: shared.briefingInput,
        astrologyContext: shared.astrologyContext,
        numerologyContext: shared.numerologyContext,
        numerologySignal: shared.numerologySignal,
        freeAstroDailyContext: todayCtx.freeAstroDailyContext,
        blueprintContext: todayCtx.blueprintContext,
        signals: signalsResult.output,
      },
      plan.mode === "production_control" && routingMetadata?.use_frontier ? "synthesize" : "compose",
    );
    const narrativeResult = await runStructuredStage({
      stageId: "narrative",
      label: "Narrative",
      model: narrativeModel,
      request: structuredRequestFromAgentRequest(narrativeRequest),
      validate: validateFinalSynthesisOutput,
      stepName: `${narrativeModel.model} today narrative`,
    });
    stages.push(narrativeResult.stage);

    if (narrativeResult.output != null) {
      return buildCandidateResult({
        runId,
        surface: "today",
        tier,
        caseId: profileCase.id,
        caseLabel: profileCase.label,
        variantId,
        variantLabel,
        pathTaken:
          plan.mode === "production_control"
            ? routingMetadata?.use_frontier
              ? "routed_frontier"
              : "routed_cheap"
            : "static_default",
        finalModel: narrativeModel,
        output: narrativeResult.output,
        stages,
        routingMetadata,
        error: null,
      });
    }
  }

  const fallbackResult = await runTodayFallback(shared, plan.fallback_models, stages);

  return buildCandidateResult({
    runId,
    surface: "today",
    tier,
    caseId: profileCase.id,
    caseLabel: profileCase.label,
    variantId,
    variantLabel,
    pathTaken: "fallback",
    finalModel: fallbackResult.finalModel,
    output: fallbackResult.output,
    stages,
    routingMetadata,
    error:
      fallbackResult.output == null ? "Today output failed across primary and fallback paths." : null,
  });
}

async function runForecastCase(
  runId: string,
  profileCase: ProfileBakeoffCase,
  tier: BakeoffTier,
  variantId: BakeoffCandidateResult["variant_id"],
  variantLabel: string,
  plan: SurfacePlan,
) {
  const shared = buildSharedProfileRuntime(profileCase, tier);
  shared.freeAstroDailyContext = {
    chinese_current_pillars: null,
    vedic_panchang: null,
    notes: [],
    limitations: [],
  };
  const horizon = buildForecastHorizon(shared.briefingInput.date);
  const forecastGenerationContext = buildForecastGenerationContext({
    featureAccess: getFeatureAccess(tier),
    chineseAstrologyContext: shared.chineseAstrologyContext,
    chineseAstrologySignal: shared.chineseAstrologySignal,
    horizon,
    latestBlueprint: null,
  });
  const forecastInput = {
    briefingInput: shared.briefingInput,
    astrologyContext: shared.astrologyContext,
    numerologyContext: shared.numerologyContext,
    chineseAstrologyContext: forecastGenerationContext.chineseAstrologyContext,
    chineseAstrologySignal: forecastGenerationContext.chineseAstrologySignal,
    horizon: forecastGenerationContext.horizon,
    blueprintContext: forecastGenerationContext.blueprintContext,
  };
  const stages: BakeoffStageResult[] = [];
  const signalsModel =
    plan.mode === "production_control" ? plan.cheap_model! : plan.primary_model!;
  const signalsResult = await runStructuredStage({
    stageId: "signals",
    label: "Signals",
    model: signalsModel,
    request: structuredRequestFromAgentRequest(buildForecastSignalsRequest(forecastInput)),
    validate: (parsedJson) => ForecastSignalsSchema.parse(parsedJson),
    stepName: `${signalsModel.model} forecast signals`,
  });
  stages.push(signalsResult.stage);
  const routingMetadata =
    signalsResult.output == null
      ? null
      : (() => {
          const decision = getModelRoutingDecision({
            feature: "forecast",
            signals: signalsResult.output.routing,
            userContext: {
              isFreeUser: tier === "free",
              hasBlueprint: tier === "pro",
              recentUsageCount: 0,
            },
          });

          return {
            use_frontier: decision.useFrontier,
            synthesis_burden: decision.synthesisBurden,
            forced_frontier_reasons: decision.forcedFrontierReasons,
            normalized_signals: decision.normalizedSignals,
          };
        })();

  if (signalsResult.output != null && hasStrongForecastSignals(signalsResult.output)) {
    const narrativeModel =
      plan.mode === "production_control"
        ? routingMetadata?.use_frontier
          ? plan.frontier_model!
          : plan.cheap_model!
        : plan.primary_model!;
    const narrativeRequest = buildForecastNarrativeRequest(
      {
        ...forecastInput,
        signals: signalsResult.output,
      },
      plan.mode === "production_control" && routingMetadata?.use_frontier ? "synthesize" : "compose",
      shared.outputDepth,
    );
    const narrativeResult = await runStructuredStage({
      stageId: "narrative",
      label: "Narrative",
      model: narrativeModel,
      request: structuredRequestFromAgentRequest(narrativeRequest),
      validate: (parsedJson) => validateForecastOutput(parsedJson, shared.outputDepth),
      stepName: `${narrativeModel.model} forecast narrative`,
    });
    stages.push(narrativeResult.stage);

    if (narrativeResult.output != null) {
      return buildCandidateResult({
        runId,
        surface: "forecast",
        tier,
        caseId: profileCase.id,
        caseLabel: profileCase.label,
        variantId,
        variantLabel,
        pathTaken:
          plan.mode === "production_control"
            ? routingMetadata?.use_frontier
              ? "routed_frontier"
              : "routed_cheap"
            : "static_default",
        finalModel: narrativeModel,
        output: narrativeResult.output,
        stages,
        routingMetadata,
        error: null,
      });
    }
  }

  const fallbackResult = await runSinglePassFallback({
    request: structuredRequestFromAgentRequest(
      buildForecastAgentRequest(forecastInput, shared.outputDepth),
    ),
    validate: (parsedJson) => validateForecastOutput(parsedJson, shared.outputDepth),
    stages,
    fallbackModels:
      plan.mode === "production_control" ? [plan.frontier_model!] : plan.fallback_models,
    surfaceLabel: "forecast",
  });

  return buildCandidateResult({
    runId,
    surface: "forecast",
    tier,
    caseId: profileCase.id,
    caseLabel: profileCase.label,
    variantId,
    variantLabel,
    pathTaken: "fallback",
    finalModel: fallbackResult.finalModel,
    output: fallbackResult.output,
    stages,
    routingMetadata,
    error:
      fallbackResult.output == null
        ? "Forecast output failed across primary and fallback paths."
        : null,
  });
}

async function runBlueprintCase(
  runId: string,
  profileCase: ProfileBakeoffCase,
  tier: BakeoffTier,
  variantId: BakeoffCandidateResult["variant_id"],
  variantLabel: string,
  plan: SurfacePlan,
) {
  const shared = buildSharedProfileRuntime(profileCase, tier);
  const outputDepth = tier === "pro" ? "full" : "free";
  const baziContext =
    outputDepth === "full"
      ? await buildBaziContext({
          birth_date: profileCase.profile.birth_date,
          birth_time: profileCase.profile.birth_time,
          birth_time_confidence: profileCase.profile.birth_time_confidence,
          birth_city: profileCase.profile.birth_city,
          birth_latitude: profileCase.profile.birth_latitude,
          birth_longitude: profileCase.profile.birth_longitude,
          bazi_calculation_marker: profileCase.profile.bazi_calculation_marker,
        })
      : getBaziGateContext({
          birth_date: profileCase.profile.birth_date,
          birth_time: profileCase.profile.birth_time,
          birth_time_confidence: profileCase.profile.birth_time_confidence,
          birth_city: profileCase.profile.birth_city,
          birth_latitude: profileCase.profile.birth_latitude,
          birth_longitude: profileCase.profile.birth_longitude,
          bazi_calculation_marker: profileCase.profile.bazi_calculation_marker,
        });
  const humanDesignContext = buildHumanDesignContext({
    birth_date: profileCase.profile.birth_date,
    birth_time: profileCase.profile.birth_time,
    birth_time_confidence: profileCase.profile.birth_time_confidence,
    birth_latitude: profileCase.profile.birth_latitude,
    birth_longitude: profileCase.profile.birth_longitude,
    birth_timezone: profileCase.profile.birth_timezone,
  });
  const blueprintRequest = structuredRequestFromAgentRequest(
    buildBlueprintAgentRequest(
      {
        briefingInput: shared.briefingInput,
        astrologyContext: shared.astrologyContext,
        numerologyContext: shared.numerologyContext,
        chineseAstrologyContext: shared.chineseAstrologyContext,
        chineseAstrologySignal: shared.chineseAstrologySignal,
        baziContext,
        humanDesignContext,
      },
      outputDepth,
    ),
  );
  const stages: BakeoffStageResult[] = [];
  const primaryModel =
    plan.mode === "production_control" ? plan.primary_model! : plan.primary_model!;
  const primaryResult = await runStructuredStage({
    stageId: "single-pass",
    label: "Single-pass generation",
    model: primaryModel,
    request: blueprintRequest,
    validate: (parsedJson) => validateBlueprintOutput(parsedJson, outputDepth),
    stepName: `${primaryModel.model} blueprint generation`,
  });
  stages.push(primaryResult.stage);

  if (primaryResult.output != null) {
    return buildCandidateResult({
      runId,
      surface: "blueprint",
      tier,
      caseId: profileCase.id,
      caseLabel: profileCase.label,
      variantId,
      variantLabel,
      pathTaken: plan.mode === "production_control" ? "control_single_pass" : "single_pass",
      finalModel: primaryModel,
      output: primaryResult.output,
      stages,
      routingMetadata: null,
      error: null,
    });
  }

  const fallbackResult = await runSinglePassFallback({
    request: blueprintRequest,
    validate: (parsedJson) => validateBlueprintOutput(parsedJson, outputDepth),
    stages,
    fallbackModels: plan.fallback_models,
    surfaceLabel: "blueprint",
  });

  return buildCandidateResult({
    runId,
    surface: "blueprint",
    tier,
    caseId: profileCase.id,
    caseLabel: profileCase.label,
    variantId,
    variantLabel,
    pathTaken: "fallback",
    finalModel: fallbackResult.finalModel,
    output: fallbackResult.output,
    stages,
    routingMetadata: null,
    error:
      fallbackResult.output == null
        ? "Blueprint output failed across primary and fallback paths."
        : null,
  });
}

async function buildAskFrozenContext(
  runId: string,
  profileCase: ProfileBakeoffCase,
  tier: BakeoffTier,
) {
  const todayResult = await runTodayCase(
    runId,
    profileCase,
    tier,
    "variant-d",
    "D · Current production routing control",
    BAKEOFF_VARIANTS.find((variant) => variant.id === "variant-d")!.getSurfacePlan("today", tier),
  );
  const forecastResult = await runForecastCase(
    runId,
    profileCase,
    tier,
    "variant-d",
    "D · Current production routing control",
    BAKEOFF_VARIANTS.find((variant) => variant.id === "variant-d")!.getSurfacePlan("forecast", tier),
  );
  const blueprintResult = await runBlueprintCase(
    runId,
    profileCase,
    tier,
    "variant-d",
    "D · Current production routing control",
    BAKEOFF_VARIANTS.find((variant) => variant.id === "variant-d")!.getSurfacePlan("blueprint", tier),
  );

  return {
    context_id: `${profileCase.id}-${tier}`,
    profile_case_id: profileCase.id,
    tier,
    latestBriefing: (todayResult.output_json as FinalSynthesisOutput | null) ?? null,
    latestForecast: (forecastResult.output_json as Forecast | null) ?? null,
    latestBlueprint: (blueprintResult.output_json as Blueprint | null) ?? null,
  } satisfies AskFrozenContext;
}

async function runAskCase(
  runId: string,
  askCase: AskBakeoffCase,
  profileCase: ProfileBakeoffCase,
  frozenContext: AskFrozenContext | null,
  variantId: BakeoffCandidateResult["variant_id"],
  variantLabel: string,
  plan: SurfacePlan,
) {
  if (frozenContext == null) {
    return buildCandidateResult({
      runId,
      surface: "ask",
      tier: askCase.tier,
      caseId: askCase.id,
      caseLabel: askCase.label,
      variantId,
      variantLabel,
      pathTaken: "single_pass",
      finalModel: null,
      output: null,
      stages: [],
      routingMetadata: null,
      error: null,
      skipReason: "Missing frozen Ask support context.",
    });
  }

  const shared = buildSharedProfileRuntime(profileCase, askCase.tier);
  shared.freeAstroDailyContext = {
    chinese_current_pillars: null,
    vedic_panchang: null,
    notes: [],
    limitations: [],
  };
  const decisionType = classifyDecisionQuestion(askCase.question);
  const decisionHorizon = classifyDecisionHorizon(askCase.question, decisionType);
  const decisionIntent = classifyDecisionIntent(askCase.question);
  const decisionFeasibility = classifyDecisionFeasibility(askCase.question);
  const contextEmphasis = getContextEmphasis(decisionHorizon);
  const generationContext = buildAskGenerationContext({
    featureAccess: getFeatureAccess(askCase.tier),
    latestBriefing: frozenContext.latestBriefing,
    latestForecast: frozenContext.latestForecast as never,
    latestBlueprint: frozenContext.latestBlueprint as never,
  });
  const decisionInput = {
    question: askCase.question,
    decisionType,
    decisionHorizon,
    decisionIntent,
    decisionFeasibility,
    contextEmphasis,
    briefingInput: shared.briefingInput,
    astrologyContext: shared.astrologyContext,
    numerologyContext: shared.numerologyContext,
    chineseAstrologyContext: shared.chineseAstrologyContext,
    chineseAstrologySignal: shared.chineseAstrologySignal,
    latestBriefing: generationContext.latestBriefing,
    latestForecast: generationContext.latestForecast,
    latestBlueprint: generationContext.latestBlueprint,
  };
  const stages: BakeoffStageResult[] = [];
  const signalsModel =
    plan.mode === "production_control" ? plan.cheap_model! : plan.primary_model!;
  const signalsResult = await runStructuredStage({
    stageId: "signals",
    label: "Signals",
    model: signalsModel,
    request: structuredRequestFromAgentRequest(buildDecisionSignalsRequest(decisionInput)),
    validate: (parsedJson) => DecisionSignalsSchema.parse(parsedJson),
    stepName: `${signalsModel.model} ask signals`,
  });
  stages.push(signalsResult.stage);
  const routingMetadata =
    signalsResult.output == null
      ? null
      : (() => {
          const decision = getModelRoutingDecision({
            feature: "ask",
            signals: signalsResult.output.routing,
            userContext: {
              isFreeUser: askCase.tier === "free",
              hasBlueprint: frozenContext.latestBlueprint !== null,
              recentUsageCount: 0,
            },
          });

          return {
            use_frontier: decision.useFrontier,
            synthesis_burden: decision.synthesisBurden,
            forced_frontier_reasons: decision.forcedFrontierReasons,
            normalized_signals: decision.normalizedSignals,
          };
        })();

  if (signalsResult.output != null && hasStrongDecisionSignals(signalsResult.output)) {
    const guidanceModel =
      plan.mode === "production_control"
        ? routingMetadata?.use_frontier
          ? plan.frontier_model!
          : plan.cheap_model!
        : plan.primary_model!;
    const guidanceResult = await runStructuredStage({
      stageId: "guidance",
      label: "Guidance",
      model: guidanceModel,
      request: structuredRequestFromAgentRequest(
        buildDecisionGuidanceRequest(
          {
            ...decisionInput,
            signals: signalsResult.output,
          },
          plan.mode === "production_control" && routingMetadata?.use_frontier ? "synthesize" : "compose",
        ),
      ),
      validate: validateDecisionGuidanceOutput,
      stepName: `${guidanceModel.model} ask guidance`,
    });
    stages.push(guidanceResult.stage);

    if (guidanceResult.output != null) {
      return buildCandidateResult({
        runId,
        surface: "ask",
        tier: askCase.tier,
        caseId: askCase.id,
        caseLabel: askCase.label,
        variantId,
        variantLabel,
        pathTaken:
          plan.mode === "production_control"
            ? routingMetadata?.use_frontier
              ? "routed_frontier"
              : "routed_cheap"
            : "static_default",
        finalModel: guidanceModel,
        output: guidanceResult.output,
        stages,
        routingMetadata,
        error: null,
      });
    }
  }

  const fallbackResult = await runSinglePassFallback({
    request: structuredRequestFromAgentRequest(buildDecisionAgentRequest(decisionInput)),
    validate: validateDecisionGuidanceOutput,
    stages,
    fallbackModels:
      plan.mode === "production_control" ? [plan.frontier_model!] : plan.fallback_models,
    surfaceLabel: "ask",
  });

  return buildCandidateResult({
    runId,
    surface: "ask",
    tier: askCase.tier,
    caseId: askCase.id,
    caseLabel: askCase.label,
    variantId,
    variantLabel,
    pathTaken: "fallback",
    finalModel: fallbackResult.finalModel,
    output: fallbackResult.output,
    stages,
    routingMetadata,
    error: fallbackResult.output == null ? "Ask output failed across primary and fallback paths." : null,
  });
}

async function writeCandidateArtifacts(
  runRoot: string,
  result: BakeoffCandidateResult,
) {
  const candidatePath = path.join(
    runRoot,
    "candidates",
    result.surface,
    result.case_id,
    result.tier,
    `${result.variant_id}.md`,
  );
  const body = [
    `# ${result.case_label}`,
    ``,
    `- Surface: ${result.surface}`,
    `- Tier: ${result.tier}`,
    `- Variant: ${result.variant_label}`,
    `- Status: ${result.status}`,
    `- Path taken: ${result.path_taken}`,
    `- Final model: ${result.final_model ?? "unavailable"}`,
    `- Total latency: ${result.total_latency_ms ?? "unavailable"} ms`,
    `- Estimated cost: ${result.total_estimated_cost_usd ?? "unavailable"} USD`,
    result.error ? `- Error: ${result.error}` : null,
    result.skip_reason ? `- Skip reason: ${result.skip_reason}` : null,
    "",
    "## Preview",
    "",
    result.preview_markdown ?? "Unavailable",
    "",
    "## Output JSON",
    "",
    "```json",
    JSON.stringify(result.output_json, null, 2),
    "```",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  await writeText(candidatePath, `${body}\n`);
}

function buildBlindPacket(
  runId: string,
  surface: BakeoffSurface,
  tier: BakeoffTier,
  caseId: string,
  caseLabel: string,
  mappings: BlindPacketEntry[],
  results: BakeoffCandidateResult[],
) {
  const candidates = mappings.map((mapping) => {
    const result = results.find(
      (entry) =>
        entry.variant_id === mapping.variant_id &&
        entry.case_id === caseId &&
        entry.surface === surface &&
        entry.tier === tier,
    );

    if (result == null) {
      return null;
    }

    return [
      `## ${mapping.blind_candidate_id}`,
      ``,
      `- Status: ${result.status}`,
      `- Total latency: ${result.total_latency_ms ?? "unavailable"} ms`,
      `- Estimated cost: ${result.total_estimated_cost_usd ?? "unavailable"} USD`,
      result.error ? `- Error: ${result.error}` : null,
      "",
      result.preview_markdown ?? "Unavailable",
      "",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  });

  return [
    `# Blind Review Packet`,
    ``,
    `- Run ID: ${runId}`,
    `- Surface: ${surface}`,
    `- Tier: ${tier}`,
    `- Case ID: ${caseId}`,
    `- Case label: ${caseLabel}`,
    ``,
    `Score every candidate using the rubric in bakeoff/templates/judgment-template.csv.`,
    ``,
    ...candidates.filter((candidate): candidate is string => candidate !== null),
  ].join("\n");
}

function buildBlindMappings(
  runId: string,
  surface: BakeoffSurface,
  tier: BakeoffTier,
  caseId: string,
  results: BakeoffCandidateResult[],
) {
  return results
    .map((result) => ({
      result,
      sortKey: crypto
        .createHash("sha256")
        .update(`${runId}:${surface}:${tier}:${caseId}:${result.variant_id}`)
        .digest("hex"),
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map((item, index) => ({
      run_id: runId,
      surface,
      tier,
      case_id: caseId,
      blind_candidate_id: `candidate-${index + 1}`,
      variant_id: item.result.variant_id,
      variant_label: item.result.variant_label,
    }));
}

async function main() {
  const config = parseArgs();
  const selectedVariants = BAKEOFF_VARIANTS.filter((variant) =>
    config.variants.includes(variant.id),
  );
  const selectedProfileCases = profileCases.filter(
    (profileCase) =>
      config.profileCaseIds == null || config.profileCaseIds.includes(profileCase.id),
  );
  const selectedAskCases = askCases.filter(
    (askCase) => config.askCaseIds == null || config.askCaseIds.includes(askCase.id),
  );
  const runRoot = path.join(projectRoot, "bakeoff", "outputs", config.runId);

  await ensureDir(runRoot);

  const results: BakeoffCandidateResult[] = [];
  const askContexts = new Map<string, AskFrozenContext>();

  if (config.surfaces.includes("ask")) {
    const uniqueContextPairs = new Map<string, { profileCase: ProfileBakeoffCase; tier: BakeoffTier }>();

    for (const askCase of selectedAskCases) {
      const profileCase = selectedProfileCases.find((entry) => entry.id === askCase.profile_case_id);

      if (profileCase == null) {
        continue;
      }

      uniqueContextPairs.set(`${askCase.profile_case_id}:${askCase.tier}`, {
        profileCase,
        tier: askCase.tier,
      });
    }

    for (const [contextKey, item] of uniqueContextPairs.entries()) {
      const frozenContext = await buildAskFrozenContext(config.runId, item.profileCase, item.tier);
      askContexts.set(contextKey, frozenContext);
      await writeJson(
        path.join(runRoot, "frozen-context", "ask", `${frozenContext.context_id}.json`),
        frozenContext,
      );
    }
  }

  for (const surface of config.surfaces) {
    if (surface === "ask") {
      for (const askCase of selectedAskCases) {
        const profileCase = selectedProfileCases.find((entry) => entry.id === askCase.profile_case_id);

        if (profileCase == null) {
          continue;
        }

        const frozenContext = askContexts.get(`${askCase.profile_case_id}:${askCase.tier}`) ?? null;

        for (const variant of selectedVariants) {
          const result = await runAskCase(
            config.runId,
            askCase,
            profileCase,
            frozenContext,
            variant.id,
            variant.label,
            variant.getSurfacePlan("ask", askCase.tier),
          );
          results.push(result);
          await writeCandidateArtifacts(runRoot, result);
        }
      }

      continue;
    }

    for (const profileCase of selectedProfileCases) {
      for (const tier of profileCase.tiers) {
        for (const variant of selectedVariants) {
          const plan = variant.getSurfacePlan(surface, tier);
          const result =
            surface === "today"
              ? await runTodayCase(config.runId, profileCase, tier, variant.id, variant.label, plan)
              : surface === "forecast"
                ? await runForecastCase(config.runId, profileCase, tier, variant.id, variant.label, plan)
                : await runBlueprintCase(config.runId, profileCase, tier, variant.id, variant.label, plan);
          results.push(result);
          await writeCandidateArtifacts(runRoot, result);
        }
      }
    }
  }

  const groupedKeys = new Set(
    results.map((result) => `${result.surface}:${result.tier}:${result.case_id}`),
  );
  const blindMappings: BlindPacketEntry[] = [];

  for (const key of groupedKeys) {
    const [surface, tier, caseId] = key.split(":") as [BakeoffSurface, BakeoffTier, string];
    const caseLabel =
      surface === "ask"
        ? selectedAskCases.find((entry) => entry.id === caseId)?.label ?? caseId
        : selectedProfileCases.find((entry) => entry.id === caseId)?.label ?? caseId;
    const scopedResults = results.filter(
      (result) =>
        result.surface === surface && result.tier === tier && result.case_id === caseId,
    );
    const mappings = buildBlindMappings(config.runId, surface, tier, caseId, scopedResults);
    blindMappings.push(...mappings);
    await writeText(
      path.join(runRoot, "blind-review", surface, caseId, `${tier}.md`),
      `${buildBlindPacket(config.runId, surface, tier, caseId, caseLabel, mappings, scopedResults)}\n`,
    );
  }

  const manifest = {
    run_id: config.runId,
    generated_at: new Date().toISOString(),
    surfaces: config.surfaces,
    variants: selectedVariants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      description: variant.description,
    })),
    profile_case_count: selectedProfileCases.length,
    ask_case_count: selectedAskCases.length,
    results_count: results.length,
  };

  await writeJson(path.join(runRoot, "manifest.json"), manifest);
  await writeText(
    path.join(runRoot, "manifest.md"),
    `# Bake-off Run\n\n- Run ID: ${manifest.run_id}\n- Generated at: ${manifest.generated_at}\n- Surfaces: ${manifest.surfaces.join(", ")}\n- Variants: ${manifest.variants.map((variant) => variant.label).join("; ")}\n- Profile cases: ${manifest.profile_case_count}\n- Ask cases: ${manifest.ask_case_count}\n- Candidate results: ${manifest.results_count}\n`,
  );
  await writeJson(path.join(runRoot, "results.json"), results);
  await writeText(
    path.join(runRoot, "results.csv"),
    toCsv(
      results.map((result) => ({
        run_id: result.run_id,
        surface: result.surface,
        tier: result.tier,
        case_id: result.case_id,
        case_label: result.case_label,
        variant_id: result.variant_id,
        variant_label: result.variant_label,
        status: result.status,
        path_taken: result.path_taken,
        final_model: result.final_model,
        total_latency_ms: result.total_latency_ms,
        input_tokens: result.total_usage?.input_tokens ?? null,
        output_tokens: result.total_usage?.output_tokens ?? null,
        total_tokens: result.total_usage?.total_tokens ?? null,
        total_estimated_cost_usd: result.total_estimated_cost_usd,
        used_fallback: result.used_fallback ? "true" : "false",
        skip_reason: result.skip_reason,
        error: result.error,
      })),
    ),
  );
  await writeText(
    path.join(runRoot, "blind-map.csv"),
    toCsv(
      blindMappings.map((mapping) => ({
        run_id: mapping.run_id,
        surface: mapping.surface,
        tier: mapping.tier,
        case_id: mapping.case_id,
        blind_candidate_id: mapping.blind_candidate_id,
        variant_id: mapping.variant_id,
        variant_label: mapping.variant_label,
      })),
    ),
  );

  console.log(`Bake-off run complete: ${runRoot}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
