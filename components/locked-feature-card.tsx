"use client";

import { useEffect } from "react";

import { trackProductEvent } from "@/lib/client-events";
import type { ProductFeature } from "@/lib/product-events";
import { UpgradeProButton } from "@/components/upgrade-pro-button";

type LockedFeatureCardProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  statusLabel?: string;
  feature?: ProductFeature;
  upgradeSurface?: string;
  bullets?: string[];
  featured?: boolean;
  "data-testid"?: string;
};

export function LockedFeatureCard({
  title,
  description,
  ctaLabel = "Upgrade to Pro",
  statusLabel = "Included in Pro",
  feature,
  upgradeSurface,
  bullets,
  featured = false,
  "data-testid": dataTestId,
}: LockedFeatureCardProps) {
  useEffect(() => {
    if (feature == null || upgradeSurface == null) {
      return;
    }

    void trackProductEvent(
      {
        event_name: "paywall_shown",
        feature,
        plan_type: "pro",
        upgrade_surface: upgradeSurface,
      },
      {
        onceKey: `paywall:${feature}:${upgradeSurface}`,
      },
    );
  }, [feature, upgradeSurface]);

  const buttonClass = featured ? "button" : "button secondary";

  return (
    <div
      className={`card card-state card-state--locked stack${featured ? " card-featured" : ""}`}
      data-testid={dataTestId}
    >
      <p className="card-eyebrow">{statusLabel}</p>
      <h2 className="card-title">{title}</h2>
      <p className="muted" style={{ margin: 0, lineHeight: 1.68 }}>
        {description}
      </p>
      {bullets === undefined || bullets.length === 0 ? null : (
        <ul
          style={{
            margin: 0,
            paddingLeft: 0,
            listStyle: "none",
            display: "grid",
            gap: "0.55rem",
          }}
        >
          {bullets.map((item) => {
            const separatorIndex = item.indexOf(" — ");
            const head =
              separatorIndex === -1 ? item : item.slice(0, separatorIndex);
            const tail =
              separatorIndex === -1 ? "" : item.slice(separatorIndex);

            return (
              <li
                key={item}
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "flex-start",
                  fontSize: "0.94rem",
                  lineHeight: 1.55,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    marginTop: "0.15rem",
                    color: "var(--accent)",
                    fontWeight: 700,
                  }}
                >
                  ＋
                </span>
                <span>
                  <strong style={{ fontWeight: 600 }}>{head}</strong>
                  {tail}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        {feature == null || upgradeSurface == null ? (
          <button className={buttonClass} type="button">
            {ctaLabel}
          </button>
        ) : (
          <UpgradeProButton
            className={buttonClass}
            data-testid={dataTestId ? `${dataTestId}-cta` : undefined}
            feature={feature}
            label={ctaLabel}
            upgradeSurface={upgradeSurface}
          />
        )}
      </div>
    </div>
  );
}
