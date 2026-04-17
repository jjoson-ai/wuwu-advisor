"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { readGenerationStream } from "@/lib/client-generation-stream";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { PRODUCT_PLATFORM_HEADER } from "@/lib/product-events";

type GenerateBlueprintButtonProps = {
  label?: string;
};

export function GenerateBlueprintButton({
  label = "Generate My Blueprint",
}: GenerateBlueprintButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setError(null);
    setCurrentStage(null);

    try {
      const response = await fetch("/api/generate-blueprint", {
        method: "POST",
        headers: {
          [PRODUCT_PLATFORM_HEADER]: "web",
        },
      });

      if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
        for await (const event of readGenerationStream(response)) {
          if (event.type === "stage") {
            setCurrentStage(event.label);
          } else if (event.type === "done") {
            router.refresh();
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      } else {
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to generate blueprint.");
        }

        router.refresh();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to generate blueprint.",
      );
    } finally {
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
          disabled={isSubmitting}
          onClick={handleClick}
          style={{ width: "100%" }}
          type="button"
        >
          {isSubmitting ? "Working..." : label}
        </button>
        {isSubmitting ? (
          <GenerationLoadingState
            compact
            stages={["Reading your core pattern", "Building your blueprint"]}
            currentStage={currentStage ?? undefined}
          />
        ) : null}
      </div>
      {error === null ? null : (
        <p className="muted" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
