"use client";

import { useEffect } from "react";

import type { CareModePayload } from "@/domain/safety/care-mode";
import { trackProductEvent } from "@/lib/client-events";
import type { ProductFeature } from "@/lib/product-events";

type CareModeCardProps = {
  payload: CareModePayload;
  feature?: ProductFeature;
  onDismiss?: () => void;
};

/**
 * Care Mode card — shown when crisis detection fires.
 *
 * The copy is ALWAYS the server-provided payload. We never construct or
 * localize it on the client — the whole point of Care Mode is determinism.
 *
 * We fire a client-side `care_mode_shown` event so we can measure UI
 * render success separately from the server-side detection event (they
 * can diverge if the client crashes or if a payload is dropped).
 */
export function CareModeCard({
  payload,
  feature,
  onDismiss,
}: CareModeCardProps) {
  useEffect(() => {
    void trackProductEvent(
      {
        event_name: "care_mode_shown",
        feature: feature ?? null,
        plan_type: null,
        upgrade_surface: null,
      },
      {
        onceKey: `care_mode:${feature ?? "unknown"}:${Date.now()}`,
      },
    );
  }, [feature]);

  return (
    <div
      className="card card-state stack"
      data-testid="care-mode-card"
      role="alert"
      aria-live="assertive"
      style={{
        borderColor: "var(--accent)",
        borderWidth: 2,
      }}
    >
      <p className="card-eyebrow" style={{ color: "var(--accent)" }}>
        A moment of care
      </p>
      <h2 className="card-title">{payload.headline}</h2>
      <p style={{ margin: 0, lineHeight: 1.7 }}>{payload.message}</p>
      <p
        style={{
          margin: 0,
          lineHeight: 1.7,
          fontWeight: 500,
        }}
      >
        {payload.prompt_action}
      </p>
      <ul
        style={{
          margin: 0,
          paddingLeft: 0,
          listStyle: "none",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        {payload.resources.map((resource) => (
          <li
            key={`${resource.label}-${resource.region}`}
            style={{
              display: "grid",
              gap: "0.15rem",
              padding: "0.75rem 0.9rem",
              borderRadius: "0.5rem",
              background: "var(--surface-subtle, rgba(0,0,0,0.04))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <strong style={{ fontWeight: 600 }}>{resource.label}</strong>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {resource.region}
              </span>
            </div>
            {resource.contact_href === null ? (
              <span style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>
                {resource.contact}
              </span>
            ) : (
              <a
                href={resource.contact_href}
                style={{ fontSize: "0.95rem", lineHeight: 1.5 }}
                rel="noreferrer noopener"
                target={resource.contact_href.startsWith("http") ? "_blank" : undefined}
              >
                {resource.contact}
              </a>
            )}
          </li>
        ))}
      </ul>
      <p
        className="muted"
        style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}
      >
        {payload.disclaimer}
      </p>
      {onDismiss === undefined ? null : (
        <div>
          <button
            className="button secondary"
            type="button"
            onClick={onDismiss}
          >
            Back to Wuwu
          </button>
        </div>
      )}
    </div>
  );
}
