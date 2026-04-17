"use client";

import { PRODUCT_PLATFORM_HEADER } from "@/lib/product-events";
import { trackGooglePaidMediaEvent } from "@/lib/paid-media.client";

type StartProCheckoutInput = {
  upgradeSurface: string;
};

type CheckoutResponse = {
  checkoutUrl: string;
};

function getCurrentReturnPath() {
  return `${window.location.pathname}${window.location.search}`;
}

export async function startProCheckout(input: StartProCheckoutInput) {
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [PRODUCT_PLATFORM_HEADER]: "web",
    },
    body: JSON.stringify({
      returnPath: getCurrentReturnPath(),
      upgradeSurface: input.upgradeSurface,
    }),
  });

  const payload = (await response.json()) as {
    error?: string;
  } & Partial<CheckoutResponse>;

  if (response.ok === false || typeof payload.checkoutUrl !== "string") {
    throw new Error(payload.error || "Unable to start checkout.");
  }

  trackGooglePaidMediaEvent("checkout_started");
  window.location.assign(payload.checkoutUrl);
}
