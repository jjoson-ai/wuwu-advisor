"use client";

import { useState } from "react";

import { trackProductEvent } from "@/lib/client-events";
import type { ProductFeature } from "@/lib/product-events";
import { startProCheckout } from "@/lib/pro-checkout";

type UpgradeProButtonProps = {
  label?: string;
  upgradeSurface: string;
  feature?: ProductFeature;
  className?: string;
  style?: React.CSSProperties;
  onError?: (message: string) => void;
};

export function UpgradeProButton({
  label = "Unlock Pro",
  upgradeSurface,
  feature,
  className = "button secondary",
  style,
  onError,
}: UpgradeProButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    onError?.("");

    try {
      await trackProductEvent({
        event_name: "upgrade_clicked",
        feature: feature ?? null,
        plan_type: "pro",
        upgrade_surface: upgradeSurface,
      });

      await startProCheckout({ upgradeSurface });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start checkout.";
      onError?.(message);
      setIsSubmitting(false);
    }
  }

  return (
    <button
      className={className}
      disabled={isSubmitting}
      onClick={() => {
        void handleClick();
      }}
      style={style}
      type="button"
    >
      {isSubmitting ? "Redirecting..." : label}
    </button>
  );
}
