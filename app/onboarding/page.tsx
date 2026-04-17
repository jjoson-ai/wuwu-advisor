import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  CalendarIcon,
  CompassIcon,
  SlidersIcon,
  SparklesIcon,
  UserIcon,
} from "@/components/icons";
import { OnboardingForm } from "@/components/onboarding-form";
import { PrivacyDataSection } from "@/components/privacy-data-section";
import {
  getOnboardingInputFromRecord,
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Settings",
};

const WHY_ITEMS = [
  {
    Icon: CalendarIcon,
    title: "Birth date and time",
    body: "Anchors your Western chart, Life Path, and Four Pillars — the precision everything else is built on.",
  },
  {
    Icon: CompassIcon,
    title: "Birth place",
    body: "Locks the Ascendant and house placements, so daily transits map to the right areas of your life.",
  },
  {
    Icon: UserIcon,
    title: "Full birth name",
    body: "Used only for numerology (Expression, Soul Urge, Personality). Never displayed or shared.",
  },
];

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const record = await getOnboardingRecord(user.id);
  const initialValues = getOnboardingInputFromRecord(record);
  const isReturning = isOnboardingComplete(record);

  return (
    <div className="stack">
      <section className="card page-hero">
        <div className="page-hero-grid">
          <div className="page-hero-kicker-row">
            <span className="page-hero-icon" aria-hidden>
              {isReturning ? <SlidersIcon size={22} /> : <SparklesIcon size={22} />}
            </span>
            <p className="page-kicker">
              {isReturning ? "Profile and privacy" : `Welcome to ${PRODUCT_NAME}`}
            </p>
          </div>
          <h1 className="page-title">
            {isReturning ? "Settings" : "Let's build your chart"}
          </h1>
          <p className="page-subtitle">
            {isReturning
              ? "Update the details used to personalize Today, Your Birth Blueprint, Forecast, and Ask."
              : "One-time setup. Your birth data powers every read — Today, Blueprint, Forecast, and Ask. Accurate details mean sharper guidance."}
          </p>
        </div>
      </section>

      {isReturning ? null : (
        <section className="card stack" style={{ padding: "1.75rem" }}>
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
            <span className="feature-icon" aria-hidden>
              <SparklesIcon size={22} />
            </span>
            <p className="card-eyebrow" style={{ margin: 0 }}>
              Why this matters
            </p>
          </div>
          <div style={{ display: "grid", gap: "1.1rem" }}>
            {WHY_ITEMS.map(({ Icon, title, body }) => (
              <div
                key={title}
                style={{ display: "flex", gap: "0.9rem", alignItems: "flex-start" }}
              >
                <span className="life-card-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <div style={{ display: "grid", gap: "0.2rem" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
                  <p
                    className="muted"
                    style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.58 }}
                  >
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <OnboardingForm initialValues={initialValues} />
      <PrivacyDataSection />
    </div>
  );
}
