import { getModelForPass, type RoutedModel } from "@/lib/model-routing";

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
          primary_model: getModelForPass("synthesize"),
          cheap_model: getModelForPass("synthesize"),
          frontier_model: getModelForPass("synthesize"),
          fallback_models: [],
          note: "Blueprint uses single-pass Opus (synthesize).",
        };
      }

      return {
        mode: "production_control",
        cheap_model: getModelForPass("compose"),
        frontier_model: getModelForPass("synthesize"),
        fallback_models: [getModelForPass("synthesize")],
        note: "Today, Forecast, and Ask follow the live extract/compose/synthesize routing.",
      };
    },
  },
];

export function getVariantById(id: string) {
  return BAKEOFF_VARIANTS.find((variant) => variant.id === id) ?? null;
}
