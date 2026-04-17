"use client";

import {
  type ClientProductEventInput,
  PRODUCT_PLATFORM_HEADER,
} from "@/lib/product-events";
import { trackGooglePaidMediaEvent } from "@/lib/paid-media.client";

const sentEventKeys = new Set<string>();

function markOnceKey(onceKey: string) {
  if (sentEventKeys.has(onceKey)) {
    return false;
  }

  sentEventKeys.add(onceKey);

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(`wuwu.event.${onceKey}`, "1");
    } catch {
      // Ignore storage write failures.
    }
  }

  return true;
}

function hasSentOnceKey(onceKey: string) {
  if (sentEventKeys.has(onceKey)) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(`wuwu.event.${onceKey}`) === "1";
  } catch {
    return false;
  }
}

export async function trackProductEvent(
  input: ClientProductEventInput,
  options?: { onceKey?: string },
) {
  if (options?.onceKey) {
    if (hasSentOnceKey(options.onceKey)) {
      return;
    }

    if (markOnceKey(options.onceKey) === false) {
      return;
    }
  }

  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [PRODUCT_PLATFORM_HEADER]: "web",
      },
      body: JSON.stringify(input),
      keepalive: true,
    });

    if (response.ok) {
      trackGooglePaidMediaEvent(input.event_name);
    }
  } catch {
    // Event capture should never break the user flow.
  }
}
