import type { EvalUsage } from "@/lib/eval-providers";
import type { LlmProvider, RoutedModel } from "@/lib/model-routing";

export type BakeoffSurface = "today" | "forecast" | "blueprint" | "ask";
export type BakeoffTier = "free" | "pro";
export type BakeoffVariantId =
  | "variant-a"
  | "variant-b"
  | "variant-c"
  | "variant-d";

export type BakeoffProfile = {
  display_name: string;
  full_birth_name_for_numerology: string | null;
  birth_date: string;
  birth_time: string | null;
  birth_time_confidence: "exact" | "approximate" | "unknown";
  birth_city: string;
  birth_country: string;
  birth_timezone: string | null;
  current_timezone: string;
  birth_latitude: number | null;
  birth_longitude: number | null;
  tone_preference: "grounded" | "warm" | "direct";
  bazi_calculation_marker: "M" | "F" | null;
};

export type ProfileBakeoffCase = {
  id: string;
  label: string;
  evaluation_date: string;
  tiers: BakeoffTier[];
  tags: string[];
  profile: BakeoffProfile;
};

export type AskBakeoffCase = {
  id: string;
  label: string;
  profile_case_id: string;
  tier: BakeoffTier;
  question: string;
  tags: string[];
  notes: string;
};

export type PricingEntry = {
  input_per_1m_usd: number;
  output_per_1m_usd: number;
  source_url: string;
  notes?: string;
};

export type PricingTable = {
  updated_at: string;
  source_note: string;
  models: Record<string, PricingEntry>;
};

export type BakeoffStageResult = {
  stage_id: string;
  label: string;
  provider: LlmProvider;
  model: string;
  schema_name: string;
  status: "success" | "validation_error" | "error" | "skipped";
  raw_text: string | null;
  parsed_json: unknown | null;
  validated_output: unknown | null;
  validation_error: string | null;
  error: string | null;
  latency_ms: number | null;
  usage: EvalUsage | null;
  estimated_cost_usd: number | null;
};

export type RoutingMetadataSnapshot = {
  use_frontier: boolean;
  synthesis_burden: number;
  forced_frontier_reasons: string[];
  normalized_signals: {
    complexityScore: number;
    conflictScore: number;
    emotionalIntensity: number;
    decisionAmbiguity: number;
    phaseShiftScore: number;
  };
} | null;

export type BakeoffCandidateResult = {
  run_id: string;
  surface: BakeoffSurface;
  tier: BakeoffTier;
  case_id: string;
  case_label: string;
  variant_id: BakeoffVariantId;
  variant_label: string;
  status: "success" | "partial" | "error" | "skipped";
  skip_reason: string | null;
  path_taken:
    | "static_default"
    | "routed_cheap"
    | "routed_frontier"
    | "fallback"
    | "single_pass"
    | "control_single_pass";
  final_model: string | null;
  final_provider: LlmProvider | null;
  used_fallback: boolean;
  fallback_model_chain: string[];
  total_latency_ms: number | null;
  total_usage: EvalUsage | null;
  total_estimated_cost_usd: number | null;
  routing_metadata: RoutingMetadataSnapshot;
  output_json: unknown | null;
  preview_markdown: string | null;
  stages: BakeoffStageResult[];
  error: string | null;
};

export type BlindPacketEntry = {
  run_id: string;
  surface: BakeoffSurface;
  tier: BakeoffTier;
  case_id: string;
  blind_candidate_id: string;
  variant_id: BakeoffVariantId;
  variant_label: string;
};

export type JudgeType = "chatgpt" | "gemini" | "human";

export type JudgmentRow = {
  judge_type: JudgeType;
  run_id: string;
  surface: BakeoffSurface;
  tier: BakeoffTier;
  case_id: string;
  blind_candidate_id: string;
  usefulness_actionability: number;
  premium_feel: number;
  specificity: number;
  consistency_schema_quality: number;
  latency_speed: number;
  cost: number;
  red_flags: string;
  comments: string;
};

export type RankedVariantRow = {
  scope_label: string;
  variant_id: BakeoffVariantId;
  variant_label: string;
  review_count: number;
  average_total_score: number;
  average_usefulness_actionability: number;
  average_premium_feel: number;
  average_specificity: number;
  average_consistency_schema_quality: number;
  average_latency_speed: number;
  average_cost: number;
  mean_estimated_cost_usd: number | null;
  mean_latency_ms: number | null;
  red_flag_rate: number;
  generic_ai_rate: number;
  mystical_cliche_rate: number;
  schema_break_rate: number;
  internal_leakage_rate: number;
};

export type SurfacePlan = {
  mode: "production_control" | "static_default";
  primary_model?: RoutedModel;
  cheap_model?: RoutedModel;
  frontier_model?: RoutedModel;
  fallback_models: RoutedModel[];
  note: string;
};

export type VariantDefinition = {
  id: BakeoffVariantId;
  label: string;
  description: string;
  getSurfacePlan(surface: BakeoffSurface, tier: BakeoffTier): SurfacePlan;
};
