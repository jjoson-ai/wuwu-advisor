import { ACTED_ON_OPTIONS, type ActedOnValue } from "@/domain/feedback/feedback.types";

export { ACTED_ON_OPTIONS };
export type { ActedOnValue };

export type DecisionGuidanceFeedbackRow = {
  id: string;
  decision_guidance_id: string;
  user_id: string;
  usefulness_score: number;
  acted_on: ActedOnValue;
  note: string | null;
  created_at: string;
};

export type SubmitDecisionGuidanceFeedbackInput = {
  decisionGuidanceId: string;
  userId: string;
  usefulnessScore: number;
  actedOn: ActedOnValue;
  note: string | null;
};
