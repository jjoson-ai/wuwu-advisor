import Stripe from "stripe";

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
