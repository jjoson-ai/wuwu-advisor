"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { saveOnboardingInputForUser } from "@/domain/profile/profile.onboarding";
import {
  AGE_GATE_COPPA_AGE,
  AGE_GATE_MINIMUM_AGE,
  computeAgeInYears,
  isAtLeastAge,
} from "@/domain/safety/age-gate";
import { getUserAccessLevel } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { logProductEvent } from "@/lib/product-events.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOnboardingInputFromFormData,
  validateOnboardingInput,
} from "@/lib/validations";

export type OnboardingActionState = {
  error: string | null;
};

export async function saveOnboardingAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const previousRecord = await getOnboardingRecord(user.id);
  const wasOnboardingComplete = isOnboardingComplete(previousRecord);

  const input = getOnboardingInputFromFormData(formData);
  const validation = validateOnboardingInput(input);

  if (validation.success === false) {
    return { error: validation.message };
  }

  // Defense-in-depth: the onboarding form collects its own birthDate. If
  // that value implies the user is under AGE_GATE_MINIMUM_AGE, treat the
  // signal as authoritative regardless of any prior age_verified_dob
  // flag — either the flag was set wrong or the user lied at /age-gate.
  // Delete the account the same way /age-gate does. We never redirect to
  // a profile write that contradicts the age gate.
  const now = new Date();
  if (isAtLeastAge(input.birthDate, AGE_GATE_MINIMUM_AGE, now) === false) {
    const age = computeAgeInYears(input.birthDate, now);

    await logProductEvent({
      event_name: "age_gate_rejected_onboarding",
      timestamp: now.toISOString(),
      user_id: user.id,
      tier: null,
      platform: "web",
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
    }).catch((err) => {
      console.error(
        "[onboarding] Failed to log age-gate onboarding rejection:",
        err,
      );
    });

    try {
      const supabase = await getSupabaseServerClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[onboarding] signOut failed — proceeding with delete:", err);
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const deleteResult = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteResult.error !== null) {
      console.error(
        "[onboarding] admin.deleteUser failed for rejected under-minimum account:",
        deleteResult.error,
      );
    }

    redirect("/age-gate/declined");
  }

  const result = await saveOnboardingInputForUser(user.id, input);

  if (result.success === false) {
    return { error: result.message };
  }

  const nextRecord = await getOnboardingRecord(user.id);
  const isNowOnboardingComplete = isOnboardingComplete(nextRecord);

  if (wasOnboardingComplete === false && isNowOnboardingComplete) {
    await logProductEvent({
      event_name: "onboarding_completed",
      timestamp: new Date().toISOString(),
      user_id: user.id,
      tier: getUserAccessLevel(user),
      platform: "web",
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

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  redirect("/dashboard");
}
