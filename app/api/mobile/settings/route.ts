import { NextResponse } from "next/server";

import type {
  MobileSettingsResponse,
  MobileSettingsWriteRequest,
} from "@/domain/mobile/mobile.types";
import { saveOnboardingInputForUser } from "@/domain/profile/profile.onboarding";
import {
  getOnboardingInputFromRecord,
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getRequestAuth } from "@/lib/auth";
import { getRequestAccessState } from "@/lib/debug-access";
import { getRequestPlatform } from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";
import {
  getOnboardingInputFromObject,
  validateOnboardingInput,
} from "@/lib/validations";
import {
  AGE_GATE_COPPA_AGE,
  AGE_GATE_MINIMUM_AGE,
  computeAgeInYears,
  isAtLeastAge,
} from "@/domain/safety/age-gate";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const record = await getOnboardingRecord(user.id, accessToken);
    const access = getRequestAccessState(user, request);
    const response: MobileSettingsResponse = {
      settings: getOnboardingInputFromRecord(record),
      onboardingComplete: isOnboardingComplete(record),
      accessLevel: access.accessLevel,
      featureAccess: access.featureAccess,
      dailyUsageLimits: access.dailyUsageLimits,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load settings.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as MobileSettingsWriteRequest;
    const input = getOnboardingInputFromObject(body);
    const validation = validateOnboardingInput(input);

    if (validation.success === false) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const now = new Date();
    if (isAtLeastAge(input.birthDate, AGE_GATE_MINIMUM_AGE, now) === false) {
      const age = computeAgeInYears(input.birthDate, now);

      void logProductEvent({
        event_name: "age_gate_rejected_onboarding",
        timestamp: now.toISOString(),
        user_id: user.id,
        tier: null,
        platform: getRequestPlatform(request),
        feature: null,
        plan_type: null,
        upgrade_surface:
          age !== null && age < AGE_GATE_COPPA_AGE
            ? "coppa_under_13"
            : "sb243_under_18",
        request_id: null,
        final_model_selected: null,
        generation_path: null,
        fallback_triggered: null,
        request_cost_estimate_usd: null,
        request_cost_is_estimated: null,
        is_first_use: null,
        repeat_within_24h: null,
      });

      const supabaseAdmin = getSupabaseAdminClient();
      const deleteResult = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteResult.error !== null) {
        console.error(
          "[mobile/settings] admin.deleteUser failed for under-age account:",
          deleteResult.error,
        );
      }

      return NextResponse.json(
        {
          error: "Onboarding requires age 18 or older. Account removed.",
          age_gate_rejected: true,
        },
        { status: 403 },
      );
    }

    const previousRecord = await getOnboardingRecord(user.id, accessToken);
    const wasOnboardingComplete = isOnboardingComplete(previousRecord);

    const result = await saveOnboardingInputForUser(user.id, input, accessToken);

    if (result.success === false) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    const record = await getOnboardingRecord(user.id, accessToken);
    const access = getRequestAccessState(user, request);
    const onboardingComplete = isOnboardingComplete(record);

    if (wasOnboardingComplete === false && onboardingComplete) {
      await logProductEvent({
        event_name: "onboarding_completed",
        timestamp: new Date().toISOString(),
        user_id: user.id,
        tier: access.accessLevel,
        platform: getRequestPlatform(request),
        feature: null,
        plan_type: null,
        upgrade_surface: null,
        request_id: null,
        final_model_selected: null,
        generation_path: null,
        fallback_triggered: null,
        request_cost_estimate_usd: null,
        request_cost_is_estimated: null,
        is_first_use: null,
        repeat_within_24h: null,
      });
    }

    const response: MobileSettingsResponse = {
      settings: getOnboardingInputFromRecord(record),
      onboardingComplete,
      accessLevel: access.accessLevel,
      featureAccess: access.featureAccess,
      dailyUsageLimits: access.dailyUsageLimits,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save settings.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
