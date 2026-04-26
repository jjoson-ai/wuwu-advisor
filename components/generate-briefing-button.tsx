"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getUsageCount, incrementUsageCount } from "@/lib/client-usage-limits";
import { PRODUCT_PLATFORM_HEADER } from "@/lib/product-events";
import { trackProductEvent } from "@/lib/client-events";
import { readGenerationStream } from "@/lib/client-generation-stream";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { UpgradeProButton } from "@/components/upgrade-pro-button";

const GENERATION_TIMEOUT_MS = 90_000;

type GenerateBriefingButtonProps = {
  canGenerateUnlimitedToday: boolean;
  todayRefreshesPerDay: number | null;
  hasBriefing: boolean;
  userKey: string;
};

export function GenerateBriefingButton({
  canGenerateUnlimitedToday,
  todayRefreshesPerDay,
  hasBriefing,
  userKey,
}: GenerateBriefingButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  async function handleClick() {
    if (
      hasBriefing &&
      canGenerateUnlimitedToday === false &&
      todayRefreshesPerDay !== null
    ) {
      const refreshCount = getUsageCount("today-refresh", userKey);

      if (refreshCount >= todayRefreshesPerDay) {
        setShowUpgradePrompt(true);
        setError("Unlock unlimited refreshes for sharper daily timing.");
        void trackProductEvent(
          {
            event_name: "paywall_shown",
            feature: "today",
            plan_type: "pro",
            upgrade_surface: "today_refresh_limit",
          },
          { onceKey: "paywall:today:today_refresh_limit" },
        );
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    setShowUpgradePrompt(false);
    setCurrentStage(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch("/api/generate-briefing", {
        method: "POST",
        headers: {
          [PRODUCT_PLATFORM_HEADER]: "web",
        },
        signal: controller.signal,
      });

      if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
        let streamCompleted = false;

        for await (const event of readGenerationStream(response)) {
          if (event.type === "stage") {
            setCurrentStage(event.label);
          } else if (event.type === "done") {
            streamCompleted = true;
            if (
              hasBriefing &&
              canGenerateUnlimitedToday === false &&
              todayRefreshesPerDay !== null
            ) {
              incrementUsageCount("today-refresh", userKey);
            }
            router.refresh();
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }

        if (!streamCompleted) {
          throw new Error("Generation was interrupted. Please try again.");
        }
      } else {
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to generate briefing.");
        }

        if (
          hasBriefing &&
          canGenerateUnlimitedToday === false &&
          todayRefreshesPerDay !== null
        ) {
          incrementUsageCount("today-refresh", userKey);
        }

        router.refresh();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("This is taking longer than usual. Please try again.");
      } else {
        setError(
          err instanceof Error ? err.message : "Unable to generate briefing.",
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
      setCurrentStage(null);
    }
  }

  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      <div
        className="stack"
        style={{ gap: "0.5rem", maxWidth: "20rem", width: "100%" }}
      >
        <button
          className="button"
          data-testid="generate-briefing-btn"
          disabled={isSubmitting}
          onClick={handleClick}
          style={{ width: "100%" }}
          type="button"
        >
          {isSubmitting
            ? "Working..."
            : hasBriefing
              ? "Refresh Today"
              : "Generate Today"}
        </button>
        {isSubmitting ? (
          <GenerationLoadingState
            compact
            stages={["Reading today's pattern", "Shaping today's guidance"]}
            currentStage={currentStage ?? undefined}
          />
        ) : null}
      </div>
      {error !== null ? (
        <div className="stack" style={{ gap: "0.4rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            {error}
          </p>
          {!showUpgradePrompt ? (
            <button
              className="button secondary"
              onClick={handleClick}
              style={{ alignSelf: "flex-start" }}
              type="button"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {showUpgradePrompt ? (
        <UpgradeProButton
          className="button secondary"
          feature="today"
          label="Start 7-day free trial"
          upgradeSurface="today_refresh_limit"
        />
      ) : null}
    </div>
  );
}
