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

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";
const OPUS_MODEL = "claude-opus-4-7";

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
