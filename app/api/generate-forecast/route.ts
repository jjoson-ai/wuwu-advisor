import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { buildCalibrationPromptFragment } from "@/domain/accuracy/calibration.service";
import { buildAstrologyContext } from "@/domain/astrology/context";
import {
  DailyBriefingInputSchema,
  type DailyBriefingInput,
} from "@/domain/astrology/schemas";
import {
  buildChineseAstrologyContext,
  buildChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import {
  buildForecastAgentRequest,
  validateForecastOutput,
} from "@/domain/forecast/forecast.agent";
import {
  generateForecastNarrativeCheap,
  generateForecastNarrativeFrontier,
  generateForecastSignals,
  hasStrongForecastSignals,
} from "@/domain/forecast/forecast.two-pass.agent";
import { getForecastForUser, upsertForecast } from "@/domain/forecast/forecast.service";
import {
  buildForecastHorizon,
  type Forecast,
} from "@/domain/forecast/forecast.types";
import { formatBlueprintForPage } from "@/domain/blueprint/blueprint.formatter";
import { getBlueprintForUser } from "@/domain/blueprint/blueprint.service";
import { buildForecastGenerationContext } from "@/domain/generation/generation-context";
import { buildNumerologySignal } from "@/domain/numerology/numerology.agent";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
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
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { logLlmCost } from "@/lib/cost-events.server";
import { getModelRoutingDecision } from "@/lib/model-decision";
import { getModelForPass } from "@/lib/model-routing";
import { createSSEStream } from "@/lib/generation-stream";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";
import { toRoutingEventScores } from "@/lib/routing-events";
import { logRoutingEvent } from "@/lib/routing-events.server";
import { isSupportedTimeZone } from "@/lib/timezones";

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

function sumEstimatedCosts(values: Array<number | null | undefined>) {
  const presentValues = values.filter((value): value is number => value != null);

  if (presentValues.length === 0) {
    return null;
  }

  return Number(presentValues.reduce((sum, value) => sum + value, 0).toFixed(6));
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
        { error: "Onboarding data is missing required forecast fields." },
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
    const chineseAstrologyContext = buildChineseAstrologyContext({
      birth_date: briefingInput.birth_date,
    });
    const chineseAstrologySignal =
      buildChineseAstrologySignal(chineseAstrologyContext);
    const horizon = buildForecastHorizon(briefingInput.date);
    const accessState = getRequestAccessState(user, request);
    const frontierModel = getModelForPass("synthesize");
    const cheapModel = getModelForPass("compose", "forecast");

    const { send, close, response: sseResponse } = createSSEStream();

    void (async () => {
      try {
        send({ type: "stage", label: "Reading the month ahead" });

        const [blueprintRow, latestForecastRow, calibrationResult] =
          await Promise.all([
            getBlueprintForUser(user.id, accessToken),
            getForecastForUser(user.id, accessToken),
            // Per-user calibration fragment. See briefing route for the
            // same pattern + failure mode (must never block generation).
            buildCalibrationPromptFragment(user.id, accessToken).catch(
              (error) => {
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
        const generationContext = buildForecastGenerationContext({
          featureAccess: accessState.featureAccess,
          chineseAstrologyContext,
          chineseAstrologySignal,
          horizon,
          latestBlueprint: formattedBlueprint,
        });
        const forecastOutputDepth =
          accessState.featureAccess.canViewFullForecast ? "full" : "free";

        const forecastInput = {
          briefingInput,
          astrologyContext,
          numerologyContext,
          chineseAstrologyContext: generationContext.chineseAstrologyContext,
          chineseAstrologySignal: generationContext.chineseAstrologySignal,
          horizon: generationContext.horizon,
          blueprintContext: generationContext.blueprintContext,
          calibrationFragment,
        };

        let forecast: Forecast;
        let routingDecision: ReturnType<typeof getModelRoutingDecision> | null = null;
        let fallbackReason: string | null = null;
        let requestCostEstimateUsd: number | null = null;
        let requestCostIsEstimated = false;
        let stage2Sent = false;

        function sendStage2() {
          if (!stage2Sent) {
            stage2Sent = true;
            send({ type: "stage", label: "Mapping the current phase" });
          }
        }

        const extractModel = getModelForPass("extract");

        try {
          const signalsStart = Date.now();
          const signalsResult = await generateForecastSignals(forecastInput);
          logLlmCost({
            meta: { ...signalsResult, duration_ms: Date.now() - signalsStart },
            feature: "forecast",
            passLabel: "signals",
            model: extractModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });
          const signals = signalsResult.data;

          if (hasStrongForecastSignals(signals) === false) {
            throw new Error("Forecast signals were too weak for frontier narrative.");
          }

          sendStage2();

          routingDecision = getModelRoutingDecision({
            feature: "forecast",
            signals: signals.routing,
            userContext: {
              isFreeUser: accessState.accessLevel === "free",
              hasBlueprint: blueprintRow !== null,
              recentUsageCount: latestForecastRow === null ? 0 : 1,
            },
          });

          const narrativeStart = Date.now();
          const narrativeResult = routingDecision.useFrontier
            ? await generateForecastNarrativeFrontier({
                ...forecastInput,
                signals,
              }, forecastOutputDepth)
            : await generateForecastNarrativeCheap({
                ...forecastInput,
                signals,
              }, forecastOutputDepth);
          logLlmCost({
            meta: { ...narrativeResult, duration_ms: Date.now() - narrativeStart },
            feature: "forecast",
            passLabel: "narrative",
            model: routingDecision.useFrontier ? frontierModel.model : cheapModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });
          forecast = narrativeResult.data;
          requestCostEstimateUsd = sumEstimatedCosts([
            signalsResult.estimatedCostUsd,
            narrativeResult.estimatedCostUsd,
          ]);
          requestCostIsEstimated =
            signalsResult.costIsEstimated || narrativeResult.costIsEstimated;

          await logRoutingEvent({
            request_id: requestId,
            timestamp: new Date().toISOString(),
            feature: "forecast",
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
            error instanceof Error ? error.message : "Two-pass Forecast generation failed.";

          sendStage2();

          const forecastRequest = buildForecastAgentRequest(
            forecastInput,
            forecastOutputDepth,
          );
          const forecastResult = await generateJsonObjectWithMeta({
            provider: frontierModel.provider,
            model: frontierModel.model,
            systemPrompt: forecastRequest.systemPrompt,
            userPrompt: forecastRequest.userPrompt,
            stepName: "forecast generation",
            structuredOutput: forecastRequest.structuredOutput,
            maxOutputTokens: forecastOutputDepth === "free" ? 900 : 2500,
          });
          logLlmCost({
            meta: forecastResult,
            feature: "forecast",
            passLabel: "narrative",
            model: frontierModel.model,
            userId: user.id,
            tier: accessState.accessLevel,
            requestId,
          });

          try {
            forecast = validateForecastOutput(
              forecastResult.parsedJson,
              forecastOutputDepth,
            );
          } catch (error) {
            if (error instanceof ZodError) {
              throw new Error(
                `Schema validation failed for forecast output: ${error.issues
                  .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                  .join("; ")}`,
              );
            }

            throw error;
          }

          requestCostEstimateUsd = forecastResult.estimatedCostUsd;
          requestCostIsEstimated = forecastResult.costIsEstimated;

          await logRoutingEvent({
            request_id: requestId,
            timestamp: new Date().toISOString(),
            feature: "forecast",
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

        // Crisis detection — OUTPUT layer. Pure defense-in-depth (forecast
        // has no user text input). On trigger we log internally and fail
        // soft; we do not show Care Mode UI to a user who didn't ask a
        // crisis-adjacent question.
        const forecastText = JSON.stringify(forecast);
        const outputCrisis = detectCrisisOutput(forecastText);

        if (outputCrisis.triggered) {
          void logCrisisDetected({
            userId: user.id,
            feature: "forecast",
            platform,
            detection: outputCrisis,
            requestId,
          });

          send({
            type: "error",
            message:
              "We couldn't generate your forecast. Please try again in a moment.",
          });
          return;
        }

        // Output safety classifier — 1.8. Same fail-soft pattern as crisis:
        // Forecast has no user text input, so we log + surface a generic
        // error rather than flash a safety card the user didn't provoke.
        const safetyCtx: SafetyClassifyContext = {
          userId: user.id,
          tier: accessState.accessLevel,
          feature: "forecast",
          requestId,
        };
        const outputSafety = await classifyOutputSafety(forecastText, safetyCtx);

        if (outputSafety.verdict === "unsafe" && outputSafety.category !== null) {
          const preSaveFinalModel =
            fallbackReason !== null
              ? frontierModel.model
              : routingDecision?.useFrontier === true
                ? frontierModel.model
                : cheapModel.model;
          void logOutputSafetyFlagged({
            userId: user.id,
            feature: "forecast",
            platform,
            requestId,
            result: outputSafety,
            modelUsed: preSaveFinalModel,
          });
          void logOutputSafetyBlocked({
            userId: user.id,
            feature: "forecast",
            platform,
            requestId,
            result: outputSafety,
            modelUsed: preSaveFinalModel,
          });

          send({
            type: "error",
            message:
              "We couldn't generate your forecast. Please try again in a moment.",
          });
          return;
        }

        const saveResult = await upsertForecast({
          userId: user.id,
          accessToken,
          forecast,
          numerologyContext: { context: numerologyContext, signal: numerologySignal },
          generationAccessLevel: accessState.accessLevel,
        });

        if (saveResult.success === false) {
          throw new Error(saveResult.message);
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
          event_name: "forecast_generated",
          timestamp: new Date().toISOString(),
          user_id: user.id,
          tier: accessState.accessLevel,
          platform,
          feature: "forecast",
          plan_type: accessState.accessLevel === "free" ? "free" : "pro",
          upgrade_surface: null,
          request_id: requestId,
          final_model_selected: finalModelSelected,
          generation_path: generationPath,
          fallback_triggered: fallbackReason !== null,
          request_cost_estimate_usd: requestCostEstimateUsd,
          request_cost_is_estimated:
            requestCostEstimateUsd == null ? null : requestCostIsEstimated,
          is_first_use: latestForecastRow === null,
          repeat_within_24h: null,
          calibration_applied: calibrationApplied,
          calibration_rating_count: calibrationResult.totalRatings,
        });

        if (latestForecastRow === null) {
          await logProductEvent({
            event_name: "first_forecast_generated",
            timestamp: new Date().toISOString(),
            user_id: user.id,
            tier: accessState.accessLevel,
            platform,
            feature: "forecast",
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

        send({ type: "done", payload: { forecast: saveResult.forecast } });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to generate forecast.";
        send({ type: "error", message });
      } finally {
        close();
      }
    })();

    return sseResponse;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate forecast.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
