import { NextResponse } from "next/server";

import { getRequestAuth } from "@/lib/auth";
import { CHECKOUT_ACCESS_COOKIE, grantProAccessToUser } from "@/lib/billing";
import { logProductEvent } from "@/lib/product-events.server";
import {
  appendQueryParam,
  getAppOrigin,
  getStripeServerClient,
  sanitizeReturnPath,
} from "@/lib/stripe";

function buildRedirect(request: Request, nextPath: string, key: string, value: string) {
  const appOrigin = getAppOrigin(request);
  return NextResponse.redirect(new URL(appendQueryParam(nextPath, key, value), appOrigin));
}

function buildBillingReturnPath(nextPath: string) {
  const baseUrl = new URL("/billing/return", "https://wuwu.local");
  baseUrl.searchParams.set("next", nextPath);
  baseUrl.searchParams.set("upgraded", "1");
  return `${baseUrl.pathname}${baseUrl.search}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sessionId = requestUrl.searchParams.get("session_id");
  const nextPath = sanitizeReturnPath(requestUrl.searchParams.get("next"));

  console.info("[Billing] Return route reached.", {
    sessionIdPresent: sessionId != null && sessionId !== "",
    nextPath,
  });

  if (sessionId == null || sessionId === "") {
    console.warn("[Billing] Missing session_id on billing return.", {
      nextPath,
    });
    return buildRedirect(request, nextPath, "billing", "missing_session");
  }

  try {
    const stripe = getStripeServerClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const purchasedUserId =
      session.client_reference_id ?? session.metadata?.user_id ?? null;
    const { user } = await getRequestAuth(request);

    console.info("[Billing] Stripe session retrieved for return.", {
      sessionId: session.id,
      status: session.status,
      mode: session.mode,
      clientReferenceId: session.client_reference_id ?? null,
      metadataUserId: session.metadata?.user_id ?? null,
      purchasedUserId,
      requestUserId: user?.id ?? null,
    });

    if (purchasedUserId == null || purchasedUserId === "") {
      console.warn("[Billing] Unable to derive purchased user from Stripe session.", {
        sessionId: session.id,
      });
      return buildRedirect(request, nextPath, "billing", "missing_user");
    }

    if (user !== null && purchasedUserId !== user.id) {
      console.warn("[Billing] Checkout return user mismatch.", {
        sessionId: session.id,
        purchasedUserId,
        requestUserId: user.id,
      });
      return buildRedirect(request, nextPath, "billing", "session_user_mismatch");
    }

    if (session.mode !== "subscription" || session.status !== "complete") {
      console.warn("[Billing] Stripe session not complete on return.", {
        sessionId: session.id,
        status: session.status,
        mode: session.mode,
      });
      return buildRedirect(request, nextPath, "billing", "incomplete");
    }

    console.info("[Billing] Granting Pro entitlement from checkout return.", {
      sessionId: session.id,
      purchasedUserId,
    });

    const grantResult = await grantProAccessToUser({
      userId: purchasedUserId,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId:
        typeof session.subscription === "string" ? session.subscription : null,
    });

    console.info("[Billing] Pro entitlement granted from checkout return.", {
      sessionId: session.id,
      purchasedUserId,
      nextPath,
    });

    await logProductEvent({
      event_name: "checkout_completed",
      timestamp: new Date().toISOString(),
      user_id: purchasedUserId,
      tier: "pro",
      platform: "web",
      feature: null,
      plan_type: "pro",
      upgrade_surface: session.metadata?.upgrade_surface ?? null,
      request_id: session.id,
      final_model_selected: null,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });

    if (grantResult.activatedNow) {
      await logProductEvent({
        event_name: "pro_activated",
        timestamp: new Date().toISOString(),
        user_id: purchasedUserId,
        tier: "pro",
        platform:
          session.metadata?.platform === "mobile" ? "mobile" : "web",
        feature: null,
        plan_type: "pro",
        upgrade_surface: session.metadata?.upgrade_surface ?? null,
        request_id: session.id,
        final_model_selected: null,
        generation_path: null,
        fallback_triggered: null,
        request_cost_estimate_usd: null,
        request_cost_is_estimated: null,
        is_first_use: null,
        repeat_within_24h: null,
      });
    }

    const returnPath = buildBillingReturnPath(nextPath);
    console.info("[Billing] Redirecting to billing return handoff.", {
      sessionId: session.id,
      returnPath,
    });

    const response = NextResponse.redirect(
      new URL(returnPath, getAppOrigin(request)),
    );
    response.cookies.set(CHECKOUT_ACCESS_COOKIE, "pro", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("[Billing] Failed to complete Pro checkout.", error);
    return buildRedirect(request, nextPath, "billing", "error");
  }
}
