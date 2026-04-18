import {
  getModelForPass,
  type RoutedModel,
  type RoutingFeature,
} from "@/lib/model-routing";

import type {
  BakeoffSurface,
  BakeoffTier,
  VariantDefinition,
} from "@/scripts/bakeoff/types";

function anthropic(model: string): RoutedModel {
  return {
    provider: "anthropic",
    model,
  };
}

const HAIKU = anthropic("claude-haiku-4-5-20251001");
const SONNET = anthropic("claude-sonnet-4-6");
const OPUS = anthropic("claude-opus-4-7");

export const BAKEOFF_VARIANTS: VariantDefinition[] = [
  {
    id: "variant-a",
    label: "A · Haiku extract + Opus synthesize (production candidate)",
    description:
      "New production stack. Haiku for signal extraction, Opus for final synthesis. Best quality-to-cost ratio for the two-pass architecture.",
    getSurfacePlan() {
      return {
        mode: "static_default",
        primary_model: OPUS,
        cheap_model: HAIKU,
        frontier_model: OPUS,
        fallback_models: [OPUS],
        note: "Haiku for signals, Opus for narrative — matches planned production routing.",
      };
    },
  },
  {
    id: "variant-b",
    label: "B · Haiku extract + Sonnet synthesize (cost variant)",
    description:
      "Cost-optimised alternative. Haiku for extraction, Sonnet for synthesis. Use to benchmark quality loss vs. cost savings at scale.",
    getSurfacePlan() {
      return {
        mode: "static_default",
        primary_model: SONNET,
        cheap_model: HAIKU,
        frontier_model: SONNET,
        fallback_models: [OPUS],
        note: "Haiku for signals, Sonnet for narrative. Opus reserved for fallbacks only.",
      };
    },
  },
  {
    id: "variant-c",
    label: "C · Sonnet throughout (uniform mid-tier)",
    description:
      "Sonnet for both extraction and synthesis. Simpler routing, mid-tier quality, useful as a latency and cost baseline.",
    getSurfacePlan() {
      return {
        mode: "static_default",
        primary_model: SONNET,
        cheap_model: SONNET,
        frontier_model: SONNET,
        fallback_models: [OPUS],
        note: "Uniform Sonnet stack with Opus fallback.",
      };
    },
  },
  {
    id: "variant-d",
    label: "D · Production control (live routing)",
    description:
      "Mirror the live production routing. Haiku for extraction, Sonnet for compose-path narrative, Opus for synthesize-path narrative.",
    getSurfacePlan(surface) {
      if (surface === "blueprint") {
        return {
          mode: "production_control",
          primary_model: getModelForPass("synthesize", "blueprint"),
          cheap_model: getModelForPass("synthesize", "blueprint"),
          frontier_model: getModelForPass("synthesize", "blueprint"),
          fallback_models: [],
          note: "Blueprint uses single-pass Opus (synthesize).",
        };
      }

      const feature = surface as RoutingFeature;

      return {
        mode: "production_control",
        cheap_model: getModelForPass("compose", feature),
        frontier_model: getModelForPass("synthesize", feature),
        fallback_models: [getModelForPass("synthesize", feature)],
        note:
          feature === "today" || feature === "forecast"
            ? `${surface}: Haiku for compose (new routing), Opus for synthesize/frontier escalation.`
            : `${surface}: Sonnet for compose, Opus for synthesize/frontier escalation.`,
      };
    },
  },
];

// Legacy pre-2.4 routing pinned as a fixed reference: Sonnet for Today/Forecast
// compose, Opus for frontier escalation. Kept explicitly (not via
// getModelForPass) so it remains a stable comparison anchor even when the
// production router shifts.
BAKEOFF_VARIANTS.push({
  id: "variant-e",
  label: "E · Pre-2.4 legacy routing (Sonnet compose for Today/Forecast)",
  description:
    "Fixed snapshot of routing before the 2.4 Haiku migration. Sonnet for Today/Forecast compose, Opus for frontier escalation. Use as the apples-to-apples baseline when evaluating the new Haiku-for-compose routing in variant-d.",
  getSurfacePlan(surface) {
    if (surface === "blueprint") {
      return {
        mode: "production_control",
        primary_model: OPUS,
        cheap_model: OPUS,
        frontier_model: OPUS,
        fallback_models: [],
        note: "Blueprint single-pass Opus (unchanged by 2.4).",
      };
    }

    return {
      mode: "production_control",
      cheap_model: SONNET,
      frontier_model: OPUS,
      fallback_models: [OPUS],
      note: `${surface}: legacy Sonnet compose + Opus frontier (pre-2.4).`,
    };
  },
});

// Forced Haiku compose: bypasses the routing decision entirely so the compose
// path always runs regardless of signal scores. Use variant-b (forced Sonnet
// compose) as the direct quality baseline for this variant.
BAKEOFF_VARIANTS.push({
  id: "variant-f",
  label: "F · Forced Haiku compose (routing bypass)",
  description:
    "Haiku for both extraction and compose narrative, regardless of routing scores. Bypasses the frontier escalation path entirely. Use alongside variant-b (forced Sonnet compose) to directly compare the 2.4 cheap-path output quality independent of routing thresholds.",
  getSurfacePlan(surface) {
    if (surface === "blueprint") {
      return {
        mode: "static_default",
        primary_model: OPUS,
        cheap_model: OPUS,
        frontier_model: OPUS,
        fallback_models: [],
        note: "Blueprint single-pass Opus (unchanged by 2.4).",
      };
    }

    return {
      mode: "static_default",
      primary_model: HAIKU,
      cheap_model: HAIKU,
      frontier_model: HAIKU,
      fallback_models: [SONNET],
      note: `${surface}: Haiku forced for both extraction and compose narrative. Routing bypassed.`,
    };
  },
});

export function getVariantById(id: string) {
  return BAKEOFF_VARIANTS.find((variant) => variant.id === id) ?? null;
}
