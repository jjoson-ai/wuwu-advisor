"use server";

import { redirect } from "next/navigation";

import {
  AGE_GATE_COPPA_AGE,
  AGE_GATE_MINIMUM_AGE,
  computeAgeInYears,
  isAtLeastAge,
} from "@/domain/safety/age-gate";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logProductEvent } from "@/lib/product-events.server";
import { getUserAccessLevel } from "@/lib/access";

/**
 * Handles a DOB submission from /age-gate.
 *
 * Decision tree:
 *   1. DOB un-parseable, calendar-invalid, or future-dated → redirect
 *      back to /age-gate with ?error={invalid|future}. No auth change.
 *   2. Age < AGE_GATE_MINIMUM_AGE (18) → HARD BLOCK. Delete auth user
 *      via admin API (CASCADE removes all related rows), sign out the
 *      server session, log `age_gate_rejected_dob`, redirect to the
 *      declined page. The account no longer exists; the same email can
 *      sign up again.
 *   3. Age >= 18 → write `age_verified_dob: true`, the DOB itself, and
 *      `age_verified_at` into app_metadata. Log `age_gate_confirmed`.
 *      Redirect to `next` (sanitized to a relative path).
 *
 * For under-COPPA (under-13) submissions we still take the same delete
 * path but tag the rejection reason differently so ops can audit the
 * two populations separately.
 *
 * Under-18 deletion is immediate and irreversible (per cascade). We
 * accept that a user who lies about their DOB can simply retry — the
 * legal standard is "reasonable effort and no actual knowledge," not
 * "perfect prevention."
 */
export async function submitDobAction(
  next: string,
  formData: FormData,
): Promise<never> {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  const rawDob = formData.get("dob");
  const dob = typeof rawDob === "string" ? rawDob.trim() : "";

  const now = new Date();
  const age = computeAgeInYears(dob, now);

  // Invalid input: bounce back to the form with an error hint. Do NOT
  // alter auth state — a parse failure doesn't tell us anything legal.
  if (age === null) {
    const nextParam = encodeURIComponent(safeNext);
    redirect(`/age-gate?next=${nextParam}&error=invalid`);
  }

  const isAdult = isAtLeastAge(dob, AGE_GATE_MINIMUM_AGE, now);

  if (isAdult) {
    // Accept.
    const supabaseAdmin = getSupabaseAdminClient();

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        age_verified: true,
        age_verified_dob: true,
        age_verified_at: now.toISOString(),
        // Store DOB for audit + to prefill birth_date at onboarding.
        // app_metadata is admin-only, not exposed to the client.
        dob,
      },
    });

    await logProductEvent({
      event_name: "age_gate_confirmed",
      timestamp: now.toISOString(),
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

    redirect(safeNext);
  }

  // Reject: under-18. Delete the auth user, cascading removal of any
  // rows that may have been inserted during the brief window between
  // signup and DOB submission.
  await rejectUnderMinimum({ userId: user.id, age, now });
  redirect("/age-gate/declined");
}

/**
 * Performs the delete-and-log path for under-minimum users.
 *
 * Kept as a standalone function so the onboarding defense-in-depth
 * re-check can reuse the same deletion semantics.
 */
async function rejectUnderMinimum(params: {
  userId: string;
  age: number;
  now: Date;
}): Promise<void> {
  const { userId, age, now } = params;

  // Log BEFORE deletion so we retain the audit row even though
  // product_events.user_id FK will be set to null by ON DELETE SET NULL.
  await logProductEvent({
    event_name: "age_gate_rejected_dob",
    timestamp: now.toISOString(),
    user_id: userId,
    tier: null,
    platform: "web",
    feature: null,
    plan_type: null,
    upgrade_surface: age < AGE_GATE_COPPA_AGE ? "coppa_under_13" : "sb243_under_18",
    request_id: null,
    final_model_selected: null,
    generation_path: null,
    fallback_triggered: null,
    request_cost_estimate_usd: null,
    request_cost_is_estimated: null,
    is_first_use: null,
    repeat_within_24h: null,
  }).catch((err) => {
    console.error("[age-gate] Failed to log rejection — proceeding with delete:", err);
  });

  const supabaseAdmin = getSupabaseAdminClient();

  // Revoke server session first so cookies are cleared before we
  // invalidate the user. If the admin delete fails, we still want the
  // user signed out.
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[age-gate] signOut failed — proceeding with delete:", err);
  }

  const deleteResult = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteResult.error !== null) {
    console.error(
      "[age-gate] admin.deleteUser failed for rejected under-minimum account:",
      deleteResult.error,
    );
    // We've already signed out and the user will be redirected to the
    // declined page. Fail open: declined-page render is more important
    // than a clean delete, which we can mop up via ops.
  }
}

/**
 * Legacy "I'm under 17" button flow — retained for any stale links.
 * Identical deletion semantics to the DOB rejection path, but tagged
 * differently in telemetry.
 */
export async function declineAgeAction(): Promise<never> {
  const user = await getCurrentUser();

  if (user !== null) {
    const supabaseAdmin = getSupabaseAdminClient();

    await logProductEvent({
      event_name: "age_gate_declined",
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
    }).catch(() => {
      // Non-fatal — proceed with sign-out even if logging fails.
    });

    try {
      const supabase = await getSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Non-fatal.
    }

    // Also delete the (empty) account — self-declared minors get the
    // same treatment as DOB-verified minors. No rows should exist
    // beyond the auth record itself, so this is near-instant.
    await supabaseAdmin.auth.admin.deleteUser(user.id).catch(() => {});
  }

  redirect("/age-gate/declined");
}
