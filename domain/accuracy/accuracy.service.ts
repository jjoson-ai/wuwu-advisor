import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  RATING_EMOJI_OPTIONS,
  RATING_THEME_OPTIONS,
  type RatingEmojiValue,
  type RatingThemeValue,
} from "@/domain/feedback/feedback.types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 5.2 Phase B — per-user accuracy rollup.
 *
 * Reads ONLY the new emoji-rating columns on `briefing_feedback`. Legacy 1-5
 * rows (pre-5.2) are ignored — the scales aren't comparable and mixing them
 * would bury the signal.
 *
 * Shape of a window snapshot:
 *   - totalRatings: how many emoji ratings this user submitted in the window
 *   - nailedItCount / vagueCount / offCount: emoji distribution
 *   - nailedItRate: headline accuracy number (0..1, null if zero ratings)
 *   - perTheme[theme]: { hitCount, missCount, netScore, touchedCount }
 *       - hitCount: times user tagged this theme as "what hit"
 *       - missCount: times user tagged this theme as "what missed"
 *       - touchedCount: hit + miss (how often they cared about this theme)
 *       - netScore: hits - misses (signed; negative means theme is a miss)
 *
 * We don't compute a per-theme "rate" — it requires a denominator the user
 * hasn't given us (which days did they consider this theme relevant?). Phase C
 * prompt calibration will use netScore + touchedCount directly.
 */

export type AccuracyWindowDays = 14 | 30;

type PerThemeStats = {
  hitCount: number;
  missCount: number;
  touchedCount: number;
  // Signed score. Positive = this theme lands for the user.  Negative = miss.
  netScore: number;
};

export type AccuracySnapshot = {
  windowDays: AccuracyWindowDays;
  windowStartIso: string;
  totalRatings: number;
  nailedItCount: number;
  vagueCount: number;
  offCount: number;
  // 0..1, or null if no ratings in window.
  nailedItRate: number | null;
  perTheme: Record<RatingThemeValue, PerThemeStats>;
};

export type AccuracyReport = {
  snapshot14d: AccuracySnapshot;
  snapshot30d: AccuracySnapshot;
  hasEnoughDataForHeadline: boolean;
  // Copy for the "need more data" state; null once threshold hit.
  lowDataMessage: string | null;
};

// Below this, the nailed-it-rate number is too noisy to show as the headline.
// Matches the gating Phase D will use for the share asset.
const MIN_RATINGS_FOR_HEADLINE = 5;

function makeEmptyPerTheme(): Record<RatingThemeValue, PerThemeStats> {
  // Build with every canonical theme so downstream code can iterate a fixed
  // shape — no undefined-checks when a theme has zero activity.
  return Object.fromEntries(
    RATING_THEME_OPTIONS.map((theme) => [
      theme,
      { hitCount: 0, missCount: 0, touchedCount: 0, netScore: 0 },
    ]),
  ) as Record<RatingThemeValue, PerThemeStats>;
}

type FeedbackRowMin = {
  rating_emoji: RatingEmojiValue | null;
  rating_theme_hit: RatingThemeValue[] | null;
  rating_theme_miss: RatingThemeValue[] | null;
  created_at: string;
};

function computeSnapshot(
  rows: FeedbackRowMin[],
  windowDays: AccuracyWindowDays,
  windowStartIso: string,
): AccuracySnapshot {
  // Only rows that carry a rating_emoji belong in the new accuracy loop.
  // A defensive filter — in theory the caller already excluded legacy rows,
  // but the DB constraint lets either shape exist, so we double-check here.
  const emojiRows = rows.filter((row) => row.rating_emoji !== null);

  const perTheme = makeEmptyPerTheme();

  let nailedItCount = 0;
  let vagueCount = 0;
  let offCount = 0;

  for (const row of emojiRows) {
    if (row.rating_emoji === "nailed_it") nailedItCount += 1;
    else if (row.rating_emoji === "vague") vagueCount += 1;
    else if (row.rating_emoji === "off") offCount += 1;

    const hits = row.rating_theme_hit ?? [];
    for (const theme of hits) {
      // Guard against a future theme appearing in a row before the enum
      // catches up — skip unknown themes rather than crash.
      if (RATING_THEME_OPTIONS.includes(theme)) {
        perTheme[theme].hitCount += 1;
        perTheme[theme].touchedCount += 1;
        perTheme[theme].netScore += 1;
      }
    }

    const misses = row.rating_theme_miss ?? [];
    for (const theme of misses) {
      if (RATING_THEME_OPTIONS.includes(theme)) {
        perTheme[theme].missCount += 1;
        perTheme[theme].touchedCount += 1;
        perTheme[theme].netScore -= 1;
      }
    }
  }

  const totalRatings = emojiRows.length;
  const nailedItRate = totalRatings === 0 ? null : nailedItCount / totalRatings;

  return {
    windowDays,
    windowStartIso,
    totalRatings,
    nailedItCount,
    vagueCount,
    offCount,
    nailedItRate,
    perTheme,
  };
}

function windowStartFor(windowDays: AccuracyWindowDays, now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() - windowDays);
  return start;
}

function describeDbError(
  error: PostgrestError,
  fallback: string,
): string {
  if (
    error.code === "42703" ||
    /column .* does not exist/i.test(error.message)
  ) {
    return "Supabase setup error: briefing_feedback is missing the rating columns. Rerun sql/006_briefing_rating.sql in your connected Supabase project.";
  }

  if (error.code === "PGRST205" || error.message.includes("schema cache")) {
    return "Supabase setup error: could not find briefing_feedback in the connected project. Rerun sql/001_init.sql + sql/006_briefing_rating.sql and confirm your env values point at the same project.";
  }

  return error.message || fallback;
}

/**
 * Return both the 14-day and 30-day snapshots for one user in a single call.
 * We pull 30 days of rows once and slice locally for the 14-day window —
 * saves one round-trip and keeps the two snapshots temporally consistent.
 */
export async function getAccuracyReportForUser(
  userId: string,
  accessToken?: string | null,
  nowOverride?: Date,
): Promise<AccuracyReport> {
  const now = nowOverride ?? new Date();
  const start30 = windowStartFor(30, now);
  const start14 = windowStartFor(14, now);

  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const result = await supabase
    .from("briefing_feedback")
    .select("rating_emoji, rating_theme_hit, rating_theme_miss, created_at")
    .eq("user_id", userId)
    .gte("created_at", start30.toISOString())
    .lte("created_at", now.toISOString())
    .order("created_at", { ascending: false });

  if (result.error !== null) {
    throw new Error(
      describeDbError(result.error, "Unable to load accuracy report."),
    );
  }

  const rows = (result.data ?? []) as FeedbackRowMin[];

  // 30d snapshot uses all rows; 14d re-filters the same rows in memory.
  const rows14 = rows.filter(
    (row) => new Date(row.created_at) >= start14,
  );

  const snapshot30d = computeSnapshot(rows, 30, start30.toISOString());
  const snapshot14d = computeSnapshot(rows14, 14, start14.toISOString());

  // Headline accuracy number is gated on 14d volume — people want the
  // "this week" read, not "this month, diluted by stale ratings."
  const hasEnoughDataForHeadline =
    snapshot14d.totalRatings >= MIN_RATINGS_FOR_HEADLINE;

  const lowDataMessage = hasEnoughDataForHeadline
    ? null
    : `Rate at least ${MIN_RATINGS_FOR_HEADLINE} briefings in any 14-day stretch to unlock your accuracy read. You've submitted ${snapshot14d.totalRatings} so far.`;

  return {
    snapshot14d,
    snapshot30d,
    hasEnoughDataForHeadline,
    lowDataMessage,
  };
}

/**
 * Admin variant: same as getAccuracyReportForUser but uses the service-role
 * client so it works without a user session. Used by the public share page
 * and OG image route where we have a user_id from the share token but no
 * authenticated session.
 */
export async function getAccuracyReportForUserAdmin(
  userId: string,
  nowOverride?: Date,
): Promise<AccuracyReport> {
  const now = nowOverride ?? new Date();
  const start30 = windowStartFor(30, now);
  const start14 = windowStartFor(14, now);

  const supabase = getSupabaseAdminClient();

  const result = await supabase
    .from("briefing_feedback")
    .select("rating_emoji, rating_theme_hit, rating_theme_miss, created_at")
    .eq("user_id", userId)
    .gte("created_at", start30.toISOString())
    .lte("created_at", now.toISOString())
    .order("created_at", { ascending: false });

  if (result.error !== null) {
    throw new Error(
      describeDbError(result.error, "Unable to load accuracy report."),
    );
  }

  const rows = (result.data ?? []) as FeedbackRowMin[];
  const rows14 = rows.filter((row) => new Date(row.created_at) >= start14);

  const snapshot30d = computeSnapshot(rows, 30, start30.toISOString());
  const snapshot14d = computeSnapshot(rows14, 14, start14.toISOString());
  const hasEnoughDataForHeadline =
    snapshot14d.totalRatings >= MIN_RATINGS_FOR_HEADLINE;

  const lowDataMessage = hasEnoughDataForHeadline
    ? null
    : `Rate at least ${MIN_RATINGS_FOR_HEADLINE} briefings in any 14-day stretch to unlock your accuracy read.`;

  return {
    snapshot14d,
    snapshot30d,
    hasEnoughDataForHeadline,
    lowDataMessage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exposed so the page + future share asset reuse them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort themes by net score (strongest hit themes first). Ties broken by
 * touchedCount (more data first), then by theme canonical order for stability.
 */
export function rankThemesByNetScore(
  perTheme: Record<RatingThemeValue, PerThemeStats>,
): Array<{ theme: RatingThemeValue; stats: PerThemeStats }> {
  return RATING_THEME_OPTIONS.map((theme) => ({
    theme,
    stats: perTheme[theme],
  })).sort((a, b) => {
    if (b.stats.netScore !== a.stats.netScore) {
      return b.stats.netScore - a.stats.netScore;
    }
    if (b.stats.touchedCount !== a.stats.touchedCount) {
      return b.stats.touchedCount - a.stats.touchedCount;
    }
    return (
      RATING_THEME_OPTIONS.indexOf(a.theme) -
      RATING_THEME_OPTIONS.indexOf(b.theme)
    );
  });
}

/** Format a 0..1 rate as "NN%". Returns "—" for null. */
export function formatRatePct(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** Re-exported so the page template doesn't have to import two modules. */
export const ACCURACY_EMOJI_OPTIONS = RATING_EMOJI_OPTIONS;
