import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth";
import {
  ANNUAL_TRIAL_DAYS,
  getStripePriceIdForPlan,
  type PlanType,
} from "@/lib/billing";
import { getRequestAccessState } from "@/lib/debug-access";
import {
  getRequestPlatform,
} from "@/lib/product-events";
import { logProductEvent } from "@/lib/product-events.server";
import {
  getAppOrigin,
  getStripeServerClient,
  sanitizeReturnPath,
} from "@/lib/stripe";

const CheckoutRequestSchema = z.object({
  returnPath: z.string().trim().max(500).optional(),
  upgradeSurface: z.string().trim().min(1).max(80).optional(),
  plan: z.enum(["monthly", "annual"]).optional().default("annual"),
});

export async function POST(request: Request) {
  try {
    const { user } = await getRequestAuth(request);

    if (user === null) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const accessState = getRequestAccessState(user, request);

    if (accessState.accessLevel !== "free") {
      return NextResponse.json(
        { error: "This account already has Pro access." },
        { status: 400 },
      );
    }

    if (user.email == null || user.email.trim() === "") {
      return NextResponse.json(
        { error: "A verified email is required before checkout." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const input = CheckoutRequestSchema.parse(body);
    const plan: PlanType = input.plan;
    const stripe = getStripeServerClient();
    const returnPath = sanitizeReturnPath(input.returnPath);
    const appOrigin = getAppOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: getStripePriceIdForPlan(plan),
          quantity: 1,
        },
      ],
      success_url: `${appOrigin}/billing/complete?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(
        returnPath,
      )}`,
      cancel_url: `${appOrigin}${returnPath}`,
      customer_email: user.email,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      consent_collection: {
        terms_of_service: "required",
      },
      custom_text: {
        after_submit: {
          message:
            "By starting your trial you confirm you are 18 or older and agree to be charged after the 7-day free trial unless you cancel.",
        },
      },
      metadata: {
        user_id: user.id,
        upgrade_surface: input.upgradeSurface ?? "unknown",
        plan_type: "pro",
        billing_plan: plan,
        platform: getRequestPlatform(request),
        return_path: returnPath,
      },
      subscription_data: {
        trial_period_days: plan === "annual" ? ANNUAL_TRIAL_DAYS : undefined,
        metadata: {
          user_id: user.id,
          upgrade_surface: input.upgradeSurface ?? "unknown",
          plan_type: "pro",
          billing_plan: plan,
          platform: getRequestPlatform(request),
        },
      },
    });

    if (session.url == null) {
      throw new Error("Stripe Checkout did not return a redirect URL.");
    }

    console.info("[Billing] Checkout session created.", {
      sessionId: session.id,
      userId: user.id,
      clientReferenceId: session.client_reference_id ?? null,
      metadataUserId: session.metadata?.user_id ?? null,
      returnPath,
      upgradeSurface: input.upgradeSurface ?? "unknown",
      billingPlan: plan,
      trialDays: plan === "annual" ? ANNUAL_TRIAL_DAYS : 0,
    });

    await logProductEvent({
      event_name: "checkout_started",
      timestamp: new Date().toISOString(),
      user_id: user.id,
      tier: accessState.accessLevel,
      platform: getRequestPlatform(request),
      feature: null,
      plan_type: "pro",
      upgrade_surface: input.upgradeSurface ?? null,
      request_id: session.id,
      final_model_selected: null,
      generation_path: null,
      fallback_triggered: null,
      request_cost_estimate_usd: null,
      request_cost_is_estimated: null,
      is_first_use: null,
      repeat_within_24h: null,
    });

    return NextResponse.json({
      checkoutUrl: session.url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start checkout.";

    console.error("[Billing] Failed to create Stripe Checkout session.", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
