import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OUTPUT_SAFETY_RULE_COUNTS,
  OUTPUT_SAFETY_CATEGORIES,
  buildOutputSafetyBlockPayload,
} from "@/domain/safety/output-safety";

vi.mock("@/lib/llm", () => ({
  generateJsonObjectWithMeta: vi.fn(),
}));

vi.mock("@/lib/cost-events.server", () => ({
  logLlmCost: vi.fn(),
}));

describe("output-safety (regex prefilter)", () => {
  describe("OUTPUT_SAFETY_RULE_COUNTS", () => {
    it("reports non-zero regex rule counts", () => {
      expect(OUTPUT_SAFETY_RULE_COUNTS.regex).toBeGreaterThan(0);
      expect(OUTPUT_SAFETY_RULE_COUNTS.financialInstrument).toBeGreaterThan(0);
      expect(OUTPUT_SAFETY_RULE_COUNTS.directiveVerdict).toBeGreaterThan(0);
      expect(OUTPUT_SAFETY_RULE_COUNTS.deathPregnancy).toBeGreaterThan(0);
      expect(OUTPUT_SAFETY_RULE_COUNTS.cultPhrase).toBeGreaterThan(0);
    });
  });

  describe("OUTPUT_SAFETY_CATEGORIES", () => {
    it("contains all seven banned categories", () => {
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("medical_prediction");
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("fatalistic_determinism");
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("identity_pathologizing");
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("protected_class_generalization");
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("specific_financial_instrument");
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("directive_life_verdict");
      expect(OUTPUT_SAFETY_CATEGORIES).toContain("predictive_death_injury_pregnancy");
    });
  });

  describe("classifyOutputSafety (regex prefilter only)", () => {
    let classifyOutputSafety: typeof import("@/domain/safety/output-safety").classifyOutputSafety;

    beforeEach(async () => {
      const mod = await import("@/domain/safety/output-safety");
      classifyOutputSafety = mod.classifyOutputSafety;
    });

    it("flags cult-phrase 'destined to' as unsafe", async () => {
      const result = await classifyOutputSafety(
        "You are destined to find love this year.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
      expect(result.detectionPath).toBe("regex");
    });

    it("flags cult-phrase 'meant to be' as unsafe", async () => {
      const result = await classifyOutputSafety(
        "This relationship was meant to be.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
      expect(result.detectionPath).toBe("regex");
    });

    it("flags cult-phrase 'fated' as unsafe", async () => {
      const result = await classifyOutputSafety(
        "You are fated to struggle with love.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
    });

    it("flags cult-phrase 'written in the stars' as unsafe", async () => {
      const result = await classifyOutputSafety(
        "Your meeting was written in the stars.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
    });

    it("flags cult-phrase 'the universe wants' as unsafe", async () => {
      const result = await classifyOutputSafety(
        "The universe wants you to take this path.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
    });

    it("does NOT flag non-deterministic reflection text", async () => {
      const { generateJsonObjectWithMeta } = await import("@/lib/llm");
      const mocked = vi.mocked(generateJsonObjectWithMeta);
      mocked.mockResolvedValue({
        parsedJson: { verdict: "safe", category: null, severity: "low", rationale: "Fine" },
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cache_creation_input_tokens: null, cache_read_input_tokens: null },
        estimatedCostUsd: 0.001,
        costIsEstimated: true,
        duration_ms: 100,
      });

      const result = await classifyOutputSafety(
        "This transit often correlates with periods of reflection. Notice if you feel drawn to reconsider your priorities.",
      );
      expect(result.verdict).toBe("safe");
    });

    it("flags financial instrument with named ticker", async () => {
      const result = await classifyOutputSafety(
        "Your Venus return is ideal for buying Tesla stock.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("specific_financial_instrument");
      expect(result.detectionPath).toBe("regex");
    });

    it("flags financial instrument with crypto", async () => {
      const result = await classifyOutputSafety(
        "Hold BTC through Mercury retrograde.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("specific_financial_instrument");
    });

    it("flags specific dollar amount investment", async () => {
      const result = await classifyOutputSafety(
        "Invest 5000 into an index fund before Jupiter turns direct.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("specific_financial_instrument");
    });

    it("flags directive life verdict to leave partner", async () => {
      const result = await classifyOutputSafety(
        "You should leave your husband.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("directive_life_verdict");
    });

    it("flags directive life verdict to quit job", async () => {
      const result = await classifyOutputSafety(
        "You need to quit your job.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("directive_life_verdict");
    });

    it("flags predictive pregnancy", async () => {
      const result = await classifyOutputSafety(
        "You'll get pregnant in March.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("predictive_death_injury_pregnancy");
    });

    it("flags predictive death of relation", async () => {
      const result = await classifyOutputSafety(
        "Your father will die this year.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("predictive_death_injury_pregnancy");
    });

    it("returns safe for empty string", async () => {
      const result = await classifyOutputSafety("");
      expect(result.verdict).toBe("safe");
    });
  });

  // --- Cult-phrase false-positive QA (audit 2.6, 2025-05) ---
  // Verifies that legitimate astrology vocabulary does NOT trigger the
  // cult-phrase regex rules. These are the edge cases most likely to
  // produce false positives.
  describe("cult-phrase regex: false-positive edge cases", () => {
    let classifyOutputSafety: typeof import("@/domain/safety/output-safety").classifyOutputSafety;

    beforeEach(async () => {
      const mod = await import("@/domain/safety/output-safety");
      classifyOutputSafety = mod.classifyOutputSafety;
      const { generateJsonObjectWithMeta } = await import("@/lib/llm");
      vi.mocked(generateJsonObjectWithMeta).mockResolvedValue({
        parsedJson: { verdict: "safe", category: null, severity: "low", rationale: "Fine" },
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cache_creation_input_tokens: null, cache_read_input_tokens: null },
        estimatedCostUsd: 0.001,
        costIsEstimated: true,
        duration_ms: 100,
      });
    });

    it("does NOT flag 'destination' (not 'destiny')", async () => {
      const result = await classifyOutputSafety(
        "This transit points toward your next destination in life.",
      );
      expect(result.verdict).toBe("safe");
    });

    it("does NOT flag 'fateful' (not 'fate')", async () => {
      const result = await classifyOutputSafety(
        "A fateful encounter may reshape your perspective.",
      );
      // 'fateful' does not match \bfat(?:e|ed)\b — the 'ful' suffix
      // prevents the word boundary from matching after 'fate'.
      expect(result.verdict).toBe("safe");
    });

    it("does NOT flag 'fatal' or 'fatigue'", async () => {
      const r1 = await classifyOutputSafety(
        "Avoid fatal assumptions about what others intend.",
      );
      expect(r1.verdict).toBe("safe");

      const r2 = await classifyOutputSafety(
        "You may notice fatigue building toward the end of the week.",
      );
      expect(r2.verdict).toBe("safe");
    });

    it("does NOT flag standard transit descriptions", async () => {
      const result = await classifyOutputSafety(
        "Mercury squaring Saturn this week often correlates with communication delays. Mars in your 10th house suggests high career energy.",
      );
      expect(result.verdict).toBe("safe");
    });

    it("does NOT flag reflection-framed pattern language", async () => {
      const result = await classifyOutputSafety(
        "This pattern may repeat until you notice it. Sit with the question: what would you regret more in five years?",
      );
      expect(result.verdict).toBe("safe");
    });

    it("does NOT flag 'cosmic energy' or 'cosmic pattern'", async () => {
      const result = await classifyOutputSafety(
        "The cosmic energy this week favors introspection. Notice the cosmic pattern between your 7th and 10th houses.",
      );
      expect(result.verdict).toBe("safe");
    });

    it("does NOT flag 'star sign' or 'the stars suggest'", async () => {
      const result = await classifyOutputSafety(
        "Your star sign's ruling planet enters Capricorn. The stars suggest a period of reflection.",
      );
      expect(result.verdict).toBe("safe");
    });

    it("does NOT flag 'universal theme' or 'universal pattern'", async () => {
      const result = await classifyOutputSafety(
        "This is a universal theme in Saturn returns — the tension between structure and freedom.",
      );
      expect(result.verdict).toBe("safe");
    });

    // Intentional true positives — these SHOULD be caught
    it("DOES flag 'destiny' in astrology context", async () => {
      const result = await classifyOutputSafety(
        "Your chart reveals your true destiny.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
    });

    it("DOES flag 'fate' in astrology context", async () => {
      const result = await classifyOutputSafety(
        "Accept your fate — Saturn demands it.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
    });

    it("DOES flag 'you were born to' even in soft framing", async () => {
      const result = await classifyOutputSafety(
        "With Sun in Leo, you were born to lead.",
      );
      expect(result.verdict).toBe("unsafe");
      expect(result.category).toBe("fatalistic_determinism");
    });
  });

  describe("buildOutputSafetyBlockPayload", () => {
    it("produces safety_block payload for fatalistic_determinism", () => {
      const payload = buildOutputSafetyBlockPayload("fatalistic_determinism");
      expect(payload.mode).toBe("safety_block");
      expect(payload.category).toBe("fatalistic_determinism");
      expect(payload.headline).toBeTruthy();
      expect(payload.message).toBeTruthy();
      expect(payload.disclaimer).toBeTruthy();
    });

    it("produces safety_block payload for all categories", () => {
      for (const category of OUTPUT_SAFETY_CATEGORIES) {
        const payload = buildOutputSafetyBlockPayload(category);
        expect(payload.mode).toBe("safety_block");
        expect(payload.category).toBe(category);
      }
    });
  });
});