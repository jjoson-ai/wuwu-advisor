export const ACTED_ON_OPTIONS = ["yes", "partial", "no"] as const;

export type ActedOnValue = (typeof ACTED_ON_OPTIONS)[number];

export type BriefingFeedbackRow = {
  id: string;
  briefing_id: string;
  user_id: string;
  usefulness_score: number;
  acted_on: ActedOnValue;
  note: string | null;
  created_at: string;
};

export type SubmitBriefingFeedbackInput = {
  briefingId: string;
  userId: string;
  usefulnessScore: number;
  actedOn: ActedOnValue;
  note: string | null;
};
