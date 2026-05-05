import "server-only";

import { createHash } from "crypto";
import { cookies, headers } from "next/headers";

import type { ProductEvent } from "@/lib/product-events";
import {
  ATTRIBUTION_COOKIE,
  EMPTY_ATTRIBUTION,
  GOOGLE_QUEUE_COOKIE,
  META_QUEUE_COOKIE,
  deriveAttributionChannel,
  getMetaConfig,
  getMetaEventName,
  getPaidMediaPurchaseValueUsd,
  isGoogleMappableEvent,
  isMetaMappableEvent,
  parseAttributionCookie,
  parseGoogleQueueCookie,
  parseMetaQueueCookie,
  serializeGoogleQueueCookie,
  serializeMetaQueueCookie,
  type AttributionChannel,
  type AttributionSnapshot,
  type QueuedGoogleConversion,
  type QueuedMetaConversion,
} from "@/lib/paid-media";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Normalize + hash email for Enhanced Conversions / Meta CAPI. Both platforms
 * specify: trim whitespace, lowercase, SHA-256 hex. Returns null for empty
 * input so callers can pass undefined emails through safely.
 */
function hashEmail(email: string | null | undefined) {
  if (email == null) return null;
  const normalized = email.trim().toLowerCase();
  if (normalized === "") return null;
  return hashValue(normalized);
}

async function resolveUserEmail(userId: string | null | undefined) {
  if (userId == null || userId === "") return null;

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (error != null || data.user == null) {
      return null;
    }

    return data.user.email ?? null;
  } catch (error) {
    console.error("[paid_media_email_lookup_failed]", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function getRequestIp(forwardedFor: string | null) {
  if (forwardedFor == null || forwardedFor.trim() === "") {
    return null;
  }

  return forwardedFor.split(",")[0]?.trim() || null;
}

function buildSharedEventId(event: ProductEvent) {
  return (
    event.request_id ??
    `${event.event_name}:${event.user_id ?? "anon"}:${event.timestamp}`
  );
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
  try {
    const cookieStore = await cookies();
    return await parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value);
  } catch {
    // Outside a request context (e.g. background job) — no cookie available.
    return null;
  }
}

/**
 * Resolve an attribution snapshot for a product_events insert. Preference:
 *   1. The first-touch cookie on the current request (covers most events from
 *      an authenticated browser session).
 *   2. The persisted `user_attribution` row for the given user (covers
 *      webhook / background contexts where no cookie is available, e.g. the
 *      Stripe webhook that fires `pro_activated` from Stripe's origin).
 *   3. All-null empty snapshot (direct / unknown — will classify as "direct").
 *
 * Returns both the snapshot and its derived channel so callers don't repeat
 * the classification call. Channel derivation is pure + cheap, but doing it
 * here keeps the write path symmetric with the user_attribution upsert.
 */
export async function resolveAttributionForEvent(
  userId: string | null,
): Promise<{
  snapshot: AttributionSnapshot;
  channel: AttributionChannel;
  source: "cookie" | "user_attribution" | "empty";
}> {
  const cookieSnapshot = await readAttribution();

  if (cookieSnapshot !== null) {
    return {
      snapshot: cookieSnapshot,
      channel: deriveAttributionChannel(cookieSnapshot),
      source: "cookie",
    };
  }

  if (userId !== null && userId !== "") {
    try {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("user_attribution")
        .select(
          "first_touch_channel, first_touch_utm_source, first_touch_utm_medium, first_touch_utm_campaign, first_touch_utm_content, first_touch_utm_term, first_touch_gclid, first_touch_fbclid, first_touch_landing_path, first_touch_referrer_host, first_touch_captured_at",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error === null && data !== null) {
        const snapshot: AttributionSnapshot = {
          gclid: data.first_touch_gclid ?? null,
          gbraid: null,
          wbraid: null,
          fbclid: data.first_touch_fbclid ?? null,
          utm_source: data.first_touch_utm_source ?? null,
          utm_medium: data.first_touch_utm_medium ?? null,
          utm_campaign: data.first_touch_utm_campaign ?? null,
          utm_content: data.first_touch_utm_content ?? null,
          utm_term: data.first_touch_utm_term ?? null,
          landing_path: data.first_touch_landing_path ?? null,
          referrer_host: data.first_touch_referrer_host ?? null,
          captured_at: data.first_touch_captured_at ?? null,
        };
        return {
          snapshot,
          channel:
            (data.first_touch_channel as AttributionChannel | null) ??
            deriveAttributionChannel(snapshot),
          source: "user_attribution",
        };
      }
    } catch (error) {
      console.error("[paid_media_attribution_lookup_failed]", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    snapshot: EMPTY_ATTRIBUTION,
    channel: "direct",
    source: "empty",
  };
}

/**
 * Upsert the first-touch attribution row for a user — called on signup_completed.
 * Semantics:
 *   - INSERT on first call (no existing row): all fields populated.
 *   - UPDATE on subsequent calls: never clobbers an already-set first_touch_*
 *     field (coalesce via COALESCE logic in JS; cheaper than a RAW SQL trigger).
 *     signup_channel + signup_at always update to the latest signup event so
 *     we can distinguish "signed up in one session from Meta, came back later
 *     and clicked a Google ad to subscribe" from a clean single-channel journey.
 */
export async function upsertUserAttributionFirstTouch(
  userId: string,
  snapshot: AttributionSnapshot,
  channel: AttributionChannel,
  signupAt: string,
) {
  if (userId === "") return;

  try {
    const supabase = getSupabaseAdminClient();

    const { data: existing } = await supabase
      .from("user_attribution")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing === null) {
      const { error } = await supabase.from("user_attribution").insert({
        user_id: userId,
        first_touch_channel: channel,
        first_touch_utm_source: snapshot.utm_source,
        first_touch_utm_medium: snapshot.utm_medium,
        first_touch_utm_campaign: snapshot.utm_campaign,
        first_touch_utm_content: snapshot.utm_content,
        first_touch_utm_term: snapshot.utm_term,
        first_touch_gclid: snapshot.gclid,
        first_touch_fbclid: snapshot.fbclid,
        first_touch_landing_path: snapshot.landing_path,
        first_touch_referrer_host: snapshot.referrer_host,
        first_touch_captured_at: snapshot.captured_at,
        signup_channel: channel,
        signup_at: signupAt,
      });

      if (error !== null) {
        console.error("[user_attribution_insert_failed]", error.message);
      }
      return;
    }

    // Existing row — only update signup_channel / signup_at. first_touch_* is
    // immutable (set at earliest-ever signup for this user_id).
    const { error } = await supabase
      .from("user_attribution")
      .update({
        signup_channel: channel,
        signup_at: signupAt,
      })
      .eq("user_id", userId);

    if (error !== null) {
      console.error("[user_attribution_update_failed]", error.message);
    }
  } catch (error) {
    console.error("[user_attribution_upsert_failed]", error);
  }
}

/**
 * Resolve the conversion value + currency to report. Transaction-accurate
 * amounts from the Stripe webhook (event.paid_media_value_usd) win over the
 * flat env fallback (PAID_MEDIA_PRO_VALUE_USD). Trial activations with
 * amount_total = 0 report the subscription's first-charge unit_amount so ad
 * platforms optimize against real expected revenue rather than $0.
 */
function resolveConversionValue(event: ProductEvent) {
  if (typeof event.paid_media_value_usd === "number") {
    return {
      value_usd: event.paid_media_value_usd,
      currency: event.paid_media_currency ?? "USD",
    };
  }

  if (event.event_name === "pro_activated") {
    return {
      value_usd: getPaidMediaPurchaseValueUsd(),
      currency: "USD",
    };
  }

  return { value_usd: null, currency: null };
}

async function queueGoogleConversion(
  event: ProductEvent,
  sharedEventId: string,
  hashedEmail: string | null,
) {
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

  if (existingQueue.some((item) => item.id === sharedEventId)) {
    return;
  }

  const { value_usd, currency } = resolveConversionValue(event);
  const queuedEvent: QueuedGoogleConversion = {
    id: sharedEventId,
    event_name: event.event_name,
    value_usd: event.event_name === "pro_activated" ? value_usd : null,
    currency: event.event_name === "pro_activated" ? currency : null,
    email_sha256: hashedEmail,
  };

  cookieStore.set(
    GOOGLE_QUEUE_COOKIE,
    serializeGoogleQueueCookie([...existingQueue, queuedEvent]),
    {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 20,
      httpOnly: false,
    },
  );

  logPaidMediaDebug("google_conversion_queued", {
    event_name: queuedEvent.event_name,
    id: queuedEvent.id,
    value_usd: queuedEvent.value_usd,
    has_email_sha256: queuedEvent.email_sha256 != null,
  });
}

/**
 * Queue a Meta pixel event for client-side flush. Pairs with the CAPI call via
 * shared event_id — when both arrive Meta dedups. The client-side companion
 * is additive match-quality signal; CAPI is the source of truth (works even
 * when browsers block the pixel).
 */
async function queueMetaConversion(
  event: ProductEvent,
  sharedEventId: string,
) {
  if (isMetaMappableEvent(event.event_name) === false) {
    return;
  }

  const cookieStore = await cookies();
  const existingQueue = parseMetaQueueCookie(
    cookieStore.get(META_QUEUE_COOKIE)?.value,
  );

  if (existingQueue.some((item) => item.id === sharedEventId)) {
    return;
  }

  const { value_usd, currency } = resolveConversionValue(event);
  const mappedEventName = getMetaEventName(event.event_name);
  const queuedEvent: QueuedMetaConversion = {
    id: sharedEventId,
    event_name: event.event_name,
    mapped_event_name: mappedEventName,
    value_usd: event.event_name === "pro_activated" ? value_usd : null,
    currency: event.event_name === "pro_activated" ? currency : null,
  };

  cookieStore.set(
    META_QUEUE_COOKIE,
    serializeMetaQueueCookie([...existingQueue, queuedEvent]),
    {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 20,
      httpOnly: false,
    },
  );

  logPaidMediaDebug("meta_conversion_queued", {
    event_name: queuedEvent.event_name,
    mapped_event_name: queuedEvent.mapped_event_name,
    id: queuedEvent.id,
  });
}

async function sendMetaConversion(
  event: ProductEvent,
  sharedEventId: string,
  hashedEmail: string | null,
) {
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

  // Hashed email — biggest match-quality lift. Meta expects SHA-256 hex of
  // trimmed + lowercased email under `em`.
  if (hashedEmail != null) {
    userData.em = hashedEmail;
  }

  const userAgent = headerStore.get("user-agent");
  const ipAddress = getRequestIp(headerStore.get("x-forwarded-for"));

  if (userAgent != null && userAgent !== "") {
    userData.client_user_agent = userAgent;
  }

  if (ipAddress != null) {
    userData.client_ip_address = ipAddress;
  }

  const { value_usd, currency } = resolveConversionValue(event);
  const customData =
    event.event_name === "pro_activated"
      ? {
          currency: currency ?? "USD",
          value: value_usd,
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
              event_id: sharedEventId,
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
      has_external_id:
        typeof userData.external_id === "string" && userData.external_id !== "",
      has_em: typeof userData.em === "string" && userData.em !== "",
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

  const sharedEventId = buildSharedEventId(event);
  const email = await resolveUserEmail(event.user_id);
  const hashedEmail = hashEmail(email);

  await Promise.allSettled([
    queueGoogleConversion(event, sharedEventId, hashedEmail),
    queueMetaConversion(event, sharedEventId),
    sendMetaConversion(event, sharedEventId, hashedEmail),
  ]);
}
