import { apiRequest } from "@/api/client";

type ClientProductEventInput = {
  event_name:
    | "signup_started"
    | "signup_completed"
    | "onboarding_completed"
    | "paywall_shown"
    | "upgrade_clicked"
    | "checkout_started"
    | "checkout_completed"
    | "pro_activated"
    | "today_generated"
    | "forecast_generated"
    | "blueprint_generated"
    | "ask_submitted"
    | "ask_regenerated"
    | "first_today_generated"
    | "first_forecast_generated"
    | "first_blueprint_generated"
    | "first_ask_submitted";
  feature?: "today" | "forecast" | "blueprint" | "ask" | null;
  plan_type?: "free" | "pro" | null;
  upgrade_surface?: string | null;
};

const sentEventKeys = new Set<string>();

export async function trackProductEvent(
  input: ClientProductEventInput,
  options?: { onceKey?: string },
) {
  if (options?.onceKey) {
    if (sentEventKeys.has(options.onceKey)) {
      return;
    }

    sentEventKeys.add(options.onceKey);
  }

  try {
    await apiRequest<{ ok: boolean }>("/api/events", {
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch {
    // Event capture should never break the mobile UX.
  }
}
