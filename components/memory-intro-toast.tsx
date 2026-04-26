"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { trackProductEvent } from "@/lib/client-events";

const SEEN_FLAG_KEY = "wuwu_memory_intro_seen_v1";
const AUTO_DISMISS_MS = 12_000;

/**
 * UX audit C-03 (2026-04-26): the "What Wuwu remembers about you" page is a
 * trust-building strength that was previously undiscoverable. This toast
 * surfaces it the first time a fact has been extracted for the user — the
 * single moment where pointing at the memory page makes most sense.
 *
 * Behavior:
 *  - On mount: read the localStorage flag. If already seen, render nothing.
 *  - Else: GET /api/privacy/facts. If 0 facts, render nothing (no extraction
 *    has happened yet — premature to introduce memory).
 *  - If ≥ 1 fact: render a non-blocking toast with a CTA to /privacy/facts
 *    and a dismiss affordance. Auto-dismiss after 12s.
 *  - On any dismiss path (auto, manual, or CTA click): set the flag so the
 *    toast never appears again for this device.
 *
 * Flag is per-device (localStorage), not per-user. Acceptable for alpha —
 * users typically use one device. Server-side per-user flag deferred.
 */
export function MemoryIntroToast() {
  const [shouldShow, setShouldShow] = useState<boolean>(false);
  const [isDismissing, setIsDismissing] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    try {
      if (window.localStorage.getItem(SEEN_FLAG_KEY) != null) {
        return;
      }
    } catch {
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/privacy/facts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { facts?: unknown[] };
        const factCount = Array.isArray(data.facts) ? data.facts.length : 0;
        if (cancelled) return;
        if (factCount >= 1) {
          setShouldShow(true);
          void trackProductEvent({
            event_name: "memory_intro_toast_shown",
            feature: null,
            plan_type: null,
            upgrade_surface: null,
          });
        }
      } catch {
        // Silent — never block the dashboard on this surface.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldShow) return;
    const timer = window.setTimeout(() => {
      handleDismiss("auto");
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow]);

  function persistSeen() {
    try {
      window.localStorage.setItem(SEEN_FLAG_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  function handleDismiss(reason: "auto" | "manual" | "cta") {
    setIsDismissing(true);
    persistSeen();
    if (reason !== "auto") {
      void trackProductEvent({
        event_name:
          reason === "cta"
            ? "memory_intro_toast_clicked"
            : "memory_intro_toast_dismissed",
        feature: null,
        plan_type: null,
        upgrade_surface: null,
      });
    }
    // Brief fade-out before unmount
    window.setTimeout(() => setShouldShow(false), 220);
  }

  if (!shouldShow) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="memory-intro-toast"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "1.5rem",
        transform: "translateX(-50%)",
        maxWidth: "min(28rem, calc(100vw - 2rem))",
        width: "100%",
        background: "var(--card-bg, #fffdf9)",
        color: "var(--text)",
        border: "1px solid var(--border, rgba(0,0,0,0.12))",
        borderRadius: "0.85rem",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: "0.95rem 1rem",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "0.75rem",
        alignItems: "center",
        zIndex: 100,
        opacity: isDismissing ? 0 : 1,
        transition: "opacity 200ms ease",
      }}
    >
      <div style={{ display: "grid", gap: "0.2rem", minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>
          Wuwu just learned something about you.
        </p>
        <p
          className="muted"
          style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.5 }}
        >
          See what — and forget it any time.
        </p>
        <Link
          href="/privacy/facts"
          onClick={() => handleDismiss("cta")}
          style={{
            justifySelf: "start",
            marginTop: "0.35rem",
            color: "var(--accent)",
            fontSize: "0.88rem",
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          What Wuwu remembers
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => handleDismiss("manual")}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          padding: "0.25rem 0.5rem",
          fontSize: "1.1rem",
          color: "var(--text-muted)",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
