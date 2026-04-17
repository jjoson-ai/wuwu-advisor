import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAuth } from "@/lib/auth";
import { getStripeProPriceId } from "@/lib/billing";
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
    const stripe = getStripeServerClient();
    const returnPath = sanitizeReturnPath(input.returnPath);
    const appOrigin = getAppOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: getStripeProPriceId(),
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
      metadata: {
        user_id: user.id,
        upgrade_surface: input.upgradeSurface ?? "unknown",
        plan_type: "pro",
        platform: getRequestPlatform(request),
        return_path: returnPath,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          upgrade_surface: input.upgradeSurface ?? "unknown",
          plan_type: "pro",
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
