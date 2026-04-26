// ─────────────────────────────────────────────────────────────────────────────
// Legacy 1-5 usefulness + acted_on shape.
//
// Kept as exports because `decision-feedback.types.ts` reuses ACTED_ON_OPTIONS
// for the Decision Guidance feedback form (which still uses the old shape).
// Briefing feedback has moved to the emoji rating shape below; old briefing
// rows remain readable via BriefingFeedbackRow.
// ─────────────────────────────────────────────────────────────────────────────

export const ACTED_ON_OPTIONS = ["yes", "partial", "no"] as const;

export type ActedOnValue = (typeof ACTED_ON_OPTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Rating shape — 5.2 accuracy feedback loop (Phase A).
// ─────────────────────────────────────────────────────────────────────────────

export const RATING_EMOJI_OPTIONS = ["nailed_it", "vague", "off"] as const;

export type RatingEmojiValue = (typeof RATING_EMOJI_OPTIONS)[number];

/**
 * Six canonical themes the user can tag as "what hit" or "what missed"
 * on a briefing. Matches the five briefing cards (FinalSynthesisOutputSchema)
 * plus `timing` since the timing window card is its own distinct claim.
 */
export const RATING_THEME_OPTIONS = [
  "career",
  "money",
  "relationships",
  "health",
  "personal_growth",
  "timing",
] as const;

export type RatingThemeValue = (typeof RATING_THEME_OPTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Row + input shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of a row from `public.briefing_feedback`.
 *
 * Post-5.2 rows carry `rating_emoji` (+ optional theme arrays). Legacy rows
 * carry `usefulness_score` + `acted_on`. The constraint in migration 006
 * requires at least one of the two shapes per row, so one of the two groups
 * will always be populated.
 */
export type BriefingFeedbackRow = {
  id: string;
  briefing_id: string;
  user_id: string;
  // New rating shape (5.2). Null on legacy rows.
  rating_emoji: RatingEmojiValue | null;
  rating_theme_hit: RatingThemeValue[];
  rating_theme_miss: RatingThemeValue[];
  // Legacy 1-5 shape. Null on new rows; non-null on legacy rows.
  usefulness_score: number | null;
  acted_on: ActedOnValue | null;
  note: string | null;
  created_at: string;
};

/**
 * Input payload for the new emoji rating UI. The old 1-5 form is replaced by
 * this; legacy data in the DB stays readable but we no longer write it.
 */
export type SubmitBriefingFeedbackInput = {
  briefingId: string;
  userId: string;
  ratingEmoji: RatingEmojiValue;
  ratingThemeHit: RatingThemeValue[];
  ratingThemeMiss: RatingThemeValue[];
  note: string | null;
};
