import type { FormattedBlueprint } from "@/domain/blueprint/blueprint.types";
import type { FormattedDailyBriefing } from "@/domain/briefing/briefing.types";
import type { FormattedDecisionGuidance } from "@/domain/decision/decision.types";
import type { DecisionGuidanceFeedbackRow } from "@/domain/decision/decision-feedback.types";
import type { BriefingFeedbackRow } from "@/domain/feedback/feedback.types";
import type { FormattedForecast } from "@/domain/forecast/forecast.types";
import type {
  AccessLevel,
  DailyUsageLimits,
  FeatureAccess,
} from "@/lib/access";
import type { OnboardingInput } from "@/lib/validations";

export type MobileTodayResponse = {
  briefing: FormattedDailyBriefing | null;
  feedback: BriefingFeedbackRow | null;
};

export type MobileBlueprintResponse = {
  blueprint: FormattedBlueprint | null;
};

export type MobileForecastResponse = {
  forecast: FormattedForecast | null;
};

export type MobileAskResponse = {
  latest: FormattedDecisionGuidance | null;
  latestFeedback: DecisionGuidanceFeedbackRow | null;
  recent: FormattedDecisionGuidance[];
};

export type MobileAskDetailResponse = {
  guidance: FormattedDecisionGuidance | null;
  feedback: DecisionGuidanceFeedbackRow | null;
};

export type MobileSettingsResponse = {
  settings: OnboardingInput;
  onboardingComplete: boolean;
  accessLevel: AccessLevel;
  featureAccess: FeatureAccess;
  dailyUsageLimits: DailyUsageLimits;
};

export type MobileSettingsWriteRequest = OnboardingInput;
