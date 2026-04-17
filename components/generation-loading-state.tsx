"use client";

import { useEffect, useState } from "react";

type GenerationLoadingStateProps = {
  stages: string[];
  compact?: boolean;
  currentStage?: string;
};

export function GenerationLoadingState({
  stages,
  compact = false,
  currentStage,
}: GenerationLoadingStateProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const activeStages = stages.length > 0 ? stages : ["Working on it"];

  useEffect(() => {
    if (currentStage !== undefined || activeStages.length <= 1) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % activeStages.length);
    }, 2200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeStages, currentStage]);

  useEffect(() => {
    setStageIndex(0);
  }, [activeStages]);

  const displayStage = currentStage ?? activeStages[stageIndex];

  return (
    <div
      className={`generation-loading${compact ? " generation-loading-compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="generation-loading-copy">
        <p className="generation-loading-label">In progress</p>
        <p className="generation-loading-stage">{displayStage}</p>
      </div>
      <div className="generation-loading-track" aria-hidden="true">
        <div className="generation-loading-fill" />
      </div>
    </div>
  );
}
