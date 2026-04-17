import type { AccessLevel } from "@/lib/access";
import type {
  ModelRoutingFeature,
  NormalizedRoutingMetadata,
} from "@/lib/model-decision";

export type RoutingPathTaken =
  | "cheap_final"
  | "frontier_final"
  | "compose_final"
  | "synthesize_final"
  | "full_fallback";

export type RoutingEvent = {
  request_id: string;
  timestamp: string;
  feature: ModelRoutingFeature;
  tier: AccessLevel;
  platform: "web" | "mobile";
  final_model_selected: string;
  path_taken: RoutingPathTaken;
  fallback_triggered: boolean;
  fallback_reason: string | null;
  complexityScore: number | null;
  conflictScore: number | null;
  emotionalIntensity: number | null;
  decisionAmbiguity: number | null;
  phaseShiftScore: number | null;
  synthesisBurden: number | null;
  forced_frontier_reasons: string[];
  tone_preference?: string | null;
};

export function toRoutingEventScores(
  signals: NormalizedRoutingMetadata | null | undefined,
) {
  return {
    complexityScore: signals?.complexityScore ?? null,
    conflictScore: signals?.conflictScore ?? null,
    emotionalIntensity: signals?.emotionalIntensity ?? null,
    decisionAmbiguity: signals?.decisionAmbiguity ?? null,
    phaseShiftScore: signals?.phaseShiftScore ?? null,
  };
}
