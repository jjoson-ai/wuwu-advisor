import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { buildAstrologyContext } from "@/domain/astrology/context";
import {
  DailyBriefingInputSchema,
  type DailyBriefingInput,
} from "@/domain/astrology/schemas";
import { formatBlueprintForPage } from "@/domain/blueprint/blueprint.formatter";
import { getBlueprintForUser } from "@/domain/blueprint/blueprint.service";
import {
  buildChineseAstrologyContext,
  buildChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import { classifyDecisionQuestion } from "@/domain/decision/decision.classifier";
import { classifyDecisionFeasibility } from "@/domain/decision/decision.feasibility";
import {
  classifyDecisionHorizon,
  getContextEmphasis,
} from "@/domain/decision/decision.horizon";
import { classifyDecisionIntent } from "@/domain/decision/decision.intent";
import {
  buildDecisionSafetyResponse,
  classifyDecisionSafety,
} from "@/domain/decision/decision.safety";
import {
  buildDecisionAgentRequest,
  validateDecisionGuidanceOutput,
} from "@/domain/decision/decision.agent";
import {
  generateAskGuidanceCheap,
  generateAskGuidanceFrontier,
  generateAskSignals,
  hasStrongDecisionSignals,
} from "@/domain/decision/decision.two-pass.agent";
import {
  countDecisionGuidanceForUser,
  getLatestDecisionGuidanceForUser,
  insertDecisionGuidance,
} from "@/domain/decision/decision.service";
import type { DecisionGuidance } from "@/domain/decision/decision.types";
import { formatForecastForPage } from "@/domain/forecast/forecast.formatter";
import { getForecastForUser } from "@/domain/forecast/forecast.service";
import { buildAskGenerationContext } from "@/domain/generation/generation-context";
import { buildNumerologySignal } from "@/domain/numerology/numerology.agent";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelRoutingDecision } from "@/lib/model-decision";
import { getModelForPass } from "@/lib/model-routing";
import { createSSEStream } from "@/lib/generation-stream";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";
import { toRoutingEventScores } from "@/lib/routing-events";
import { logRoutingEvent } from "@/lib/routing-events.server";
import { getLatestBriefingForUser } from "@/domain/briefing/briefing.service";
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

function normalizeQuestionForInstrumentation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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

    const body = (await request.json()) as { question?: unknown };
    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    if (question === "") {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 },
      );
    }

    const safetyCategory = classifyDecisionSafety(question);

    if (safetyCategory !== "normal") {
      return NextResponse.json({
        safety: buildDecisionSafetyResponse(safetyCategory),
      });
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
        { error: "Onboarding data is missing required decision fields." },
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
    const decisionType = classifyDecisionQuestion(question);
    const decisionHorizon = classifyDecisionHorizon(question, decisionType);
    const decisionIntent = classifyDecisionIntent(question);
    const decisionFeasibility = classifyDecisionFeasibility(question);
    const contextEmphasis = getContextEmphasis(decisionHorizon);
    const accessState = getRequestAccessState(user, request);
    const frontierModel = getModelForPass("synthesize");
    const cheapModel = getModelForPass("compose");

    const { send, close, response: sseResponse } = createSSEStream();

    void (async () => {
      try {
        send({ type: "stage", label: "Weighing your question" });

        const [
          latestBriefing,
          latestForecastRow,
          latestBlueprintRow,
          latestDecisionGuidance,
          recentAskCount,
        ] = await Promise.all([
          getLatestBriefingForUser(user.id, accessToken),
          getForecastForUser(user.id, accessToken),
          getBlueprintForUser(user.id, accessToken),
          getLatestDecisionGuidanceForUser(user.id, accessToken),
          countDecisionGuidanceForUser(user.id, accessToken),
        ]);
        const formattedForecast =
          latestForecastRow === null ? null : formatForecastForPage(latestForecastRow);
        const formattedBlueprint =
          latestBlueprintRow === null ? null : formatBlueprintForPage(latestBlueprintRow);
        const generationContext = buildAskGenerationContext({
          featureAccess: accessState.featureAccess,
          latestBriefing: latestBriefing?.synthesis_payload_json ?? null,
          latestForecast: formattedForecast,
          latestBlueprint: formattedBlueprint,
        });

        const decisionInput = {
          question,
          decisionType,
          decisionHorizon,
          decisionIntent,
          decisionFeasibility,
          contextEmphasis,
          briefingInput,
          astrologyContext,
          numerologyContext,
          chineseAstrologyContext,
          chineseAstrologySignal,
          latestBriefing: generationContext.latestBriefing,
          latestForecast: generationContext.latestForecast,
          latestBlueprint: generationContext.latestBlueprint,
        };

        let guidance: DecisionGuidance;
        let routingDecision: ReturnType<typeof getModelRoutingDecision> | null = null;
        let fallbackReason: string | null = null;
        let requestCostEstimateUsd: number | null = null;
        let requestCostIsEstimated = false;
        let stage2Sent = false;

        function sendStage2() {
          if (!stage2Sent) {
            stage2Sent = true;
            send({ type: "stage", label: "Shaping your guidance" });
          }
        }

        try {
          const signalsResult = await generateAskSignals(decisionInput);
          const signals = signalsResult.data;

          if (hasStrongDecisionSignals(signals) === false) {
            throw new Error("Decision signals were too weak for frontier guidance.");
          }

          sendStage2();

          routingDecision = getModelRoutingDecision({
            feature: "ask",
            signals: signals.routing,
            userContext: {
              isFreeUser: accessState.accessLevel === "free",
              hasBlueprint: latestBlueprintRow !== null,
              recentUsageCount: recentAskCount,
            },
          });

          const guidanceResult = routingDecision.useFrontier
            ? await generateAskGuidanceFrontier({
                ...decisionInput,
                signals,
              })
            : await generateAskGuidanceCheap({
                ...decisionInput,
                signals,
              });
          guidance = guidanceResult.data;
          requestCostEstimateUsd = sumEstimatedCosts([
            signalsResult.estimatedCostUsd,
            guidanceResult.estimatedCostUsd,
          ]);
          requestCostIsEstimated =
            signalsResult.costIsEstimated || guidanceResult.costIsEstimated;

          await logRoutingEvent({
            request_id: requestId,
            timestamp: new Date().toISOString(),
            feature: "ask",
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
            error instanceof Error ? error.message : "Two-pass Ask generation failed.";

          sendStage2();

          const decisionRequest = buildDecisionAgentRequest(decisionInput);

          const decisionResult = await generateJsonObjectWithMeta({
            provider: frontierModel.provider,
            model: frontierModel.model,
            systemPrompt: decisionRequest.systemPrompt,
            userPrompt: decisionRequest.userPrompt,
            stepName: "decision guidance generation",
            structuredOutput: decisionRequest.structuredOutput,
            maxOutputTokens: 1400,
          });

          try {
            guidance = validateDecisionGuidanceOutput(decisionResult.parsedJson);
          } catch (error) {
            if (error instanceof ZodError) {
              throw new Error(
                `Schema validation failed for decision guidance output: ${error.issues
                  .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                  .join("; ")}`,
              );
            }

            throw error;
          }

          requestCostEstimateUsd = decisionResult.estimatedCostUsd;
          requestCostIsEstimated = decisionResult.costIsEstimated;

          await logRoutingEvent({
            request_id: requestId,
            timestamp: new Date().toISOString(),
            feature: "ask",
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

        const saveResult = await insertDecisionGuidance({
          userId: user.id,
          accessToken,
          questionText: question,
          decisionType,
          decisionHorizon,
          decisionIntent,
          decisionFeasibility,
          guidance,
          numerologyContext: { context: numerologyContext, signal: numerologySignal },
          generationAccessLevel: accessState.accessLevel,
        });

        if (saveResult.success === false) {
          throw new Error(saveResult.message);
        }

        const repeatedAskWithin24Hours =
          latestDecisionGuidance !== null &&
          Date.now() - new Date(latestDecisionGuidance.created_at).getTime() <=
            24 * 60 * 60 * 1000;
        const isAskRegeneration =
          latestDecisionGuidance !== null &&
          normalizeQuestionForInstrumentation(latestDecisionGuidance.question_text) ===
            normalizeQuestionForInstrumentation(question);
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
          event_name: "ask_submitted",
          timestamp: new Date().toISOString(),
          user_id: user.id,
          tier: accessState.accessLevel,
          platform,
          feature: "ask",
          plan_type: accessState.accessLevel === "free" ? "free" : "pro",
          upgrade_surface: null,
          request_id: requestId,
          final_model_selected: finalModelSelected,
          generation_path: generationPath,
          fallback_triggered: fallbackReason !== null,
          request_cost_estimate_usd: requestCostEstimateUsd,
          request_cost_is_estimated:
            requestCostEstimateUsd == null ? null : requestCostIsEstimated,
          is_first_use: recentAskCount === 0,
          repeat_within_24h: repeatedAskWithin24Hours,
        });

        if (recentAskCount === 0) {
          await logProductEvent({
            event_name: "first_ask_submitted",
            timestamp: new Date().toISOString(),
            user_id: user.id,
            tier: accessState.accessLevel,
            platform,
            feature: "ask",
            plan_type: accessState.accessLevel === "free" ? "free" : "pro",
            upgrade_surface: null,
            request_id: requestId,
            final_model_selected: finalModelSelected,
            generation_path: generationPath,
            fallback_triggered: fallbackReason !== null,
            request_cost_estimate_usd: null,
            request_cost_is_estimated: null,
            is_first_use: true,
            repeat_within_24h: repeatedAskWithin24Hours,
          });
        } else if (isAskRegeneration) {
          await logProductEvent({
            event_name: "ask_regenerated",
            timestamp: new Date().toISOString(),
            user_id: user.id,
            tier: accessState.accessLevel,
            platform,
            feature: "ask",
            plan_type: accessState.accessLevel === "free" ? "free" : "pro",
            upgrade_surface: null,
            request_id: requestId,
            final_model_selected: finalModelSelected,
            generation_path: generationPath,
            fallback_triggered: fallbackReason !== null,
            request_cost_estimate_usd: null,
            request_cost_is_estimated: null,
            is_first_use: false,
            repeat_within_24h: repeatedAskWithin24Hours,
          });
        }

        revalidatePath("/decision");
        send({
          type: "done",
          payload: {
            guidance: saveResult.guidance,
            conversationId: saveResult.conversationId,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to generate decision guidance.";
        send({ type: "error", message });
      } finally {
        close();
      }
    })();

    return sseResponse;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate decision guidance.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
