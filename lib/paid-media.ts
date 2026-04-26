import type { ProductEventName } from "@/lib/product-events";

export const ATTRIBUTION_COOKIE = "wuwu_attr_ft";
export const GOOGLE_QUEUE_COOKIE = "wuwu_google_queue";
export const META_QUEUE_COOKIE = "wuwu_meta_queue";

/**
 * First-touch attribution snapshot carried in the `wuwu_attr_ft` cookie and
 * mirrored onto `product_events` rows at insert time. Every field is nullable:
 * a direct visitor has all nulls → channel resolves to "direct".
 *
 * Historical note: the type is still called `AttributionClickIds` for backwards
 * compatibility with earlier callers (paid-media dispatch reads only fbclid +
 * captured_at). UTM / landing / referrer fields were added in 009_attribution;
 * older cookies missing those fields simply parse them as null, which is safe.
 */
export type AttributionClickIds = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_path: string | null;
  referrer_host: string | null;
  captured_at: string | null;
};

/** Alias — prefer this name at new call sites. */
export type AttributionSnapshot = AttributionClickIds;

export const EMPTY_ATTRIBUTION: AttributionClickIds = {
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbclid: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  landing_path: null,
  referrer_host: null,
  captured_at: null,
};

export type AttributionChannel =
  | "google_paid"
  | "meta_paid"
  | "other_paid"
  | "organic_search"
  | "referral"
  | "direct";

const META_UTM_SOURCES = new Set([
  "facebook",
  "meta",
  "instagram",
  "fb",
  "ig",
  "meta_ads",
  "facebook_ads",
]);

const PAID_MEDIUM_VALUES = new Set([
  "cpc",
  "ppc",
  "paid",
  "paid_social",
  "paidsocial",
  "paid-search",
  "paidsearch",
  "display",
  "social_paid",
]);

const SEARCH_ENGINE_HOST_FRAGMENTS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "baidu.",
  "yandex.",
  "brave.com",
  "ecosia.",
];

/**
 * Pure channel derivation. Runs on every `product_events` insert and on the
 * user_attribution upsert at signup_completed. Order of precedence:
 *   1. Google paid (gclid/gbraid/wbraid click ID) — always wins
 *   2. Meta paid (fbclid) — always wins
 *   3. UTM-based paid classification (utm_source/medium)
 *   4. Referrer-based organic vs referral
 *   5. Direct
 * When in doubt we bias toward paid attribution — better to over-count paid
 * (visible to us in ad platforms) than to let a paid click silently land in
 * "direct" and poison CPA math.
 */
export function deriveAttributionChannel(
  input: Partial<
    Pick<
      AttributionClickIds,
      | "gclid"
      | "gbraid"
      | "wbraid"
      | "fbclid"
      | "utm_source"
      | "utm_medium"
      | "referrer_host"
    >
  >,
): AttributionChannel {
  const gclid = input.gclid ?? null;
  const gbraid = input.gbraid ?? null;
  const wbraid = input.wbraid ?? null;
  const fbclid = input.fbclid ?? null;
  const utmSource = input.utm_source?.toLowerCase().trim() ?? null;
  const utmMedium = input.utm_medium?.toLowerCase().trim() ?? null;
  const referrerHost = input.referrer_host?.toLowerCase().trim() ?? null;

  if (gclid || gbraid || wbraid) {
    return "google_paid";
  }

  if (
    utmSource === "google" &&
    utmMedium !== null &&
    PAID_MEDIUM_VALUES.has(utmMedium)
  ) {
    return "google_paid";
  }

  if (fbclid) {
    return "meta_paid";
  }

  if (utmSource !== null && META_UTM_SOURCES.has(utmSource)) {
    return "meta_paid";
  }

  if (
    utmSource !== null &&
    (utmMedium === null || PAID_MEDIUM_VALUES.has(utmMedium))
  ) {
    return "other_paid";
  }

  if (utmMedium !== null && PAID_MEDIUM_VALUES.has(utmMedium)) {
    return "other_paid";
  }

  if (referrerHost !== null) {
    if (SEARCH_ENGINE_HOST_FRAGMENTS.some((fragment) => referrerHost.includes(fragment))) {
      return "organic_search";
    }
    return "referral";
  }

  return "direct";
}

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
  /** SHA-256 hex of trimmed + lowercased email. Absent → no Enhanced Conversions match. */
  email_sha256: string | null;
};

export type QueuedMetaConversion = {
  id: string;
  event_name: MetaMappableEvent;
  mapped_event_name: string;
  value_usd: number | null;
  currency: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function parseAttributionCookie(
  value: string | undefined,
): AttributionClickIds | null {
  if (value == null || value === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<AttributionClickIds>;

    return {
      gclid: asString(parsed.gclid),
      gbraid: asString(parsed.gbraid),
      wbraid: asString(parsed.wbraid),
      fbclid: asString(parsed.fbclid),
      utm_source: asString(parsed.utm_source),
      utm_medium: asString(parsed.utm_medium),
      utm_campaign: asString(parsed.utm_campaign),
      utm_content: asString(parsed.utm_content),
      utm_term: asString(parsed.utm_term),
      landing_path: asString(parsed.landing_path),
      referrer_host: asString(parsed.referrer_host),
      captured_at: asString(parsed.captured_at),
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
      const emailSha256 = (item as { email_sha256?: unknown }).email_sha256;

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
          email_sha256: typeof emailSha256 === "string" ? emailSha256 : null,
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

export function parseMetaQueueCookie(
  value: string | undefined,
): QueuedMetaConversion[] {
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
      const mappedEventName = (item as { mapped_event_name?: unknown })
        .mapped_event_name;
      const id = (item as { id?: unknown }).id;
      const valueUsd = (item as { value_usd?: unknown }).value_usd;
      const currency = (item as { currency?: unknown }).currency;

      if (
        typeof id !== "string" ||
        typeof mappedEventName !== "string" ||
        isMetaMappableEvent(eventName) === false
      ) {
        return [];
      }

      return [
        {
          id,
          event_name: eventName,
          mapped_event_name: mappedEventName,
          value_usd: typeof valueUsd === "number" ? valueUsd : null,
          currency: typeof currency === "string" ? currency : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function serializeMetaQueueCookie(events: QueuedMetaConversion[]) {
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

/**
 * Client-visible Meta pixel ID (NEXT_PUBLIC_*). Required to load fbevents.js
 * in the browser for the client-side companion pixel that pairs with server
 * CAPI via shared event_id for dedup. Should match META_PIXEL_ID on the server.
 */
export function getMetaPublicPixelId() {
  const value = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return value == null || value.trim() === "" ? null : value.trim();
}
