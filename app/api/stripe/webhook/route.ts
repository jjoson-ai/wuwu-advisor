import Stripe from "stripe";
import { NextResponse } from "next/server";

import {
  findUserByStripeBillingIdentity,
  grantProAccessToUser,
  releaseStripeEventClaim,
  revokeProAccessToUser,
  tryClaimStripeEvent,
} from "@/lib/billing";
import { logProductEvent } from "@/lib/product-events.server";
import {
  getStripeServerClient,
  getStripeWebhookSecret,
  resolveCheckoutSessionConversionValue,
} from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (signature == null || signature === "") {
    return NextResponse.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    const stripe = getStripeServerClient();
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    console.error("[Billing] Invalid Stripe webhook signature.", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  console.info("[Billing] Stripe webhook received.", {
    eventId: event.id,
    eventType: event.type,
  });

  try {
    const claimed = await tryClaimStripeEvent(event.id, event.type);
    if (claimed === false) {
      return NextResponse.json({ received: true, idempotent_skip: true });
    }

    try {
      switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const purchasedUserId =
          session.client_reference_id ?? session.metadata?.user_id ?? null;

        console.info("[Billing] Handling checkout.session.completed.", {
          eventId: event.id,
          sessionId: session.id,
          mode: session.mode,
          status: session.status,
          purchasedUserId,
        });

        if (session.mode !== "subscription" || session.status !== "complete") {
          break;
        }

        if (purchasedUserId == null || purchasedUserId === "") {
          console.warn("[Billing] checkout.session.completed missing user binding.", {
            eventId: event.id,
            sessionId: session.id,
          });
          break;
        }

        const grantResult = await grantProAccessToUser({
          userId: purchasedUserId,
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : null,
        });

        if (grantResult.activatedNow) {
          const stripeForValue = getStripeServerClient();
          const conversionValue = await resolveCheckoutSessionConversionValue(
            stripeForValue,
            session,
          );

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
            paid_media_value_usd: conversionValue?.value_usd ?? null,
            paid_media_currency: conversionValue?.currency ?? null,
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const matchedUser = await findUserByStripeBillingIdentity({
          userId: subscription.metadata?.user_id ?? null,
          stripeCustomerId:
            typeof subscription.customer === "string" ? subscription.customer : null,
          stripeSubscriptionId: subscription.id,
        });

        console.info("[Billing] Handling customer.subscription.deleted.", {
          eventId: event.id,
          subscriptionId: subscription.id,
          customerId:
            typeof subscription.customer === "string" ? subscription.customer : null,
          matchedUserId: matchedUser?.id ?? null,
        });

        if (matchedUser == null) {
          console.warn("[Billing] No user matched deleted subscription webhook.", {
            eventId: event.id,
            subscriptionId: subscription.id,
          });
          break;
        }

        await revokeProAccessToUser({
          userId: matchedUser.id,
          billingStatus: "canceled",
          stripeCustomerId:
            typeof subscription.customer === "string" ? subscription.customer : null,
          stripeSubscriptionId: subscription.id,
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const invoiceSubscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : typeof invoice.parent?.subscription_details?.subscription?.id === "string"
              ? invoice.parent.subscription_details.subscription.id
              : null;
        const matchedUser = await findUserByStripeBillingIdentity({
          userId: invoice.parent?.subscription_details?.metadata?.user_id ?? null,
          stripeCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : null,
          stripeSubscriptionId: invoiceSubscriptionId,
        });

        console.info("[Billing] Handling invoice.payment_failed.", {
          eventId: event.id,
          invoiceId: invoice.id,
          customerId:
            typeof invoice.customer === "string" ? invoice.customer : null,
          subscriptionId: invoiceSubscriptionId,
          matchedUserId: matchedUser?.id ?? null,
        });

        if (matchedUser == null) {
          console.warn("[Billing] No user matched failed invoice webhook.", {
            eventId: event.id,
            invoiceId: invoice.id,
          });
          break;
        }

        await revokeProAccessToUser({
          userId: matchedUser.id,
          billingStatus: "payment_failed",
          stripeCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : null,
          stripeSubscriptionId: invoiceSubscriptionId,
        });
        break;
      }
      default:
        console.info("[Billing] Ignoring unhandled Stripe webhook event.", {
          eventId: event.id,
          eventType: event.type,
        });
        break;
      }

      return NextResponse.json({ received: true });
    } catch (handlerError) {
      // Handler ran but threw after the claim row was inserted. Release the
      // claim so Stripe's retry can re-attempt with a fresh handler run
      // instead of being silently skipped as a "duplicate". Then re-throw
      // to the outer catch which returns 500 (Stripe interprets that as
      // "retry me").
      await releaseStripeEventClaim(event.id);
      throw handlerError;
    }
  } catch (error) {
    console.error("[Billing] Stripe webhook handler failed.", error, {
      eventId: event.id,
      eventType: event.type,
    });
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
