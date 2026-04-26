import "server-only";

import {
  buildFragmentFromSnapshot,
  isCalibrationEnabled,
  MAX_THEMES_PER_SIDE,
  MIN_CALIBRATION_RATINGS,
  MIN_TOUCHES_PER_THEME,
} from "@/domain/accuracy/calibration.core";
import { getAccuracyReportForUser } from "@/domain/accuracy/accuracy.service";

/**
 * 5.2 Phase C — per-user prompt calibration (runtime entry point).
 *
 * Takes a user's last-30d emoji rating rollup and turns it into a small
 * system-prompt fragment the synthesis + forecast LLMs see alongside the
 * usual rules. The fragment describes which themes tend to land for this
 * user and which don't, and tells the model how to adjust framing without
 * reducing or skipping any card.
 *
 * Intentional design choices:
 *   - Off by default. Gated behind ACCURACY_CALIBRATION_ENABLED env flag so
 *     we can ship the wiring and turn it on once data volume is real.
 *   - Minimum 10 emoji ratings in the 30-day window before we inject — below
 *     that the signal is noise and we risk leaning the model in a dumb
 *     direction for users who have only rated a handful of days.
 *   - Calibration is framed as "be more concrete, not less present" to
 *     defuse the self-fulfilling-prophecy trap. Missed themes should be
 *     rewritten sharper, NOT dropped.
 *
 * The pure fragment-building logic lives in `calibration.core.ts` so it can
 * be unit-tested without pulling in server-only Supabase code.
 */

export type CalibrationGateReason =
  | "disabled"
  | "insufficient_data"
  | "no_theme_signal"
  | "applied";

export type CalibrationResult = {
  fragment: string | null;
  reason: CalibrationGateReason;
  // Kept for product-event logging so /ops can see who is getting calibrated.
  totalRatings: number;
  nailedItRate: number | null;
};

/**
 * Build the per-user calibration system-prompt fragment.
 *
 * Returns `{ fragment: null, reason }` whenever calibration should not be
 * injected — the caller spreads nothing into the prompt in that case. The
 * reason is returned for product-event logging so /ops can see why a given
 * request wasn't calibrated.
 */
export async function buildCalibrationPromptFragment(
  userId: string,
  accessToken?: string | null,
  nowOverride?: Date,
): Promise<CalibrationResult> {
  if (!isCalibrationEnabled()) {
    return {
      fragment: null,
      reason: "disabled",
      totalRatings: 0,
      nailedItRate: null,
    };
  }

  const report = await getAccuracyReportForUser(
    userId,
    accessToken,
    nowOverride,
  );
  const snapshot = report.snapshot30d;

  if (snapshot.totalRatings < MIN_CALIBRATION_RATINGS) {
    return {
      fragment: null,
      reason: "insufficient_data",
      totalRatings: snapshot.totalRatings,
      nailedItRate: snapshot.nailedItRate,
    };
  }

  const { fragment, hasThemeSignal } = buildFragmentFromSnapshot(snapshot);

  if (!hasThemeSignal) {
    // User has 10+ ratings but hasn't tagged any themes as hits or misses.
    // All we'd be injecting is the overall nailed-it rate, which isn't
    // actionable guidance for the model. Skip rather than inject noise.
    return {
      fragment: null,
      reason: "no_theme_signal",
      totalRatings: snapshot.totalRatings,
      nailedItRate: snapshot.nailedItRate,
    };
  }

  return {
    fragment,
    reason: "applied",
    totalRatings: snapshot.totalRatings,
    nailedItRate: snapshot.nailedItRate,
  };
}

// Re-export internals for verification scripts & future /ops tooling.
export const CALIBRATION_INTERNALS = {
  MIN_CALIBRATION_RATINGS,
  MIN_TOUCHES_PER_THEME,
  MAX_THEMES_PER_SIDE,
  buildFragmentFromSnapshot,
  isEnabled: isCalibrationEnabled,
};
