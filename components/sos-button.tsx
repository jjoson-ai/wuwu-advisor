"use client";

import Link from "next/link";

import { trackProductEvent } from "@/lib/client-events";

/**
 * SOS button — appears in the header for 24 hours after any crisis trigger.
 *
 * Links to `/care`, which renders the Care Mode payload (the same resources
 * the user saw at trigger time). We don't hotlink `tel:988` directly because
 * we serve users outside the US; the /care page shows all regions.
 *
 * Visibility is controlled by the Header (server component) which reads
 * `isInCrisisWindow(user)` — this component only handles the click + label.
 */
export function SOSButton() {
  return (
    <Link
      className="button secondary"
      href="/care"
      data-testid="sos-button"
      onClick={() => {
        void trackProductEvent({
          event_name: "sos_button_clicked",
          feature: null,
          plan_type: null,
          upgrade_surface: null,
        });
      }}
      style={{
        borderColor: "var(--accent)",
        color: "var(--accent)",
      }}
    >
      Get support
    </Link>
  );
}
