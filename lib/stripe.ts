import Stripe from "stripe";

/**
 * Resolve the paid-media conversion value for a completed Stripe checkout
 * session, as `{ value_usd, currency }`. Prefers `session.amount_total` when
 * non-zero (direct charge); for trial activations (amount_total = 0) falls
 * back to the subscription's first-charge unit_amount so ad-platform
 * optimization sees the true expected revenue rather than $0. Returns null on
 * any resolution failure — callers should fall back to the env default
 * (PAID_MEDIA_PRO_VALUE_USD) downstream.
 */
export async function resolveCheckoutSessionConversionValue(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{ value_usd: number; currency: string } | null> {
  try {
    if (
      typeof session.amount_total === "number" &&
      session.amount_total > 0 &&
      typeof session.currency === "string" &&
      session.currency !== ""
    ) {
      return {
        value_usd: session.amount_total / 100,
        currency: session.currency.toUpperCase(),
      };
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    if (subscriptionId == null) {
      return null;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });

    const firstItem = subscription.items.data[0];
    const unitAmount = firstItem?.price.unit_amount ?? null;
    const currency = firstItem?.price.currency ?? null;

    if (
      typeof unitAmount !== "number" ||
      unitAmount <= 0 ||
      typeof currency !== "string" ||
      currency === ""
    ) {
      return null;
    }

    return {
      value_usd: unitAmount / 100,
      currency: currency.toUpperCase(),
    };
  } catch (error) {
    console.warn("[Billing] Failed to resolve conversion value for session.", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (secretKey == null || secretKey === "") {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(secretKey);
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (webhookSecret == null || webhookSecret === "") {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }

  return webhookSecret;
}

export function getAppOrigin(request: Request) {
  const configuredOrigin =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (configuredOrigin.trim() !== "") {
    return configuredOrigin.replace(/\/$/, "");
  }

  return new URL(request.url).origin;
}

export function sanitizeReturnPath(value: string | null | undefined) {
  if (value == null || value.trim() === "") {
    return "/dashboard";
  }

  const normalized = value.trim();

  if (normalized.startsWith("/") === false || normalized.startsWith("//")) {
    return "/dashboard";
  }

  return normalized;
}

export function appendQueryParam(path: string, key: string, value: string) {
  const baseUrl = new URL(path, "https://wuwu.local");
  baseUrl.searchParams.set(key, value);
  return `${baseUrl.pathname}${baseUrl.search}`;
}
