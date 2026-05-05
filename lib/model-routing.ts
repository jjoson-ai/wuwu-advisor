export type GenerationPass = "extract" | "compose" | "synthesize";
export type LlmProvider = "openai" | "anthropic";

/**
 * Surface identifier used for feature-aware compose-pass routing.
 * - `today` / `forecast` → high-volume, templated narrative passes that can
 *   safely drop to Haiku when signals are routine. Frontier escalation still
 *   kicks in via `routingDecision.useFrontier` when burden signals demand it.
 * - `ask` / `blueprint` → high-judgment surfaces that stay on Sonnet/Opus.
 */
export type RoutingFeature = "today" | "forecast" | "ask" | "blueprint";

export type RoutedModel = {
  provider: LlmProvider;
  model: string;
};

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";
export const OPUS_MODEL = "claude-opus-4-7";

import type { ModelRoutingDecision } from "@/lib/model-decision";

/**
 * Resolve the model for a generation pass. The optional `feature` param
 * drives feature-aware compose-pass routing:
 *
 * - compose + today/forecast → Haiku 4.5 (cheap narrative for routine signals)
 * - compose + ask/blueprint/undefined → Sonnet 4.6 (default)
 * - extract → Haiku 4.5 (always)
 * - synthesize → Opus 4.7 (always)
 */
export function getModelForPass(
  pass: GenerationPass,
  feature?: RoutingFeature,
): RoutedModel {
  if (pass === "extract") {
    return { provider: "anthropic", model: HAIKU_MODEL };
  }

  if (pass === "compose") {
    if (feature === "today" || feature === "forecast") {
      return { provider: "anthropic", model: HAIKU_MODEL };
    }

    return { provider: "anthropic", model: SONNET_MODEL };
  }

  return { provider: "anthropic", model: OPUS_MODEL };
}

/**
 * Resolve the final model for a generation surface, integrating the static
 * pass→model map with the signal-based routing decision. Centralizes the
 * precedence rule so callers can't accidentally disagree:
 *
 *   - When routingDecision.useFrontier is true → Opus 4.7 (frontier).
 *   - Otherwise → the feature-aware cheap-pass model from getModelForPass:
 *       - compose + today/forecast → Haiku 4.5
 *       - compose + ask/blueprint/undefined → Sonnet 4.6
 *
 * If routingDecision is null (e.g., a route that doesn't run the
 * decision system), behaves identically to getModelForPass(cheapPass, feature)
 * — the caller gets the same baseline they'd have gotten by calling
 * getModelForPass directly.
 */
export function selectModelForGeneration(input: {
  feature: RoutingFeature;
  routingDecision: ModelRoutingDecision | null;
  cheapPass?: GenerationPass;
}): RoutedModel {
  const cheapPass = input.cheapPass ?? "compose";

  if (input.routingDecision?.useFrontier === true) {
    return { provider: "anthropic", model: OPUS_MODEL };
  }

  return getModelForPass(cheapPass, input.feature);
}
