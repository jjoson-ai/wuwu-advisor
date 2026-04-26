/**
 * 5.3 Decision log types.
 *
 * A decision log is created when the user optionally commits to a course of
 * action after getting Ask guidance and picks a revisit date. When that date
 * arrives, a "how did it go?" prompt appears on the Ask pages.
 */

export const DECISION_OUTCOME_OPTIONS = [
  "went_well",
  "mixed",
  "went_poorly",
] as const;

export type DecisionOutcomeValue = (typeof DECISION_OUTCOME_OPTIONS)[number];

export type DecisionLogRow = {
  id: string;
  user_id: string;
  decision_guidance_id: string;
  committed_action: string;
  revisit_at: string; // ISO date string "YYYY-MM-DD"
  outcome: DecisionOutcomeValue | null;
  outcome_note: string | null;
  outcome_submitted_at: string | null;
  created_at: string;
};

/** Revisit preset options shown as buttons in the log form. */
export const REVISIT_PRESETS = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
] as const;

export type RevisitPreset = (typeof REVISIT_PRESETS)[number];

export type CreateDecisionLogInput = {
  userId: string;
  decisionGuidanceId: string;
  committedAction: string;
  revisitAt: string; // "YYYY-MM-DD"
};

export type SubmitDecisionOutcomeInput = {
  logId: string;
  userId: string;
  outcome: DecisionOutcomeValue;
  outcomeNote: string | null;
};
