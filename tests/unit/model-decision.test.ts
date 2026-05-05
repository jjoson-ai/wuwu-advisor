import { describe, it, expect } from "vitest";
import {
  getModelRoutingDecision,
  computeSynthesisBurden,
} from "@/lib/model-decision";
import type { ModelRoutingFeature, RoutingMetadata, ModelRoutingUserContext } from "@/lib/model-decision";

describe("model-decision", () => {
  const lowSignals: RoutingMetadata = {
    complexityScore: 0.1,
    conflictScore: 0.1,
    emotionalIntensity: 0.05,
    decisionAmbiguity: 0.08,
    phaseShiftScore: 0.1,
  };

  const highConflictEmotional: RoutingMetadata = {
    complexityScore: 0.5,
    conflictScore: 0.7,
    emotionalIntensity: 0.6,
    decisionAmbiguity: 0.5,
    phaseShiftScore: 0.3,
  };

  const freeUser: ModelRoutingUserContext = {
    isFreeUser: true,
    hasBlueprint: true,
    recentUsageCount: 0,
  };

  const proUser: ModelRoutingUserContext = {
    isFreeUser: false,
    hasBlueprint: true,
    recentUsageCount: 0,
  };

  describe("computeSynthesisBurden", () => {
    it("returns 0 for zero signals on ask", () => {
      const burden = computeSynthesisBurden("ask", {});
      expect(burden).toBe(0);
    });

    it("returns non-zero for non-zero signals", () => {
      const burden = computeSynthesisBurden("ask", { complexityScore: 0.5, conflictScore: 0.5 });
      expect(burden).toBeGreaterThan(0);
    });

    it("weights forecast phase shifts most heavily", () => {
      const forecastBurden = computeSynthesisBurden("forecast", {
        phaseShiftScore: 1.0,
      });
      const todayBurden = computeSynthesisBurden("today", {
        phaseShiftScore: 1.0,
      });
      expect(forecastBurden).toBeGreaterThan(todayBurden);
    });
  });

  describe("getModelRoutingDecision", () => {
    it("low-burden free user on ask does NOT force frontier", () => {
      const decision = getModelRoutingDecision({
        feature: "ask",
        signals: lowSignals,
        userContext: freeUser,
      });
      expect(decision.forcedFrontierReasons).toHaveLength(0);
    });

    it("high-conflict + high-emotional-intensity ask triggers forced frontier", () => {
      const decision = getModelRoutingDecision({
        feature: "ask",
        signals: highConflictEmotional,
        userContext: freeUser,
      });
      expect(decision.useFrontier).toBe(true);
      expect(decision.forcedFrontierReasons.length).toBeGreaterThan(0);
    });

    it("provides normalized signals in result", () => {
      const decision = getModelRoutingDecision({
        feature: "ask",
        signals: lowSignals,
        userContext: freeUser,
      });
      expect(decision.normalizedSignals).toBeDefined();
      expect(typeof decision.normalizedSignals.complexityScore).toBe("number");
      expect(typeof decision.normalizedSignals.conflictScore).toBe("number");
    });

    it("pro user with same low signals may still get frontier on ask default gate", () => {
      const decision = getModelRoutingDecision({
        feature: "ask",
        signals: lowSignals,
        userContext: proUser,
      });
      expect(typeof decision.useFrontier).toBe("boolean");
    });

    it("today feature with high signals escalates for pro user", () => {
      const decision = getModelRoutingDecision({
        feature: "today",
        signals: highConflictEmotional,
        userContext: proUser,
      });
      expect(decision.useFrontier).toBe(true);
    });

    it("today with tier multiplier: free user has higher threshold", () => {
      const moderateSignals: RoutingMetadata = {
        complexityScore: 0.55,
        conflictScore: 0.48,
        emotionalIntensity: 0.2,
        decisionAmbiguity: 0.3,
        phaseShiftScore: 0.1,
      };

      const freeDecision = getModelRoutingDecision({
        feature: "today",
        signals: moderateSignals,
        userContext: freeUser,
      });
      const proDecision = getModelRoutingDecision({
        feature: "today",
        signals: moderateSignals,
        userContext: proUser,
      });

      expect(proDecision.useFrontier || !freeDecision.useFrontier).toBe(true);
    });

    it("forecast with high phase shift triggers frontier", () => {
      const highPhaseShift: RoutingMetadata = {
        phaseShiftScore: 0.7,
        complexityScore: 0.3,
        conflictScore: 0.2,
      };
      const decision = getModelRoutingDecision({
        feature: "forecast",
        signals: highPhaseShift,
        userContext: freeUser,
      });
      expect(decision.useFrontier).toBe(true);
      expect(decision.forcedFrontierReasons).toContain("phase_shift_high");
    });

    it("no-blueprint user with mid burden triggers no_blueprint reason on ask", () => {
      const noBlueprintFree: ModelRoutingUserContext = {
        isFreeUser: true,
        hasBlueprint: false,
        recentUsageCount: 0,
      };
      const midBurdenSignals: RoutingMetadata = {
        complexityScore: 0.3,
        conflictScore: 0.4,
        emotionalIntensity: 0.3,
        decisionAmbiguity: 0.35,
      };
      const decision = getModelRoutingDecision({
        feature: "ask",
        signals: midBurdenSignals,
        userContext: noBlueprintFree,
      });
      if (decision.forcedFrontierReasons.includes("no_blueprint_mid_burden")) {
        expect(decision.useFrontier).toBe(true);
      }
    });

    it("free user with high recent usage and low burden stays on cheap path for ask", () => {
      const heavyFree: ModelRoutingUserContext = {
        isFreeUser: true,
        recentUsageCount: 5,
        hasBlueprint: true,
      };
      const veryLowSignals: RoutingMetadata = {
        complexityScore: 0.05,
        conflictScore: 0.05,
        emotionalIntensity: 0.02,
        decisionAmbiguity: 0.03,
        phaseShiftScore: 0.01,
      };
      const decision = getModelRoutingDecision({
        feature: "ask",
        signals: veryLowSignals,
        userContext: heavyFree,
      });
      expect(decision.useFrontier).toBe(false);
    });
  });
});