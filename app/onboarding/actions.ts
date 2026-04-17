"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { saveOnboardingInputForUser } from "@/domain/profile/profile.onboarding";
import { getUserAccessLevel } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { logProductEvent } from "@/lib/product-events.server";
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
