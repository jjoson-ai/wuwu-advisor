import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { buildAstrologyContext } from "@/domain/astrology/context";
import {
  DailyBriefingInputSchema,
  type DailyBriefingInput,
} from "@/domain/astrology/schemas";
import { buildBaziContext, getBaziGateContext } from "@/domain/bazi/context.server";
import {
  buildChineseAstrologyContext,
  buildChineseAstrologySignal,
} from "@/domain/chinese_astrology/context";
import {
  buildBlueprintAgentRequest,
  validateBlueprintOutput,
} from "@/domain/blueprint/blueprint.agent";
import {
  getBlueprintForUser,
  upsertBlueprint,
} from "@/domain/blueprint/blueprint.service";
import { buildHumanDesignContext } from "@/domain/human_design/context";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { buildNumerologyContext } from "@/domain/numerology/context";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { generateJsonObjectWithMeta } from "@/lib/llm";
import { getModelForPass } from "@/lib/model-routing";
import { createSSEStream } from "@/lib/generation-stream";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";
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

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);
    const requestId = crypto.randomUUID();
    const platform = getRequestPlatform(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const record = await getOnboardingRecord(user.id, accessToken);
    const accessState = getRequestAccessState(user, request);

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
        { error: "Onboarding data is missing required blueprint fields." },
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
    const blueprintOutputDepth =
      accessState.featureAccess.canViewFullBlueprint ? "full" : "free";
    const baziInput = {
      birth_date: record.birthData?.birth_date,
      birth_time: record.birthData?.birth_time,
      birth_time_confidence: record.birthData?.birth_time_confidence,
      birth_city: record.birthData?.birth_city,
      birth_latitude: record.birthData?.birth_latitude ?? null,
      birth_longitude: record.birthData?.birth_longitude ?? null,
      bazi_calculation_marker: record.birthData?.bazi_calculation_marker ?? null,
    };
    const humanDesignContext = buildHumanDesignContext({
      birth_date: record.birthData?.birth_date,
      birth_time: record.birthData?.birth_time,
      birth_time_confidence: record.birthData?.birth_time_confidence,
      birth_latitude: record.birthData?.birth_latitude ?? null,
      birth_longitude: record.birthData?.birth_longitude ?? null,
      birth_timezone: record.birthData?.birth_timezone ?? null,
    });

    const { send, close, response: sseResponse } = createSSEStream();

    void (async () => {
      try {
        send({ type: "stage", label: "Reading your core pattern" });

        const baziContext =
          blueprintOutputDepth === "full"
            ? await buildBaziContext(baziInput)
            : getBaziGateContext(baziInput);

        const existingBlueprint = await getBlueprintForUser(user.id, accessToken);

        send({ type: "stage", label: "Building your blueprint" });

        const blueprintRequest = buildBlueprintAgentRequest({
          briefingInput,
          astrologyContext,
          numerologyContext,
          chineseAstrologyContext,
          chineseAstrologySignal,
          baziContext,
          humanDesignContext,
        }, blueprintOutputDepth);
        const blueprintModel = getModelForPass("synthesize");
        const blueprintResult = await generateJsonObjectWithMeta({
          provider: blueprintModel.provider,
          model: blueprintModel.model,
          systemPrompt: blueprintRequest.systemPrompt,
          userPrompt: blueprintRequest.userPrompt,
          stepName: "blueprint generation",
          structuredOutput: blueprintRequest.structuredOutput,
          maxOutputTokens: blueprintOutputDepth === "free" ? 1600 : 2400,
        });

        let blueprint;

        try {
          blueprint = validateBlueprintOutput(
            blueprintResult.parsedJson,
            blueprintOutputDepth,
          );
        } catch (error) {
          if (error instanceof ZodError) {
            throw new Error(
              `Schema validation failed for blueprint output: ${error.issues
                .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
                .join("; ")}`,
            );
          }

          throw error;
        }

        blueprint = {
          ...blueprint,
          bazi_signature: baziContext.chart === null
            ? {
                day_master: "unavailable",
                year_pillar: "unavailable",
                month_pillar: "unavailable",
                day_pillar: "unavailable",
                hour_pillar: "unavailable",
              }
            : {
                day_master: baziContext.chart.day_master,
                year_pillar: baziContext.chart.year_pillar,
                month_pillar: baziContext.chart.month_pillar,
                day_pillar: baziContext.chart.day_pillar,
                hour_pillar: baziContext.chart.hour_pillar,
              },
          human_design_signature: humanDesignContext.chart === null
            ? {
                type: "unavailable",
                authority: "unavailable",
                profile: "unavailable",
              }
            : {
                type: humanDesignContext.chart.type,
                authority: humanDesignContext.chart.authority,
                profile: humanDesignContext.chart.profile,
              },
        };

        const saveResult = await upsertBlueprint({
          userId: user.id,
          accessToken,
          blueprint,
          generationAccessLevel: accessState.accessLevel,
          baziDebug: {
            status: baziContext.status,
            gating_message: baziContext.gating_message,
            limitations: baziContext.limitations,
            integration_boundary: baziContext.integration_boundary,
            updated_at: new Date().toISOString(),
          },
        });

        if (saveResult.success === false) {
          throw new Error(saveResult.message);
        }

        await logProductEvent({
          event_name: "blueprint_generated",
          timestamp: new Date().toISOString(),
          user_id: user.id,
          tier: accessState.accessLevel,
          platform,
          feature: "blueprint",
          plan_type: accessState.accessLevel === "free" ? "free" : "pro",
          upgrade_surface: null,
          request_id: requestId,
          final_model_selected: blueprintModel.model,
          generation_path: "single_pass",
          fallback_triggered: false,
          request_cost_estimate_usd: blueprintResult.estimatedCostUsd,
          request_cost_is_estimated:
            blueprintResult.estimatedCostUsd == null
              ? null
              : blueprintResult.costIsEstimated,
          is_first_use: existingBlueprint === null,
          repeat_within_24h: null,
        });

        if (existingBlueprint === null) {
          await logProductEvent({
            event_name: "first_blueprint_generated",
            timestamp: new Date().toISOString(),
            user_id: user.id,
            tier: accessState.accessLevel,
            platform,
            feature: "blueprint",
            plan_type: accessState.accessLevel === "free" ? "free" : "pro",
            upgrade_surface: null,
            request_id: requestId,
            final_model_selected: blueprintModel.model,
            generation_path: "single_pass",
            fallback_triggered: false,
            request_cost_estimate_usd: null,
            request_cost_is_estimated: null,
            is_first_use: true,
            repeat_within_24h: null,
          });
        }

        send({ type: "done", payload: { blueprint: saveResult.blueprint } });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to generate blueprint.";
        send({ type: "error", message });
      } finally {
        close();
      }
    })();

    return sseResponse;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate blueprint.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
