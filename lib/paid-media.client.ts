"use client";

import {
  getGoogleAdsId,
  getGoogleConversionLabel,
  GOOGLE_QUEUE_COOKIE,
  isGoogleMappableEvent,
  parseGoogleQueueCookie,
  type GoogleMappableEvent,
  type QueuedGoogleConversion,
} from "@/lib/paid-media";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const flushedEventIds = new Set<string>();

function getCookieValue(name: string) {
  if (typeof document === "undefined") {
    return undefined;
  }

  const prefix = `${name}=`;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));

  return match == null ? undefined : decodeURIComponent(match.slice(prefix.length));
}

function clearCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function logPaidMediaDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (payload == null) {
    console.info(`[paid_media] ${message}`);
    return;
  }

  console.info(`[paid_media] ${message}`, payload);
}

function sendGoogleConversion(eventName: GoogleMappableEvent, valueUsd?: number | null) {
  const googleAdsId = getGoogleAdsId();
  const label = getGoogleConversionLabel(eventName);

  if (
    googleAdsId == null ||
    label === "" ||
    typeof window === "undefined" ||
    typeof window.gtag !== "function"
  ) {
    logPaidMediaDebug("google_conversion_skipped", {
      event_name: eventName,
      has_google_ads_id: googleAdsId != null,
      has_label: label !== "",
      has_gtag: typeof window !== "undefined" && typeof window.gtag === "function",
    });
    return;
  }

  const payload: Record<string, unknown> = {
    send_to: `${googleAdsId}/${label}`,
  };

  if (typeof valueUsd === "number") {
    payload.value = valueUsd;
    payload.currency = "USD";
  }

  logPaidMediaDebug("google_conversion_fired", {
    event_name: eventName,
    ...payload,
  });
  window.gtag("event", "conversion", payload);
}

export function trackGooglePaidMediaEvent(eventName: string, valueUsd?: number | null) {
  if (isGoogleMappableEvent(eventName) === false) {
    return;
  }

  sendGoogleConversion(eventName, valueUsd);
}

export function flushQueuedGoogleConversions() {
  const queuedEvents = parseGoogleQueueCookie(getCookieValue(GOOGLE_QUEUE_COOKIE));

  if (queuedEvents.length === 0) {
    return;
  }

  logPaidMediaDebug("google_queue_flushing", {
    queued_count: queuedEvents.length,
  });

  const remainingEvents: QueuedGoogleConversion[] = [];

  for (const queuedEvent of queuedEvents) {
    if (flushedEventIds.has(queuedEvent.id)) {
      continue;
    }

    sendGoogleConversion(queuedEvent.event_name, queuedEvent.value_usd);
    flushedEventIds.add(queuedEvent.id);
  }

  if (remainingEvents.length === 0) {
    clearCookie(GOOGLE_QUEUE_COOKIE);
    logPaidMediaDebug("google_queue_cleared");
  }
}
