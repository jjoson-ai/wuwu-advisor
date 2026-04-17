import type { UserBlueprintRow } from "@/domain/blueprint/blueprint.types";
import type { DailyBriefingRow } from "@/domain/briefing/briefing.types";
import type { DecisionGuidanceFeedbackRow } from "@/domain/decision/decision-feedback.types";
import type { DecisionGuidanceRow } from "@/domain/decision/decision.types";
import type { BriefingFeedbackRow } from "@/domain/feedback/feedback.types";
import type { UserForecastRow } from "@/domain/forecast/forecast.types";
import type { BirthDataRow, ProfileRow } from "@/domain/profile/profile.types";

export type TrackingPreferenceState = {
  trackingEnabled: boolean | null;
  storage: "local_only";
  serverSynced: false;
  updatedAt: string | null;
  note: string;
};

export type UserDataExport = {
  exportedAt: string;
  scope: "first_party_application_data";
  processorCoverage: "manual_follow_up_required";
  notes: string[];
  account: {
    userId: string;
    email: string | null;
    createdAt: string | null;
  };
  privacyPreferences: TrackingPreferenceState;
  data: {
    profile: ProfileRow | null;
    birthData: BirthDataRow | null;
    dailyBriefings: DailyBriefingRow[];
    briefingFeedback: BriefingFeedbackRow[];
    blueprint: UserBlueprintRow | null;
    forecast: UserForecastRow | null;
    decisionGuidance: DecisionGuidanceRow[];
    decisionGuidanceFeedback: DecisionGuidanceFeedbackRow[];
  };
};

export type UserDataInventory = {
  profileRecords: number;
  birthDataRecords: number;
  dailyBriefings: number;
  briefingFeedback: number;
  blueprints: number;
  forecasts: number;
  decisionGuidance: number;
  decisionGuidanceFeedback: number;
};

export type DeleteDataRequestResponse = {
  requestId: string;
  submittedAt: string;
  status: "pending_manual_review";
  message: string;
  inventory: UserDataInventory;
  coverage: {
    authAccount: "manual_follow_up_required";
    firstPartyDatabase: "manual_runbook_pending";
    llmVendors: "manual_follow_up_required";
    analyticsPreferences: "device_local_reset_required";
  };
  notes: string[];
};
