import "server-only";

import { createHash } from "crypto";
import { cookies, headers } from "next/headers";

import type { ProductEvent } from "@/lib/product-events";
import {
  ATTRIBUTION_COOKIE,
  GOOGLE_QUEUE_COOKIE,
  getMetaConfig,
  getMetaEventName,
  getPaidMediaPurchaseValueUsd,
  isGoogleMappableEvent,
  isMetaMappableEvent,
  parseAttributionCookie,
  parseGoogleQueueCookie,
  serializeGoogleQueueCookie,
  type QueuedGoogleConversion,
} from "@/lib/paid-media";

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getRequestIp(forwardedFor: string | null) {
  if (forwardedFor == null || forwardedFor.trim() === "") {
    return null;
  }

  return forwardedFor.split(",")[0]?.trim() || null;
}

function buildMetaEventId(event: ProductEvent) {
  return event.request_id ?? `${event.event_name}:${event.user_id ?? "anon"}:${event.timestamp}`;
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

async function readAttribution() {
  const cookieStore = await cookies();
  return parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value);
}

async function queueGoogleConversion(event: ProductEvent) {
  if (isGoogleMappableEvent(event.event_name) === false) {
    return;
  }

  if (
    event.event_name !== "onboarding_completed" &&
    event.event_name !== "first_ask_submitted" &&
    event.event_name !== "pro_activated"
  ) {
    return;
  }

  const cookieStore = await cookies();
  const existingQueue = parseGoogleQueueCookie(
    cookieStore.get(GOOGLE_QUEUE_COOKIE)?.value,
  );
  const eventId =
    event.request_id ?? `${event.event_name}:${event.user_id ?? "anon"}:${event.timestamp}`;

  if (existingQueue.some((item) => item.id === eventId)) {
    return;
  }

  const queuedEvent: QueuedGoogleConversion = {
    id: eventId,
    event_name: event.event_name,
    value_usd: event.event_name === "pro_activated" ? getPaidMediaPurchaseValueUsd() : null,
    currency: event.event_name === "pro_activated" ? "USD" : null,
  };

  cookieStore.set(GOOGLE_QUEUE_COOKIE, serializeGoogleQueueCookie([...existingQueue, queuedEvent]), {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 20,
    httpOnly: false,
  });

  logPaidMediaDebug("google_conversion_queued", {
    event_name: queuedEvent.event_name,
    id: queuedEvent.id,
    value_usd: queuedEvent.value_usd,
  });
}

async function sendMetaConversion(event: ProductEvent) {
  if (isMetaMappableEvent(event.event_name) === false) {
    return;
  }

  const metaConfig = getMetaConfig();

  if (metaConfig == null) {
    return;
  }

  const attribution = await readAttribution();
  const headerStore = await headers();
  const eventName = getMetaEventName(event.event_name);
  const userData: Record<string, string> = {};

  if (attribution?.fbclid != null && attribution.fbclid !== "") {
    const timestampSeconds = Math.floor(
      new Date(attribution.captured_at ?? event.timestamp).getTime() / 1000,
    );
    userData.fbc = `fb.1.${timestampSeconds}.${attribution.fbclid}`;
  }

  if (event.user_id != null) {
    userData.external_id = hashValue(event.user_id);
  }

  const userAgent = headerStore.get("user-agent");
  const ipAddress = getRequestIp(headerStore.get("x-forwarded-for"));

  if (userAgent != null && userAgent !== "") {
    userData.client_user_agent = userAgent;
  }

  if (ipAddress != null) {
    userData.client_ip_address = ipAddress;
  }

  const customData =
    event.event_name === "pro_activated"
      ? {
          currency: "USD",
          value: getPaidMediaPurchaseValueUsd(),
        }
      : undefined;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(metaConfig.pixelId)}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: metaConfig.accessToken,
          data: [
            {
              event_name: eventName,
              event_time: Math.floor(new Date(event.timestamp).getTime() / 1000),
              event_id: buildMetaEventId(event),
              action_source: "website",
              user_data: userData,
              custom_data: customData,
            },
          ],
        }),
      },
    );

    if (response.ok === false) {
      const responseText = await response.text();
      console.error("[paid_media_meta_dispatch_failed]", {
        status: response.status,
        body: responseText,
        event_name: event.event_name,
        mapped_event_name: eventName,
      });
      return;
    }

    logPaidMediaDebug("meta_conversion_sent", {
      event_name: event.event_name,
      mapped_event_name: eventName,
      has_fbc: typeof userData.fbc === "string" && userData.fbc !== "",
      has_external_id: typeof userData.external_id === "string" && userData.external_id !== "",
      has_value: customData?.value != null,
    });
  } catch (error) {
    console.error("[paid_media_meta_dispatch_failed]", error);
  }
}

export async function dispatchPaidMediaConversion(event: ProductEvent) {
  if (event.platform !== "web") {
    return;
  }

  await Promise.allSettled([
    queueGoogleConversion(event),
    sendMetaConversion(event),
  ]);
}
