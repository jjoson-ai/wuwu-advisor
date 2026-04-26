"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DecisionSafetyResponse } from "@/domain/decision/decision.safety";
import type { CareModePayload } from "@/domain/safety/care-mode";
import type { OutputSafetyBlockPayload } from "@/domain/safety/output-safety";
import type { AskTurnRow } from "@/domain/decision/decision.types";
import { PRODUCT_PLATFORM_HEADER } from "@/lib/product-events";

const GENERATION_TIMEOUT_MS = 90_000;
import { readGenerationStream } from "@/lib/client-generation-stream";
import { CareModeCard } from "@/components/care-mode-card";
import { SafetyBlockCard } from "@/components/safety-block-card";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { UpgradeProButton } from "@/components/upgrade-pro-button";

type AskFollowUpFormProps = {
  conversationId: string;
  canFollowUpUnlimited: boolean;
  freeFollowUpsUsed: number;
  freeFollowUpLimit: number;
  atTurnLimit: boolean;
  suggestedFollowups: string[];
};

export function AskFollowUpForm({
  conversationId,
  canFollowUpUnlimited,
  freeFollowUpsUsed,
  freeFollowUpLimit,
  atTurnLimit,
  suggestedFollowups: initialSuggestions,
}: AskFollowUpFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<DecisionSafetyResponse | null>(null);
  const [careMode, setCareMode] = useState<CareModePayload | null>(null);
  const [safetyBlock, setSafetyBlock] =
    useState<OutputSafetyBlockPayload | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions);

  const isAtFreeLimit =
    canFollowUpUnlimited === false && freeFollowUpsUsed >= freeFollowUpLimit;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (message.trim() === "") {
      setError("Please enter a follow-up.");
      return;
    }

    if (isAtFreeLimit) {
      setShowUpgrade(true);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSafety(null);
    setCareMode(null);
    setSafetyBlock(null);
    setShowUpgrade(false);
    setStreamingText("");
    setCurrentStage(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch("/api/ask-follow-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [PRODUCT_PLATFORM_HEADER]: "web",
        },
        body: JSON.stringify({ conversationId, message }),
        signal: controller.signal,
      });

      if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
        let streamCompleted = false;

        for await (const event of readGenerationStream(response)) {
          if (event.type === "stage") {
            setCurrentStage(event.label);
          } else if (event.type === "chunk") {
            setStreamingText((prev) => (prev ?? "") + event.text);
          } else if (event.type === "done") {
            streamCompleted = true;
            const payload = event.payload as {
              suggestedFollowups?: string[];
              care_mode?: CareModePayload;
              safety_block?: OutputSafetyBlockPayload;
            } | null;

            if (payload?.care_mode !== undefined) {
              // Crisis detected in output. Discard any streamed chunks and
              // show Care Mode instead.
              setCareMode(payload.care_mode);
              setMessage("");
              setStreamingText(null);
              return;
            }

            if (payload?.safety_block !== undefined) {
              // Output safety classifier flagged. Discard any streamed
              // chunks (the partial response was unsafe) and show the
              // safety block card instead. Turn is NOT saved server-side.
              setSafetyBlock(payload.safety_block);
              setMessage("");
              setStreamingText(null);
              return;
            }

            setSuggestions(payload?.suggestedFollowups ?? []);
            setMessage("");
            setStreamingText(null);
            router.refresh();
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!streamCompleted) {
          throw new Error("Response was interrupted. Please try again.");
        }
      } else {
        const payload = (await response.json()) as {
          error?: string;
          safety?: DecisionSafetyResponse;
          care_mode?: CareModePayload;
          upgrade_required?: boolean;
          at_limit?: boolean;
        };

        if (response.status === 403 && payload.upgrade_required) {
          setShowUpgrade(true);
          return;
        }

        if (payload.at_limit) {
          setError(payload.error ?? "Conversation limit reached.");
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error || "Unable to get follow-up.");
        }

        if (payload.care_mode !== undefined) {
          setCareMode(payload.care_mode);
          return;
        }

        if (payload.safety !== undefined) {
          setSafety(payload.safety);
          return;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("This is taking longer than usual. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to get follow-up.");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
      setCurrentStage(null);
      if (!isSubmitting) setStreamingText(null);
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setMessage(suggestion);
  }

  if (atTurnLimit) {
    return (
      <div className="card card-muted stack">
        <p className="card-eyebrow">Conversation limit reached</p>
        <h2 className="card-title">Start a new question</h2>
        <p className="card-subtitle">
          This conversation has reached its limit. Ask a new question for fresh guidance.
        </p>
        <a href="/decision" className="button" style={{ display: "inline-block", textAlign: "center" }}>
          Ask a new question
        </a>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {streamingText !== null && streamingText !== "" ? (
        <div className="card card-featured stack">
          <p className="card-eyebrow">Follow-up response</p>
          <div className="text-block" style={{ maxWidth: "50rem" }}>
            {streamingText.split("\n\n").filter(Boolean).map((paragraph, i) => (
              <p key={i} style={{ margin: 0 }}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {suggestions.length > 0 && !isSubmitting ? (
        <div className="stack" style={{ gap: "0.5rem" }}>
          <p className="card-eyebrow" style={{ margin: 0 }}>You might ask</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="button secondary"
                style={{ fontSize: "0.875rem" }}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isAtFreeLimit && !showUpgrade ? (
        <div className="card card-muted stack">
          <p className="card-eyebrow">Follow-up limit reached</p>
          <h2 className="card-title">Upgrade for unlimited follow-ups</h2>
          <p className="card-subtitle">
            Free accounts include one follow-up per question. Pro unlocks unlimited.
          </p>
          <UpgradeProButton
            className="button"
            feature="ask"
            label="Start 7-day free trial"
            upgradeSurface="ask_followup_limit"
          />
        </div>
      ) : (
        <form className="card stack" onSubmit={handleSubmit}>
          <p className="card-eyebrow">Follow up</p>
          <label className="field">
            <span>Ask a follow-up</span>
            <textarea
              name="message"
              placeholder="What aspect would you like to explore further?"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
            />
          </label>

          {!canFollowUpUnlimited && freeFollowUpsUsed < freeFollowUpLimit ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {freeFollowUpLimit - freeFollowUpsUsed} free follow-up remaining. Upgrade to Pro for unlimited.
            </p>
          ) : null}

          <div className="page-actions">
            <button
              className="button"
              disabled={isSubmitting}
              style={{ width: "100%" }}
              type="submit"
            >
              {isSubmitting ? "Working..." : "Send follow-up"}
            </button>
          </div>

          {isSubmitting ? (
            <GenerationLoadingState
              compact
              stages={["Crafting your response"]}
              currentStage={currentStage ?? undefined}
            />
          ) : null}

          {error !== null ? (
            <p className="muted" style={{ margin: 0 }}>
              {error}
            </p>
          ) : null}

          {showUpgrade ? (
            <UpgradeProButton
              className="button"
              feature="ask"
              label="Start 7-day free trial"
              upgradeSurface="ask_followup_limit"
            />
          ) : null}
        </form>
      )}

      {careMode !== null ? (
        <CareModeCard feature="ask" payload={careMode} />
      ) : null}

      {safetyBlock !== null ? (
        <SafetyBlockCard
          feature="ask"
          payload={safetyBlock}
          onRetry={() => {
            setSafetyBlock(null);
          }}
        />
      ) : null}

      {safety !== null ? (
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
      ) : null}
    </div>
  );
}
