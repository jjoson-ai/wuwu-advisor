import type { Metadata } from "next";

import { CareModeCard } from "@/components/care-mode-card";
import { buildCareModePayload } from "@/domain/safety/care-mode";

export const metadata: Metadata = {
  title: "Support resources",
  description:
    "Crisis and support resources. Wuwu Advisor is not a crisis service.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * /care — the persistent landing for the SOS button.
 *
 * Rendered both when the SOS button is clicked and when the user navigates
 * directly. Shows the same Care Mode payload a crisis trigger would show.
 * Accessible without auth on purpose — if someone is in crisis, friction
 * is the enemy.
 */
export default function CarePage() {
  const payload = buildCareModePayload("elevated");

  return (
    <main className="container stack">
      <div style={{ maxWidth: 720, margin: "2rem auto", width: "100%" }}>
        <CareModeCard payload={payload} />
      </div>
    </main>
  );
}
