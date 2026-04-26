"use client";

import {
  getGoogleAdsId,
  getGoogleConversionLabel,
  getMetaPublicPixelId,
  GOOGLE_QUEUE_COOKIE,
  META_QUEUE_COOKIE,
  isGoogleMappableEvent,
  parseGoogleQueueCookie,
  parseMetaQueueCookie,
  type GoogleMappableEvent,
  type QueuedGoogleConversion,
  type QueuedMetaConversion,
} from "@/lib/paid-media";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const flushedGoogleEventIds = new Set<string>();
const flushedMetaEventIds = new Set<string>();

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

function sendGoogleConversion(
  eventName: GoogleMappableEvent,
  valueUsd?: number | null,
  emailSha256?: string | null,
) {
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

  // Google Enhanced Conversions: attach pre-hashed email under user_data on
  // the conversion event itself. Spec supports either a 'set' call ahead of
  // conversion or inline user_data — inline keeps the payload scoped per
  // event and avoids cross-event leakage between users on shared devices.
  if (emailSha256 != null && emailSha256 !== "") {
    payload.user_data = {
      sha256_email_address: emailSha256,
    };
  }

  logPaidMediaDebug("google_conversion_fired", {
    event_name: eventName,
    has_user_data: emailSha256 != null && emailSha256 !== "",
    ...payload,
  });
  window.gtag("event", "conversion", payload);
}

export function trackGooglePaidMediaEvent(
  eventName: string,
  valueUsd?: number | null,
) {
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
    if (flushedGoogleEventIds.has(queuedEvent.id)) {
      continue;
    }

    sendGoogleConversion(
      queuedEvent.event_name,
      queuedEvent.value_usd,
      queuedEvent.email_sha256,
    );
    flushedGoogleEventIds.add(queuedEvent.id);
  }

  if (remainingEvents.length === 0) {
    clearCookie(GOOGLE_QUEUE_COOKIE);
    logPaidMediaDebug("google_queue_cleared");
  }
}

function sendMetaPixelEvent(queued: QueuedMetaConversion) {
  const pixelId = getMetaPublicPixelId();

  if (
    pixelId == null ||
    typeof window === "undefined" ||
    typeof window.fbq !== "function"
  ) {
    logPaidMediaDebug("meta_pixel_skipped", {
      event_name: queued.event_name,
      has_pixel_id: pixelId != null,
      has_fbq: typeof window !== "undefined" && typeof window.fbq === "function",
    });
    return;
  }

  const customData: Record<string, unknown> = {};

  if (typeof queued.value_usd === "number") {
    customData.value = queued.value_usd;
    customData.currency = queued.currency ?? "USD";
  }

  // Third arg { eventID } matches the CAPI event_id for server/client dedup.
  // Without it Meta counts the same conversion twice.
  window.fbq(
    "track",
    queued.mapped_event_name,
    customData,
    { eventID: queued.id },
  );

  logPaidMediaDebug("meta_pixel_fired", {
    event_name: queued.event_name,
    mapped_event_name: queued.mapped_event_name,
    event_id: queued.id,
    has_value: customData.value != null,
  });
}

export function flushQueuedMetaConversions() {
  const queuedEvents = parseMetaQueueCookie(getCookieValue(META_QUEUE_COOKIE));

  if (queuedEvents.length === 0) {
    return;
  }

  logPaidMediaDebug("meta_queue_flushing", {
    queued_count: queuedEvents.length,
  });

  for (const queuedEvent of queuedEvents) {
    if (flushedMetaEventIds.has(queuedEvent.id)) {
      continue;
    }

    sendMetaPixelEvent(queuedEvent);
    flushedMetaEventIds.add(queuedEvent.id);
  }

  clearCookie(META_QUEUE_COOKIE);
  logPaidMediaDebug("meta_queue_cleared");
}
