"use client";

import { useEffect } from "react";

import type {
  OutputSafetyBlockPayload,
  OutputSafetyCategory,
} from "@/domain/safety/output-safety";
import { trackProductEvent } from "@/lib/client-events";
import type { ProductFeature } from "@/lib/product-events";

type SafetyBlockCardProps = {
  payload: OutputSafetyBlockPayload;
  feature?: ProductFeature;
  onRetry?: () => void;
};

/**
 * Safety block card — shown when the output-safety classifier flags an LLM
 * output into one of the seven banned categories (roadmap 1.8).
 *
 * Copy comes from the server-built payload; we never localize or substitute
 * on the client. The card intentionally does NOT surface which specific
 * category tripped by name — the headline + message are enough for the user
 * to understand what happened, without turning into a "here's what you
 * typed to get there" inspector.
 *
 * We fire a client-side `output_safety_blocked` event so we can correlate
 * UI-render success against server-side block counts.
 */
export function SafetyBlockCard({
  payload,
  feature,
  onRetry,
}: SafetyBlockCardProps) {
  useEffect(() => {
    void trackProductEvent(
      {
        event_name: "output_safety_blocked",
        feature: feature ?? null,
        plan_type: null,
        upgrade_surface: null,
      },
      {
        onceKey: `output_safety_blocked:${categoryToKey(payload.category)}:${Date.now()}`,
      },
    );
  }, [feature, payload.category]);

  return (
    <div
      className="card card-state stack"
      data-testid="safety-block-card"
      data-category={payload.category}
      role="alert"
      aria-live="polite"
      style={{
        borderColor: "var(--warning, var(--accent))",
        borderWidth: 2,
      }}
    >
      <p className="card-eyebrow" style={{ color: "var(--warning, var(--accent))" }}>
        Reflection not advice
      </p>
      <h2 className="card-title">{payload.headline}</h2>
      <p style={{ margin: 0, lineHeight: 1.7 }}>{payload.message}</p>
      <p
        className="muted"
        style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}
      >
        {payload.disclaimer}
      </p>
      {onRetry === undefined ? null : (
        <div>
          <button
            className="button secondary"
            type="button"
            onClick={onRetry}
          >
            Ask again
          </button>
        </div>
      )}
    </div>
  );
}

function categoryToKey(category: OutputSafetyCategory): string {
  return category;
}
