import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";

import { getUserAccessLevel } from "@/lib/access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const CHECKOUT_ACCESS_COOKIE = "wuwu_checkout_access_level";

const CHECKOUT_ACCESS_HMAC_MESSAGE = "checkout_pro_v1";

function getCheckoutAccessHmacSecret(): string {
  const secret = process.env.OPS_SECRET;
  if (!secret) {
    throw new Error(
      "OPS_SECRET is not configured. It is required for signing the checkout access cookie.",
    );
  }
  return secret;
}

export function getCheckoutAccessProCookieValue(): string {
  const hmac = createHmac("sha256", getCheckoutAccessHmacSecret());
  hmac.update(CHECKOUT_ACCESS_HMAC_MESSAGE);
  return hmac.digest("hex");
}

export function verifyCheckoutAccessCookie(
  cookieValue: string | null | undefined,
): "pro" | null {
  if (cookieValue == null || cookieValue.trim() === "") {
    return null;
  }
  let actual: Buffer;
  try {
    actual = Buffer.from(cookieValue.trim(), "hex");
  } catch {
    return null;
  }
  const expected = Buffer.from(getCheckoutAccessProCookieValue(), "hex");
  if (actual.length !== expected.length) {
    return null;
  }
  if (!timingSafeEqual(actual, expected)) {
    return null;
  }
  return "pro";
}

export function getStripeProPriceId() {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;

  if (priceId == null || priceId === "") {
    throw new Error("Missing STRIPE_PRO_PRICE_ID.");
  }

  return priceId;
}

export function getStripeProAnnualPriceId() {
  const priceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;

  if (priceId == null || priceId === "") {
    throw new Error("Missing STRIPE_PRO_ANNUAL_PRICE_ID.");
  }

  return priceId;
}

export type PlanType = "monthly" | "annual";

export function getStripePriceIdForPlan(plan: PlanType) {
  return plan === "annual" ? getStripeProAnnualPriceId() : getStripeProPriceId();
}

/** Annual plan gets a 7-day free trial; monthly goes straight to paid. */
export const ANNUAL_TRIAL_DAYS = 7;

async function getUserById(userId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  const currentUserResult = await supabaseAdmin.auth.admin.getUserById(userId);

  if (currentUserResult.error !== null || currentUserResult.data.user == null) {
    throw new Error("Unable to load the target user for billing access update.");
  }

  return {
    supabaseAdmin,
    user: currentUserResult.data.user,
  };
}

export async function grantProAccessToUser(params: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const { supabaseAdmin, user: currentUser } = await getUserById(params.userId);
  const activatedNow = getUserAccessLevel(currentUser) !== "pro";
  const nextAppMetadata = {
    ...(currentUser.app_metadata ?? {}),
    access_level: "pro",
    tier: "pro",
    plan: "pro",
    billing_source: "stripe_checkout",
    billing_status: "active",
    stripe_customer_id:
      params.stripeCustomerId ??
      currentUser.app_metadata?.stripe_customer_id ??
      null,
    stripe_subscription_id:
      params.stripeSubscriptionId ??
      currentUser.app_metadata?.stripe_subscription_id ??
      null,
  };

  const updateResult = await supabaseAdmin.auth.admin.updateUserById(params.userId, {
    app_metadata: nextAppMetadata,
  });

  if (updateResult.error !== null) {
    throw new Error("Unable to grant Pro access after checkout.");
  }

  return {
    user: updateResult.data.user as User,
    activatedNow,
  };
}

export async function revokeProAccessToUser(params: {
  userId: string;
  billingStatus: "canceled" | "payment_failed";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const { supabaseAdmin, user: currentUser } = await getUserById(params.userId);
  const nextAppMetadata = {
    ...(currentUser.app_metadata ?? {}),
    access_level: "free",
    tier: "free",
    plan: "free",
    billing_status: params.billingStatus,
    stripe_customer_id:
      params.stripeCustomerId ??
      currentUser.app_metadata?.stripe_customer_id ??
      null,
    stripe_subscription_id:
      params.stripeSubscriptionId ??
      currentUser.app_metadata?.stripe_subscription_id ??
      null,
  };

  const updateResult = await supabaseAdmin.auth.admin.updateUserById(params.userId, {
    app_metadata: nextAppMetadata,
  });

  if (updateResult.error !== null) {
    throw new Error("Unable to revoke Pro access from billing webhook.");
  }

  return updateResult.data.user as User;
}

/**
 * Maximum number of pages findUserByStripeBillingIdentity will iterate
 * before giving up. 10 pages × 200 users = 2000 users max scanned per
 * lookup. Beyond this we log a warning and return null — better to ask
 * Stripe to retry the webhook (which will hit a fresh lookup) than to
 * scan unbounded.
 */
const MAX_LIST_USERS_PAGES = 10;

export async function findUserByStripeBillingIdentity(params: {
  userId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  if (params.userId != null && params.userId !== "") {
    const { user } = await getUserById(params.userId);
    return user as User;
  }

  const stripeCustomerId = params.stripeCustomerId ?? null;
  const stripeSubscriptionId = params.stripeSubscriptionId ?? null;

  if (stripeCustomerId == null && stripeSubscriptionId == null) {
    return null;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  let page = 1;
  const perPage = 200;

  while (true) {
    const listUsersResult = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (listUsersResult.error !== null) {
      throw new Error("Unable to list users while resolving Stripe billing identity.");
    }

    const users = listUsersResult.data.users;
    const matchedUser = users.find((candidate) => {
      const candidateCustomerId = candidate.app_metadata?.stripe_customer_id;
      const candidateSubscriptionId = candidate.app_metadata?.stripe_subscription_id;

      return (
        (stripeSubscriptionId != null &&
          candidateSubscriptionId === stripeSubscriptionId) ||
        (stripeCustomerId != null && candidateCustomerId === stripeCustomerId)
      );
    });

    if (matchedUser != null) {
      return matchedUser as User;
    }

    if (users.length < perPage) {
      return null;
    }

    if (page >= MAX_LIST_USERS_PAGES) {
      console.warn(
        "[Billing] findUserByStripeBillingIdentity hit MAX_LIST_USERS_PAGES cap without finding a match.",
        {
          stripeCustomerId,
          stripeSubscriptionId,
          pagesScanned: page,
          maxPages: MAX_LIST_USERS_PAGES,
        },
      );
      return null;
    }

    page += 1;
  }
}
