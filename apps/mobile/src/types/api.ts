export type Confidence = "low" | "medium" | "high";

export type TodayDecisionOfDay = {
  scenario: string;
  do: string;
  avoid: string;
  why: string;
};

export type TodayTiming = {
  best_window: string;
  avoid_window: string;
};

export type TodayCareerCard = {
  headline: string;
  best_move: string;
  watch_out: string;
};

export type TodayMoneyCard = {
  headline: string;
  lean_toward: string;
  avoid: string;
  risk_level: string;
};

export type TodayRelationshipsCard = {
  headline: string;
  best_action: string;
  avoid: string;
};

export type TodayHealthCard = {
  headline: string;
  best_use: string;
  avoid: string;
};

export type TodayPersonalGrowthCard = {
  headline: string;
  focus: string;
  good_for: string;
  not_ideal_for: string;
};

export type TodayMicroClaim = {
  statement: string;
  horizon: string;
  track_prompt: string;
};

export type FormattedTodayBriefing = {
  id: string;
  date: string;
  confidence: Confidence;
  executive_summary: string;
  decision_of_day: TodayDecisionOfDay;
  cards: {
    career: TodayCareerCard;
    money: TodayMoneyCard;
    relationships: TodayRelationshipsCard;
    health: TodayHealthCard;
    personal_growth: TodayPersonalGrowthCard;
  };
  timing: TodayTiming;
  micro_claim: TodayMicroClaim;
  generation_access_level: "free" | "pro" | "internal" | null;
  created_at: string;
};

// Legacy 1-5 + acted_on shape. Still used by the Decision Guidance feedback
// form, so the type stays exported. Briefing feedback has moved to the new
// emoji rating shape below.
export type ActedOnValue = "yes" | "partial" | "no";

// New briefing-rating shape — mirrors domain/feedback/feedback.types.ts.
export type RatingEmojiValue = "nailed_it" | "vague" | "off";
export type RatingThemeValue =
  | "career"
  | "money"
  | "relationships"
  | "health"
  | "personal_growth"
  | "timing";

export type BriefingFeedback = {
  id: string;
  briefing_id: string;
  user_id: string;
  // New rating shape. Null on legacy rows migrated before 5.2 Phase A.
  rating_emoji: RatingEmojiValue | null;
  rating_theme_hit: RatingThemeValue[];
  rating_theme_miss: RatingThemeValue[];
  // Legacy 1-5 shape. Null on new rows.
  usefulness_score: number | null;
  acted_on: ActedOnValue | null;
  note: string | null;
  created_at: string;
};

export type MobileTodayResponse = {
  briefing: FormattedTodayBriefing | null;
  feedback: BriefingFeedback | null;
};

export type GenerateTodayResponse = {
  briefing: unknown;
};

export type SubmitTodayFeedbackRequest = {
  briefingId: string;
  ratingEmoji: RatingEmojiValue;
  ratingThemeHit: RatingThemeValue[];
  ratingThemeMiss: RatingThemeValue[];
  note: string | null;
};

export type SubmitTodayFeedbackResponse = {
  feedback: BriefingFeedback;
  message: string;
};

export type MobileBlueprintResponse = {
  blueprint: FormattedBlueprint | null;
};

export type MobileForecastResponse = {
  forecast: FormattedForecast | null;
};

export type MobileAskResponse = {
  latest: FormattedDecisionGuidance | null;
  latestFeedback: DecisionGuidanceFeedback | null;
  recent: FormattedDecisionGuidance[];
};

export type MobileAskDetailResponse = {
  guidance: FormattedDecisionGuidance | null;
  feedback: DecisionGuidanceFeedback | null;
};

export type MobileSettingsWriteRequest = {
  displayName: string;
  fullBirthNameForNumerology: string;
  baziCalculationMarker: string;
  birthDate: string;
  birthTime: string;
  birthTimeConfidence: string;
  birthCity: string;
  birthCountry: string;
  timezone: string;
  tonePreference: string;
};

export type MobileSettingsResponse = {
  settings: MobileSettingsWriteRequest;
  onboardingComplete: boolean;
  accessLevel: "free" | "pro" | "internal";
  featureAccess: {
    canViewFullBlueprint: boolean;
    canGenerateUnlimitedToday: boolean;
    canAskUnlimited: boolean;
    canViewFullForecast: boolean;
  };
  dailyUsageLimits: {
    askQuestionsPerDay: number | null;
    todayRefreshesPerDay: number | null;
  };
};

export type TrackingPreferenceResponse = {
  trackingEnabled: boolean | null;
  storage: "local_only";
  serverSynced: false;
  updatedAt: string | null;
  note: string;
};

export type UserDataExportResponse = {
  exportedAt: string;
  scope: "first_party_application_data";
  processorCoverage: "manual_follow_up_required";
  notes: string[];
  account: {
    userId: string;
    email: string | null;
    createdAt: string | null;
  };
  privacyPreferences: TrackingPreferenceResponse;
  data: Record<string, unknown>;
};

export type DeleteDataRequestResponse = {
  requestId: string;
  submittedAt: string;
  status: "pending_manual_review";
  message: string;
  inventory: {
    profileRecords: number;
    birthDataRecords: number;
    dailyBriefings: number;
    briefingFeedback: number;
    blueprints: number;
    forecasts: number;
    decisionGuidance: number;
    decisionGuidanceFeedback: number;
  };
  coverage: {
    authAccount: "manual_follow_up_required";
    firstPartyDatabase: "manual_runbook_pending";
    llmVendors: "manual_follow_up_required";
    analyticsPreferences: "device_local_reset_required";
  };
  notes: string[];
};

export type FormattedBlueprint = {
  id: string;
  title: string;
  summary: string;
  bazi_signature: {
    day_master: string;
    year_pillar: string;
    month_pillar: string;
    day_pillar: string;
    hour_pillar: string;
  };
  human_design_signature: {
    type: string;
    authority: string;
    profile: string;
  };
  guiding_numbers: {
    life_path: string;
    birthday: string;
    attitude: string;
    name_number: string;
  };
  chinese_signature: {
    animal: string;
    element: string;
    polarity: string;
  };
  core_pattern: {
    headline: string;
    description: string;
  };
  communication_and_connection: {
    headline: string;
    description: string;
  };
  work_and_money_style: {
    headline: string;
    description: string;
  };
  energy_and_stress: {
    headline: string;
    description: string;
  };
  growth_edge: {
    headline: string;
    description: string;
  };
  generation_access_level: "free" | "pro" | "internal" | null;
  created_at: string;
  updated_at: string;
};

export type FormattedForecast = {
  id: string;
  title: string;
  summary: string;
  current_phase: {
    headline: string;
    description: string;
  };
  career_and_money: {
    headline: string;
    description: string;
  };
  relationships: {
    headline: string;
    description: string;
  };
  energy_and_pacing: {
    headline: string;
    description: string;
  };
  best_use_of_this_period: {
    headline: string;
    description: string;
  };
  what_to_avoid: {
    headline: string;
    description: string;
  };
  generation_access_level: "free" | "pro" | "internal" | null;
  created_at: string;
  updated_at: string;
};

export type GenerateBlueprintResponse = {
  blueprint: unknown;
};

export type GenerateForecastResponse = {
  forecast: unknown;
};

export type DecisionStance = "go" | "wait" | "go_small" | "avoid" | "unclear";

export type FormattedDecisionGuidance = {
  id: string;
  created_at: string;
  generation_access_level: "free" | "pro" | "internal" | null;
  question: string;
  recommendation: {
    headline: string;
    stance: DecisionStance;
  };
  why_this_answer: {
    headline: string;
    description: string;
  };
  supporting_signals: {
    headline: string;
    items: string[];
  };
  what_to_watch_out_for: {
    headline: string;
    items: string[];
  };
  timing_posture: {
    headline: string;
    description: string;
  };
  confidence: Confidence;
};

export type DecisionGuidanceFeedback = {
  id: string;
  decision_guidance_id: string;
  user_id: string;
  usefulness_score: number;
  acted_on: ActedOnValue;
  note: string | null;
  created_at: string;
};

export type DecisionSafetyMode =
  | "crisis_support"
  | "violence_prevention"
  | "refusal_safe_redirect";

export type DecisionSafetyResponse = {
  mode: DecisionSafetyMode;
  headline: string;
  message: string;
  urgent_action: string;
  resources: string[];
};

export type GenerateAskRequest = {
  question: string;
};

export type GenerateAskResponse =
  | { guidance: FormattedDecisionGuidance }
  | { safety: DecisionSafetyResponse };

export type SubmitDecisionFeedbackRequest = {
  decisionGuidanceId: string;
  usefulnessScore: number;
  actedOn: ActedOnValue;
  note: string | null;
};

export type SubmitDecisionFeedbackResponse = {
  feedback: DecisionGuidanceFeedback;
  message: string;
};
