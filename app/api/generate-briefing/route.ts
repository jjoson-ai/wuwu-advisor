import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { buildCalibrationPromptFragment } from "@/domain/accuracy/calibration.service";
import { buildAstrologyContext } from "@/domain/astrology/context";
import { buildWesternModalitySignal } from "@/domain/astrology/western.modality";
import {
  buildSynthesisAgentRequest,
  validateFinalSynthesisOutput,
} from "@/domain/astrology/synthesis.agent";
import {
  generateTodayNarrativeCheap,
  generateTodayNarrativeFrontier,
  generateTodaySignals,
  hasStrongTodaySignals,
} from "@/domain/astrology/two-pass.agent";
import {
  buildTimingAgentRequest,
  validateTimingOutput,
} from "@/domain/astrology/timing.agent";
import {
  DailyBriefingInputSchema,
  type BriefingOutput,
  type DailyBriefingInput,
} from "@/domain/astrology/schemas";
import {
  buildWesternAgentRequest,
  validateWesternOutput,
} from "@/domain/astrology/western.agent";
import {
  countDailyBriefingsForUser,
  upsertDailyBriefing,
} from "@/domain/briefing/briefing.service";
import { formatBlueprintForPage } from "@/domain/blueprint/blueprint.formatter";
import { getBlueprintForUser } from "@/domain/blueprint/blueprint.service";
import { buildTodayGenerationContext } from "@/domain/generation/generation-context";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { buildNumerologySignal } from "@/domain/numerology/numerology.agent";
import { detectCrisisOutput } from "@/domain/safety/crisis-detection";
import { logCrisisDetected } from "@/domain/safety/crisis-log";
import {
  classifyOutputSafety,
  type SafetyClassifyContext,
} from "@/domain/safety/output-safety";
import {
  logOutputSafetyBlocked,
  logOutputSafetyFlagged,
} from "@/domain/safety/output-safety-log";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import {
  fetchFreeAstroChineseToday,
  fetchFreeAstroPanchang,
  getFreeAstroLimitation,
  hasFreeAstroApiKey,
  type FreeAstroDailyContext,
} from "@/lib/freeastroapi.server";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { logCostEvent, logLlmCost } from "@/lib/cost-events.server";
import { getModelRoutingDecision } from "@/lib/model-decision";
import { getModelForPass } from "@/lib/model-routing";
import { createSSEStream } from "@/lib/generation-stream";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";
import { toRoutingEventScores } from "@/lib/routing-events";
import { logRoutingEvent } from "@/lib/routing-events.server";
import { isSupportedTimeZone } from "@/lib/timezones";
import {
  getDailyPeriodKey,
  getUsageCount,
  incrementUsageCount,
} from "@/lib/server-usage-limits";

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

function sumEstimatedCosts(values: Array<number | null | undefined>) {
  const presentValues = values.filter((value): value is number => value != null);

  if (presentValues.length === 0) {
    return null;
  }

  return Number(presentValues.reduce((sum, value) => sum + value, 0).toFixed(6));
}

async function buildFreeAstroDailyContext(
  params: {
    date: string;
    currentTimezone: string | null;
    birthTimezone: string | null;
    birthLatitude: number | null;
    birthLongitude: number | null;
  },
  logCtx: { userId: string; tier: string; requestId: string },
): Promise<FreeAstroDailyContext> {
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

  const panchangTimezone =
    params.currentTimezone?.trim() ||
    params.birthTimezone?.trim() ||
    "AUTO";
  const attemptPanchang =
    params.birthLatitude != null && params.birthLongitude != null;

  const freeAstroStart = Date.now();

  const chineseTodayPromise = fetchFreeAstroChineseToday();
  const panchangPromise = attemptPanchang
    ? fetchFreeAstroPanchang({
        ...getDateParts(params.date),
        lat: params.birthLatitude!,
        lng: params.birthLongitude!,
        city: null,
        tzStr: panchangTimezone,
      })
    : Promise.resolve(null);

  const [chineseTodayResult, panchangResult] = await Promise.allSettled([
    chineseTodayPromise,
    panchangPromise,
  ]);

  const freeAstroDurationMs = Date.now() - freeAstroStart;

  // Log Chinese Today call
  logCostEvent({
    feature: "today",
    pass_label: "chinese_today",
    provider: "freeastroapi",
    model: "freeastroapi",
    cost_usd: null,
    cost_is_estimated: false,
    duration_ms: freeAstroDurationMs,
    user_id: logCtx.userId,
    tier: logCtx.tier,
    succeeded: chineseTodayResult.status === "fulfilled",
    request_id: logCtx.requestId,
  });

  // Log Panchang call (only if attempted)
  if (attemptPanchang) {
    logCostEvent({
      feature: "today",
      pass_label: "panchang",
      provider: "freeastroapi",
      model: "freeastroapi",
      cost_usd: null,
      cost_is_estimated: false,
      duration_ms: freeAstroDurationMs,
      user_id: logCtx.userId,
      tier: logCtx.tier,
      succeeded: panchangResult.status === "fulfilled",
      request_id: logCtx.requestId,
    });
  }

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

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);
    const requestId = crypto.randomUUID();
    const platform = getRequestPlatform(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const record = await getOnboardingRecord(user.id, accessToken);

    if (isOnboardingComplete(record) === false) {
      return NextResponse.json(
        { error: "Onboarding is incomplete. Complete onboarding before generation." },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "Onboarding data is missing required briefing fields." },
        { status: 400 },
      );
    }

    if (isSupportedTimeZone(timezone) === false) {
      return NextResponse.json(
        {
          error:
            "Your saved current timezone is invalid. Update it in onboarding using a timezone like Europe/Madrid.",
        },
        { status: 400 },
      );
    }

    const { date, weekday } = getDateContext(timezone);

    const briefingInput: DailyBriefingInput = DailyBriefingInputSchema.parse({
      display_name:
        record.profile?.display_name?.trim() ||
        user.email ||
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
    const accessState = getRequestAccessState(user, request);
    const todayPeriodKey = getDailyPeriodKey(timezone);
    if (
      accessState.accessLevel === "free" &&
      accessState.dailyUsageLimits.todayRefreshesPerDay !== null
    ) {
      const usedCount = await getUsageCount(
        user.id,
        todayPeriodKey,
        "today-refresh",
      );
      if (
        usedCount >= accessState.dailyUsageLimits.todayRefreshesPerDay
      ) {
        return NextResponse.json(
          {
            error:
              "Daily Today refresh limit reached. Upgrade to Pro for unlimited refreshes.",
            upgrade_required: true,
          },
          { status: 429 },
        );
      }
    }
    const frontierModel = getModelForPass("synthesize");
    const cheapModel = getModelForPass("compose", "today");

    const { send, close, response: sseResponse } = createSSEStream();

    void (async () => {
      try {
        send({ type: "stage", label: "Reading today's pattern" });

        const freeAstroDailyContext =
          accessState.featureAccess.canGenerateUnlimitedToday
            ? await buildFreeAstroDailyContext(
                {
                  date: briefingInput.date,
                  currentTimezone: record.profile?.timezone ?? null,
                  birthTimezone: record.birthData?.birth_timezone ?? null,
                  birthLatitude: record.birthData?.birth_latitude ?? null,
                  birthLongitude: record.birthData?.birth_longitude ?? null,
                },
                { userId: user.id, tier: accessState.accessLevel, requestId },
              )
            : {
                chinese_current_pillars: null,
                vedic_panchang: null,
                notes: [],
                limitations: [],
              };

        const [blueprintRow, recentBriefingCount, calibrationResult] =
          await Promise.all([
            getBlueprintForUser(user.id, accessToken),
            countDailyBriefingsForUser(user.id, accessToken),
            // Pulls last 30 days of emoji ratings and returns a prompt fragment.
            // Returns `{fragment: null}` silently when the env flag is off or
            // the user has < 10 ratings in the window. See
            // domain/accuracy/calibration.service.ts for gate logic.
            buildCalibrationPromptFragment(user.id, accessToken).catch(
              (error) => {
                // Calibration must never block briefing generation. If the
                // rollup query fails (e.g. migration not applied yet), log
                // and proceed uncalibrated.
                console.error(
                  "[calibration_fragment_failed]",
                  error instanceof Error ? error.message : error,
                );
                return {
                  fragment: null,
                  reason: "disabled" as const,
                  totalRatings: 0,
                  nailedItRate: null,
                };
              },
            ),
          ]);
        const calibrationFragment = calibrationResult.fragment;
        const calibrationApplied = calibrationResult.reason === "applied";
        const formattedBlueprint = blueprintRow === null ? null : formatBlueprintForPage(blueprintRow);
        const { freeAstroDailyContext: generationFreeAstroDailyContext, blueprintContext } =
          buildTodayGenerationContext({
            featureAccess: accessState.featureAccess,
            freeAstroDailyContext,
            latestBlueprint: formattedBlueprint,
          });

        let westernPayload: unknown;
        let timingPayload: unknown;
        let synthesisOutput: BriefingOutput;
        let routingDecision: ReturnType<typeof getModelRoutingDecision> | null = null;
        let fallbackReason: string | null = null;
        let requestCostEstimateUsd: number | null = null;
        let requestCostIsEstimated = false;
        let stage2Sent = false;

        function sendStage2() {
          if (!stage2Sent) {
            stage2Sent = true;
            send({ type: "stage", label: "Shaping today's guidance" });
          }
        }

        const extractModel = getModelForPass("extract");

        try {
          const signalsStart = Date.now();
          const signalsResult = await generateTodaySignals({
            briefingInput,
            astrologyContext,
            numerologyContext,
            numerologySignal,
            freeAstroDailyContext: generationFreeAstroDailyContext,
            blueprintContext,
          });
          logLlmCost({
            meta: { ...signalsResult, duration_ms: Date.now() - signalsStart },
            feature: "today",
            passLabel: "signals",
            model: extractModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });
          const signals = signalsResult.data;

          if (hasStrongTodaySignals(signals) === false) {
            throw new Error("Today signals were too weak for frontier narrative.");
          }

          sendStage2();

          routingDecision = getModelRoutingDecision({
            feature: "today",
            signals: signals.routing,
            userContext: {
              isFreeUser: accessState.accessLevel === "free",
              hasBlueprint: blueprintRow !== null,
              recentUsageCount: recentBriefingCount,
            },
          });

          const narrativeStart = Date.now();
          const narrativeResult = routingDecision.useFrontier
            ? await generateTodayNarrativeFrontier({
                briefingInput,
                astrologyContext,
                numerologyContext,
                numerologySignal,
                freeAstroDailyContext: generationFreeAstroDailyContext,
                blueprintContext,
                signals,
                calibrationFragment,
              })
            : await generateTodayNarrativeCheap({
                briefingInput,
                astrologyContext,
                numerologyContext,
                numerologySignal,
                freeAstroDailyContext: generationFreeAstroDailyContext,
                blueprintContext,
                signals,
                calibrationFragment,
              });
          logLlmCost({
            meta: { ...narrativeResult, duration_ms: Date.now() - narrativeStart },
            feature: "today",
            passLabel: "narrative",
            model: routingDecision.useFrontier ? frontierModel.model : cheapModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });
          synthesisOutput = {
            ...narrativeResult.data,
            systems_agreement: signals.systems_agreement ?? null,
          };
          requestCostEstimateUsd = sumEstimatedCosts([
            signalsResult.estimatedCostUsd,
            narrativeResult.estimatedCostUsd,
          ]);
          requestCostIsEstimated =
            signalsResult.costIsEstimated || narrativeResult.costIsEstimated;
          westernPayload = signals;
          timingPayload = {
            source: "two_pass_signals",
            confidence: signals.confidence,
            timing_windows: signals.timing_windows,
            primary_opportunity: signals.primary_opportunity,
            primary_risk: signals.primary_risk,
          };

          await logRoutingEvent({
            request_id: requestId,
            timestamp: new Date().toISOString(),
            feature: "today",
            tier: accessState.accessLevel,
            platform,
            final_model_selected: routingDecision.useFrontier
              ? frontierModel.model
              : cheapModel.model,
            path_taken: routingDecision.useFrontier ? "synthesize_final" : "compose_final",
            fallback_triggered: false,
            fallback_reason: null,
            ...toRoutingEventScores(routingDecision.normalizedSignals),
            synthesisBurden: routingDecision.synthesisBurden,
            forced_frontier_reasons: routingDecision.forcedFrontierReasons,
            tone_preference: briefingInput.tone_preference,
          });
        } catch (error) {
          fallbackReason =
            error instanceof Error ? error.message : "Two-pass Today generation failed.";

          sendStage2();

          const westernRequest = buildWesternAgentRequest(
            briefingInput,
            astrologyContext,
          );
          const westernResult = await generateJsonObjectWithMeta({
            provider: frontierModel.provider,
            model: frontierModel.model,
            systemPrompt: westernRequest.systemPrompt,
            userPrompt: westernRequest.userPrompt,
            stepName: "western output generation",
            structuredOutput: westernRequest.structuredOutput,
          });
          logLlmCost({
            meta: westernResult,
            feature: "today",
            passLabel: "western",
            model: frontierModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });
          let westernOutput;

          try {
            westernOutput = validateWesternOutput(westernResult.parsedJson);
          } catch (error) {
            if (error instanceof ZodError) {
              throw new Error(
                `Schema validation failed for western output: ${error.issues
                  .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                  .join("; ")}`,
              );
            }

            throw error;
          }

          const westernModalitySignal = buildWesternModalitySignal(westernOutput);

          const timingRequest = buildTimingAgentRequest(
            briefingInput,
            astrologyContext,
            generationFreeAstroDailyContext,
          );
          const timingResult = await generateJsonObjectWithMeta({
            provider: frontierModel.provider,
            model: frontierModel.model,
            systemPrompt: timingRequest.systemPrompt,
            userPrompt: timingRequest.userPrompt,
            stepName: "timing output generation",
          });
          logLlmCost({
            meta: timingResult,
            feature: "today",
            passLabel: "timing",
            model: frontierModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });
          let timingOutput;

          try {
            timingOutput = validateTimingOutput(timingResult.parsedJson);
          } catch (error) {
            if (error instanceof ZodError) {
              throw new Error(
                `Schema validation failed for timing output: ${error.issues
                  .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                  .join("; ")}`,
              );
            }

            throw error;
          }

          const synthesisRequest = buildSynthesisAgentRequest({
            briefingInput,
            astrologyContext,
            numerologyContext,
            numerologySignal,
            freeAstroDailyContext: generationFreeAstroDailyContext,
            westernModalitySignal,
            westernOutput,
            timingOutput,
            calibrationFragment,
          });
          const synthesisResult = await generateJsonObjectWithMeta({
            provider: frontierModel.provider,
            model: frontierModel.model,
            systemPrompt: synthesisRequest.systemPrompt,
            userPrompt: synthesisRequest.userPrompt,
            maxOutputTokens: 1600,
            stepName: "final synthesis generation",
          });
          logLlmCost({
            meta: synthesisResult,
            feature: "today",
            passLabel: "synthesis",
            model: frontierModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });

          try {
            synthesisOutput = validateFinalSynthesisOutput(synthesisResult.parsedJson);
          } catch (error) {
            if (error instanceof ZodError) {
              throw new Error(
                `Schema validation failed for final synthesis output: ${error.issues
                  .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                  .join("; ")}`,
              );
            }

            throw error;
          }

          requestCostEstimateUsd = sumEstimatedCosts([
            westernResult.estimatedCostUsd,
            timingResult.estimatedCostUsd,
            synthesisResult.estimatedCostUsd,
          ]);
          requestCostIsEstimated =
            westernResult.costIsEstimated ||
            timingResult.costIsEstimated ||
            synthesisResult.costIsEstimated;
          westernPayload = westernOutput;
          timingPayload = timingOutput;

          await logRoutingEvent({
            request_id: requestId,
            timestamp: new Date().toISOString(),
            feature: "today",
            tier: accessState.accessLevel,
            platform,
            final_model_selected: frontierModel.model,
            path_taken: "full_fallback",
            fallback_triggered: true,
            fallback_reason: fallbackReason,
            ...toRoutingEventScores(routingDecision?.normalizedSignals),
            synthesisBurden: routingDecision?.synthesisBurden ?? null,
            forced_frontier_reasons: routingDecision?.forcedFrontierReasons ?? [],
            tone_preference: briefingInput.tone_preference,
          });
        }

        // Crisis detection — OUTPUT layer. Today has no user text input, so
        // this is pure defense-in-depth. If the model ever slips into
        // self-harm framing in a horoscope, we drop the output and fail
        // soft with a generic error — we do NOT flash Care Mode at a user
        // who didn't ask anything crisis-adjacent. We still log internally.
        const synthesisText = JSON.stringify(synthesisOutput);
        const outputCrisis = detectCrisisOutput(synthesisText);

        if (outputCrisis.triggered) {
          void logCrisisDetected({
            userId: user.id,
            feature: "today",
            platform,
            detection: outputCrisis,
            requestId,
          });

          send({
            type: "error",
            message:
              "We couldn't generate today's briefing. Please try again in a moment.",
          });
          return;
        }

        // Output safety classifier — 1.8. Same fail-soft pattern as crisis:
        // Today has no user text input, so we log + surface a generic error
        // rather than flash a safety card the user didn't provoke.
        const safetyCtx: SafetyClassifyContext = {
          userId: user.id,
          tier: accessState.accessLevel,
          feature: "today",
          requestId,
        };
        const outputSafety = await classifyOutputSafety(synthesisText, safetyCtx);

        if (outputSafety.verdict === "unsafe" && outputSafety.category !== null) {
          const preSaveFinalModel =
            fallbackReason !== null
              ? frontierModel.model
              : routingDecision?.useFrontier === true
                ? frontierModel.model
                : cheapModel.model;
          void logOutputSafetyFlagged({
            userId: user.id,
            feature: "today",
            platform,
            requestId,
            result: outputSafety,
            modelUsed: preSaveFinalModel,
          });
          void logOutputSafetyBlocked({
            userId: user.id,
            feature: "today",
            platform,
            requestId,
            result: outputSafety,
            modelUsed: preSaveFinalModel,
          });

          send({
            type: "error",
            message:
              "We couldn't generate today's briefing. Please try again in a moment.",
          });
          return;
        }

        const saveResult = await upsertDailyBriefing({
          userId: user.id,
          accessToken,
          briefingDate: date,
          astrologyContext,
          numerologyContext: { context: numerologyContext, signal: numerologySignal },
          freeAstroContext: generationFreeAstroDailyContext,
          westernPayload,
          timingPayload,
          synthesisPayload: synthesisOutput,
          generationAccessLevel: accessState.accessLevel,
        });

        if (saveResult.success === false) {
          throw new Error(saveResult.message);
        }

        if (accessState.accessLevel === "free") {
          void incrementUsageCount(user.id, todayPeriodKey, "today-refresh");
        }

        const finalModelSelected =
          fallbackReason !== null
            ? frontierModel.model
            : routingDecision?.useFrontier === true
              ? frontierModel.model
              : cheapModel.model;
        const generationPath =
          fallbackReason !== null
            ? "full_fallback"
            : routingDecision?.useFrontier === true
              ? "frontier_final"
              : "cheap_final";

        await logProductEvent({
          event_name: "today_generated",
          timestamp: new Date().toISOString(),
          user_id: user.id,
          tier: accessState.accessLevel,
          platform,
          feature: "today",
          plan_type: accessState.accessLevel === "free" ? "free" : "pro",
          upgrade_surface: null,
          request_id: requestId,
          final_model_selected: finalModelSelected,
          generation_path: generationPath,
          fallback_triggered: fallbackReason !== null,
          request_cost_estimate_usd: requestCostEstimateUsd,
          request_cost_is_estimated:
            requestCostEstimateUsd == null ? null : requestCostIsEstimated,
          is_first_use: recentBriefingCount === 0,
          repeat_within_24h: null,
          calibration_applied: calibrationApplied,
          calibration_rating_count: calibrationResult.totalRatings,
        });

        if (recentBriefingCount === 0) {
          await logProductEvent({
            event_name: "first_today_generated",
            timestamp: new Date().toISOString(),
            user_id: user.id,
            tier: accessState.accessLevel,
            platform,
            feature: "today",
            plan_type: accessState.accessLevel === "free" ? "free" : "pro",
            upgrade_surface: null,
            request_id: requestId,
            final_model_selected: finalModelSelected,
            generation_path: generationPath,
            fallback_triggered: fallbackReason !== null,
            request_cost_estimate_usd: null,
            request_cost_is_estimated: null,
            is_first_use: true,
            repeat_within_24h: null,
          });
        }

        revalidatePath("/dashboard");
        send({ type: "done", payload: { briefing: synthesisOutput } });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to generate briefing.";
        send({ type: "error", message });
      } finally {
        close();
      }
    })();

    return sseResponse;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate briefing.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
