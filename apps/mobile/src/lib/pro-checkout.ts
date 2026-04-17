import { Linking } from "react-native";

import { apiRequest } from "@/api/client";

type StartProCheckoutInput = {
  upgradeSurface: string;
  feature?: "today" | "forecast" | "blueprint" | "ask";
};

type CheckoutResponse = {
  checkoutUrl: string;
};

function getReturnPath(feature?: StartProCheckoutInput["feature"]) {
  switch (feature) {
    case "today":
      return "/dashboard";
    case "forecast":
      return "/forecast";
    case "blueprint":
      return "/blueprint";
    case "ask":
      return "/decision";
    default:
      return "/dashboard";
  }
}

export async function startProCheckout(input: StartProCheckoutInput) {
  const payload = await apiRequest<CheckoutResponse>("/api/checkout", {
    method: "POST",
    body: JSON.stringify({
      returnPath: getReturnPath(input.feature),
      upgradeSurface: input.upgradeSurface,
    }),
  });

  await Linking.openURL(payload.checkoutUrl);
}
