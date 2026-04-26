"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DecisionSafetyResponse } from "@/domain/decision/decision.safety";
import type { CareModePayload } from "@/domain/safety/care-mode";
import type { OutputSafetyBlockPayload } from "@/domain/safety/output-safety";
import { PRODUCT_DECISION_PROMISE } from "@/lib/brand";
import {
  getUsageCount,
  incrementUsageCount,
  getWeeklyBigDecisionCount,
  incrementWeeklyBigDecisionCount,
} from "@/lib/client-usage-limits";
import { PRODUCT_PLATFORM_HEADER } from "@/lib/product-events";
import { trackProductEvent } from "@/lib/client-events";
import { readGenerationStream } from "@/lib/client-generation-stream";
import { CareModeCard } from "@/components/care-mode-card";
import { SafetyBlockCard } from "@/components/safety-block-card";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { UpgradeProButton } from "@/components/upgrade-pro-button";

const GENERATION_TIMEOUT_MS = 90_000;

type DecisionGuidanceFormProps = {
  canAskUnlimited: boolean;
  askQuestionsPerDay: number | null;
  askBigDecisionPerWeek: number | null;
  userKey: string;
};

export function DecisionGuidanceForm({
  canAskUnlimited,
  askQuestionsPerDay,
  askBigDecisionPerWeek,
  userKey,
}: DecisionGuidanceFormProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [safety, setSafety] = useState<DecisionSafetyResponse | null>(null);
  const [careMode, setCareMode] = useState<CareModePayload | null>(null);
  const [safetyBlock, setSafetyBlock] =
    useState<OutputSafetyBlockPayload | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showBigDecisionOption, setShowBigDecisionOption] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  async function runGeneration(q: string, isBigDecision = false) {
    setIsSubmitting(true);
    setError(null);
    setCanRetry(false);
    setSafety(null);
    setCareMode(null);
    setSafetyBlock(null);
    setShowUpgradePrompt(false);
    setShowBigDecisionOption(false);
    setCurrentStage(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch("/api/generate-decision-guidance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [PRODUCT_PLATFORM_HEADER]: "web",
        },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });

      if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
        let streamCompleted = false;

        for await (const event of readGenerationStream(response)) {
          if (event.type === "stage") {
            setCurrentStage(event.label);
          } else if (event.type === "done") {
            streamCompleted = true;
            const payload = event.payload as
              | {
                  conversationId?: string;
                  care_mode?: CareModePayload;
                  safety_block?: OutputSafetyBlockPayload;
                }
              | null;

            if (payload?.care_mode !== undefined) {
              // Crisis detected in output — do NOT count toward usage
              // limits and do NOT navigate. Render Care Mode in place.
              setCareMode(payload.care_mode);
              setQuestion("");
              return;
            }

            if (payload?.safety_block !== undefined) {
              // Output safety classifier flagged. Do NOT count toward
              // usage limits (user wasn't charged for this attempt) and
              // do NOT navigate. Render SafetyBlockCard in place.
              setSafetyBlock(payload.safety_block);
              return;
            }

            if (canAskUnlimited === false) {
              if (isBigDecision) {
                incrementWeeklyBigDecisionCount(userKey);
              } else if (askQuestionsPerDay !== null) {
                incrementUsageCount("ask", userKey);
              }
            }
            setQuestion("");
            if (payload?.conversationId) {
              router.push(`/decision/${payload.conversationId}`);
            } else {
              router.refresh();
            }
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!streamCompleted) {
          throw new Error("Generation was interrupted. Please try again.");
        }
      } else {
        const payload = (await response.json()) as {
          error?: string;
          safety?: DecisionSafetyResponse;
          care_mode?: CareModePayload;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to get guidance.");
        }

        if (payload.care_mode !== undefined) {
          setCareMode(payload.care_mode);
          setQuestion("");
          return;
        }

        if (payload.safety !== undefined) {
          setSafety(payload.safety);
          return;
        }

        if (canAskUnlimited === false) {
          if (isBigDecision) {
            incrementWeeklyBigDecisionCount(userKey);
          } else if (askQuestionsPerDay !== null) {
            incrementUsageCount("ask", userKey);
          }
        }

        setQuestion("");
        router.refresh();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("This is taking longer than usual. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to get guidance.");
      }
      setCanRetry(true);
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
      setCurrentStage(null);
    }
  }

  async function handleBigDecisionSubmit() {
    if (question.trim() === "") {
      setError("Please enter a question.");
      return;
    }
    setShowBigDecisionOption(false);
    await runGeneration(question, true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (question.trim() === "") {
      setError("Please enter a question.");
      return;
    }

    if (canAskUnlimited === false && askQuestionsPerDay !== null) {
      const questionCount = getUsageCount("ask", userKey);

      if (questionCount >= askQuestionsPerDay) {
        // Daily limit hit — check weekly big-decision slot before showing paywall.
        if (
          askBigDecisionPerWeek !== null &&
          getWeeklyBigDecisionCount(userKey) < askBigDecisionPerWeek
        ) {
          setShowBigDecisionOption(true);
          setShowUpgradePrompt(false);
          setError(null);
          setSafety(null);
          return;
        }

        setShowUpgradePrompt(true);
        setShowBigDecisionOption(false);
        setError("Unlock unlimited Guidance for your next decisions.");
        setSafety(null);
        void trackProductEvent(
          {
            event_name: "paywall_shown",
            feature: "ask",
            plan_type: "pro",
            upgrade_surface: "ask_usage_limit",
          },
          { onceKey: "paywall:ask:ask_usage_limit" },
        );
        return;
      }
    }

    await runGeneration(question);
  }

  return (
    <form className="card card-feature stack" onSubmit={handleSubmit}>
      <div className="stack" style={{ gap: "0.35rem" }}>
        <p className="card-eyebrow">Ask a question</p>
        <h2 className="section-heading-serif">Ask one clear question</h2>
        <p className="card-subtitle">
          Keep it concrete. The sharper the decision, the sharper the guidance.
        </p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", fontWeight: 600 }}>
          {PRODUCT_DECISION_PROMISE}
        </p>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        Responses are generated by AI for reflection — not medical, legal, or
        financial advice. For specific financial, legal, medical, or
        relationship decisions, please consult a licensed professional.
      </p>

      <label className="field">
        <span>Your question</span>
        <textarea
          name="question"
          placeholder="Should I move forward with this job offer, or wait?"
          rows={4}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>

      <div className="page-actions">
        <button className="button" disabled={isSubmitting} style={{ width: "100%" }} type="submit">
          {isSubmitting ? "Working..." : "Get Guidance"}
        </button>
        {showBigDecisionOption ? (
          <div className="card card-muted stack" style={{ gap: "0.5rem" }}>
            <p className="card-eyebrow" style={{ margin: 0 }}>Daily limit reached</p>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              Your weekly <strong>Big Decision</strong> ask is available — use it for the question that matters most this week.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="button"
                disabled={isSubmitting}
                onClick={() => void handleBigDecisionSubmit()}
                type="button"
              >
                {isSubmitting ? "Working..." : "Use Big Decision Ask"}
              </button>
              <UpgradeProButton
                className="button secondary"
                feature="ask"
                label="Unlock unlimited"
                upgradeSurface="ask_usage_limit"
              />
            </div>
          </div>
        ) : null}
        {showUpgradePrompt ? (
          <UpgradeProButton
            className="button secondary"
            feature="ask"
            label="Start 7-day free trial"
            upgradeSurface="ask_usage_limit"
          />
        ) : null}
      </div>

      <div
        className="stack"
        style={{ gap: "0.5rem", maxWidth: "22rem", width: "100%" }}
      >
        {isSubmitting ? (
          <GenerationLoadingState
            compact
            stages={["Weighing your question", "Shaping your guidance"]}
            currentStage={currentStage ?? undefined}
          />
        ) : null}
      </div>

      {error !== null ? (
        <div className="stack" style={{ gap: "0.4rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            {error}
          </p>
          {canRetry ? (
            <button
              className="button secondary"
              onClick={() => void runGeneration(question)}
              style={{ alignSelf: "flex-start" }}
              type="button"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {careMode === null ? null : (
        <CareModeCard feature="ask" payload={careMode} />
      )}

      {safetyBlock === null ? null : (
        <SafetyBlockCard
          feature="ask"
          payload={safetyBlock}
          onRetry={() => {
            setSafetyBlock(null);
          }}
        />
      )}

      {safety === null ? null : (
        <div className="card card-state card-state--stale stack">
          <p className="card-eyebrow">Safety mode</p>
          <h2 className="card-title">{safety.headline}</h2>
          <p style={{ margin: 0, lineHeight: 1.7 }}>{safety.message}</p>
          <p style={{ margin: 0 }}>
            <strong>What to do now:</strong> {safety.urgent_action}
          </p>
          <div className="stack" style={{ gap: "0.35rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Resources</strong>
            </p>
            {safety.resources.map((item) => (
              <p key={item} style={{ margin: 0 }}>
                - {item}
              </p>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
