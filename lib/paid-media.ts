import type { ProductEventName } from "@/lib/product-events";

export const ATTRIBUTION_COOKIE = "wuwu_attr_ft";
export const GOOGLE_QUEUE_COOKIE = "wuwu_google_queue";

export type AttributionClickIds = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  captured_at: string | null;
};

export type GoogleMappableEvent =
  | "signup_completed"
  | "onboarding_completed"
  | "first_ask_submitted"
  | "checkout_started"
  | "pro_activated";

export type MetaMappableEvent =
  | "signup_completed"
  | "onboarding_completed"
  | "first_ask_submitted"
  | "checkout_started"
  | "pro_activated";

export type QueuedGoogleConversion = {
  id: string;
  event_name: GoogleMappableEvent;
  value_usd: number | null;
  currency: string | null;
};

export function parseAttributionCookie(
  value: string | undefined,
): AttributionClickIds | null {
  if (value == null || value === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<AttributionClickIds>;

    return {
      gclid: typeof parsed.gclid === "string" ? parsed.gclid : null,
      gbraid: typeof parsed.gbraid === "string" ? parsed.gbraid : null,
      wbraid: typeof parsed.wbraid === "string" ? parsed.wbraid : null,
      fbclid: typeof parsed.fbclid === "string" ? parsed.fbclid : null,
      captured_at:
        typeof parsed.captured_at === "string" ? parsed.captured_at : null,
    };
  } catch {
    return null;
  }
}

export function serializeAttributionCookie(input: AttributionClickIds) {
  return JSON.stringify(input);
}

export function parseGoogleQueueCookie(
  value: string | undefined,
): QueuedGoogleConversion[] {
  if (value == null || value === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed) === false) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (item == null || typeof item !== "object") {
        return [];
      }

      const eventName = (item as { event_name?: unknown }).event_name;
      const id = (item as { id?: unknown }).id;
      const valueUsd = (item as { value_usd?: unknown }).value_usd;
      const currency = (item as { currency?: unknown }).currency;

      if (
        typeof id !== "string" ||
        isGoogleMappableEvent(eventName) === false
      ) {
        return [];
      }

      return [
        {
          id,
          event_name: eventName,
          value_usd: typeof valueUsd === "number" ? valueUsd : null,
          currency: typeof currency === "string" ? currency : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function serializeGoogleQueueCookie(events: QueuedGoogleConversion[]) {
  return JSON.stringify(events);
}

export function isGoogleMappableEvent(
  eventName: ProductEventName | string | unknown,
): eventName is GoogleMappableEvent {
  return (
    eventName === "signup_completed" ||
    eventName === "onboarding_completed" ||
    eventName === "first_ask_submitted" ||
    eventName === "checkout_started" ||
    eventName === "pro_activated"
  );
}

export function isMetaMappableEvent(
  eventName: ProductEventName | string | unknown,
): eventName is MetaMappableEvent {
  return (
    eventName === "signup_completed" ||
    eventName === "onboarding_completed" ||
    eventName === "first_ask_submitted" ||
    eventName === "checkout_started" ||
    eventName === "pro_activated"
  );
}

export function getMetaEventName(eventName: MetaMappableEvent) {
  if (eventName === "signup_completed") {
    return "CompleteRegistration";
  }

  if (eventName === "checkout_started") {
    return "InitiateCheckout";
  }

  if (eventName === "pro_activated") {
    return "Purchase";
  }

  if (eventName === "onboarding_completed") {
    return "OnboardingCompleted";
  }

  return "FirstAskSubmitted";
}

export function getGoogleConversionLabel(eventName: GoogleMappableEvent) {
  if (eventName === "signup_completed") {
    return process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_COMPLETED_LABEL ?? "";
  }

  if (eventName === "onboarding_completed") {
    return process.env.NEXT_PUBLIC_GOOGLE_ADS_ONBOARDING_COMPLETED_LABEL ?? "";
  }

  if (eventName === "first_ask_submitted") {
    return process.env.NEXT_PUBLIC_GOOGLE_ADS_FIRST_ASK_SUBMITTED_LABEL ?? "";
  }

  if (eventName === "checkout_started") {
    return process.env.NEXT_PUBLIC_GOOGLE_ADS_CHECKOUT_STARTED_LABEL ?? "";
  }

  return process.env.NEXT_PUBLIC_GOOGLE_ADS_PRO_ACTIVATED_LABEL ?? "";
}

export function getPaidMediaPurchaseValueUsd() {
  const rawValue = process.env.PAID_MEDIA_PRO_VALUE_USD;

  if (rawValue == null || rawValue.trim() === "") {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getGoogleAdsId() {
  const value = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  return value == null || value.trim() === "" ? null : value.trim();
}

export function getMetaConfig() {
  const pixelId = process.env.META_PIXEL_ID?.trim() ?? "";
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN?.trim() ?? "";

  if (pixelId === "" || accessToken === "") {
    return null;
  }

  return { pixelId, accessToken };
}
