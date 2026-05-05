import { describe, it, expect } from "vitest";
import {
  detectCrisisInput,
  detectCrisisOutput,
  CRISIS_PATTERN_COUNTS,
} from "@/domain/safety/crisis-detection";

describe("crisis-detection", () => {
  describe("CRISIS_PATTERN_COUNTS", () => {
    it("reports non-zero pattern counts", () => {
      expect(CRISIS_PATTERN_COUNTS.benign).toBeGreaterThan(0);
      expect(CRISIS_PATTERN_COUNTS.criticalInput).toBeGreaterThan(0);
      expect(CRISIS_PATTERN_COUNTS.elevatedInput).toBeGreaterThan(0);
      expect(CRISIS_PATTERN_COUNTS.criticalOutput).toBeGreaterThanOrEqual(
        CRISIS_PATTERN_COUNTS.criticalInput,
      );
    });
  });

  describe("detectCrisisInput", () => {
    it("returns not triggered for empty string", () => {
      const result = detectCrisisInput("");
      expect(result.triggered).toBe(false);
      expect(result.severity).toBe("none");
      expect(result.layer).toBe("input");
    });

    it("returns not triggered for normal astrology question", () => {
      const result = detectCrisisInput(
        "What does Mercury in retrograde mean for my career this month?",
      );
      expect(result.triggered).toBe(false);
      expect(result.severity).toBe("none");
    });

    it("detects critical self-harm intent", () => {
      const result = detectCrisisInput("I want to kill myself");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("critical");
      expect(result.patternIndex).not.toBeNull();
    });

    it("detects ending life intent", () => {
      const result = detectCrisisInput("I want to end my life");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("detects harming myself", () => {
      const result = detectCrisisInput("I am harming myself");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("does not trigger on benign suicide prevention context", () => {
      const result = detectCrisisInput(
        "I am studying suicide prevention for my research paper",
      );
      expect(result.triggered).toBe(false);
      expect(result.severity).toBe("none");
    });

    it("does not trigger on third-party concern", () => {
      const result = detectCrisisInput(
        "My friend attempted suicide and I want to help them",
      );
      expect(result.triggered).toBe(false);
      expect(result.severity).toBe("none");
    });

    it("detects elevated passive ideation", () => {
      const result = detectCrisisInput("There's no point to live anymore");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("elevated");
    });

    it("detects elevated hopelessness", () => {
      const result = detectCrisisInput("I wish I was dead");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("elevated");
    });

    it("detects elevated suicidal framing without benign context", () => {
      const result = detectCrisisInput("I feel suicidal lately");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("elevated");
    });

    it("returns input layer for all results", () => {
      const result = detectCrisisInput("test");
      expect(result.layer).toBe("input");
    });
  });

  describe("detectCrisisOutput", () => {
    it("returns not triggered for empty string", () => {
      const result = detectCrisisOutput("");
      expect(result.triggered).toBe(false);
      expect(result.severity).toBe("none");
      expect(result.layer).toBe("output");
    });

    it("returns not triggered for safe astrology content", () => {
      const result = detectCrisisOutput(
        "Mercury squaring Saturn may correlate with communication delays this week.",
      );
      expect(result.triggered).toBe(false);
    });

    it("detects critical output with self-harm content", () => {
      const result = detectCrisisOutput("You should kill yourself");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("detects output instructing self-harm methods", () => {
      const result = detectCrisisOutput(
        "Here's how you could end your life",
      );
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("detects output with dosage instructions", () => {
      const result = detectCrisisOutput("Take 200 mg of aspirin");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("returns output layer for all results", () => {
      const result = detectCrisisOutput("test");
      expect(result.layer).toBe("output");
    });
  });
});