import Link from "next/link";

import { SparklesIcon } from "@/components/icons";
import { UpgradeProButton } from "@/components/upgrade-pro-button";
import { getCurrentUser } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";

const FREE_FEATURES = [
  "Daily briefing — Today signals, timing windows, domain guidance",
  "Blueprint overview — summary, core pattern, Chinese zodiac signature",
  "30-day Forecast — phase summary and snapshot",
  "Ask — 2 questions per day",
];

const PRO_FEATURES = [
  "Full Blueprint — all sections, full depth across three systems",
  "Full 30-day Forecast — detailed guidance, supporting analysis",
  "Unlimited Ask — no daily cap, follow-up questions included",
  "Blueprint context in every generation — more personal, less generic",
];

export default async function PricingPage() {
  const user = await getCurrentUser();
  const access = user === null ? null : await getServerAccessState(user);
  const isPro =
    access?.accessLevel === "pro" || access?.accessLevel === "internal";

  return (
    <>
      {/* Header */}
      <section className="card page-hero" style={{ padding: "2rem 2rem 1.75rem" }}>
        <div className="page-hero-kicker-row">
          <span className="page-hero-icon" aria-hidden>
            <SparklesIcon size={22} />
          </span>
          <p className="page-kicker">Pricing</p>
        </div>
        <h1 className="page-title" style={{ fontSize: "clamp(1.85rem, 4vw, 2.8rem)" }}>
          Free to start.
          <br />
          Pro for the full picture.
        </h1>
        <p className="page-subtitle">
          Everything in Wuwu Advisor is built around your personal chart. Free
          gives you the daily read. Pro unlocks the full depth of every feature.
        </p>
      </section>

      {/* Plan comparison */}
      <div className="section-grid two-up" style={{ gap: "1rem" }}>
        {/* Free card */}
        <div className="card stack card-muted" style={{ padding: "1.75rem" }}>
          <div style={{ display: "grid", gap: "0.3rem" }}>
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "1.05rem",
                letterSpacing: "-0.01em",
              }}
            >
              Free
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              No credit card required
            </p>
          </div>
          <div className="soft-divider" />
          <ul
            style={{
              margin: 0,
              paddingLeft: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.65rem",
            }}
          >
            {FREE_FEATURES.map((f) => (
              <li key={f} className="pricing-feature">
                <span className="pricing-check pricing-check-free" aria-hidden>
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          {user === null ? (
            <Link className="button secondary" href="/login" style={{ textAlign: "center" }}>
              Start free
            </Link>
          ) : (
            <p
              className="muted"
              style={{ margin: 0, fontSize: "0.88rem", textAlign: "center" }}
            >
              {isPro ? "Included in your Pro plan" : "Your current plan"}
            </p>
          )}
        </div>

        {/* Pro card */}
        <div
          className="card stack card-hero card-featured"
          style={{ padding: "1.75rem" }}
        >
          <div style={{ display: "grid", gap: "0.3rem" }}>
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "1.05rem",
                letterSpacing: "-0.01em",
                color: "var(--accent)",
              }}
            >
              Pro
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Full access to every feature
            </p>
          </div>
          <div className="soft-divider" />
          <ul
            style={{
              margin: 0,
              paddingLeft: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.65rem",
            }}
          >
            {PRO_FEATURES.map((f) => (
              <li key={f} className="pricing-feature pricing-feature-pro">
                <span className="pricing-check pricing-check-pro" aria-hidden>
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <p
              style={{
                margin: 0,
                fontSize: "0.88rem",
                textAlign: "center",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              Your current plan
            </p>
          ) : (
            <UpgradeProButton
              label="Upgrade to Pro"
              upgradeSurface="pricing_page"
              className="button"
              style={{ width: "100%", justifyContent: "center" }}
            />
          )}
        </div>
      </div>

      {/* FAQ / note */}
      <section className="card stack card-muted" style={{ padding: "1.5rem 1.75rem" }}>
        <p className="card-eyebrow">Good to know</p>
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {[
            {
              q: "What's included in the free plan?",
              a: "You get a full daily briefing, a Blueprint overview, a 30-day forecast snapshot, and 2 Ask questions per day. No time limit — free stays free.",
            },
            {
              q: "What does Pro unlock?",
              a: "Full Blueprint depth across all sections, the complete 30-day Forecast with supporting detail, unlimited Ask questions with follow-ups, and Blueprint context wired into every generation so outputs are more personal.",
            },
            {
              q: "Is there a trial?",
              a: "The free plan is fully functional and has no expiry. Try it before deciding on Pro.",
            },
          ].map(({ q, a }) => (
            <div key={q} style={{ display: "grid", gap: "0.3rem" }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.92rem" }}>{q}</p>
              <p
                className="muted"
                style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.62 }}
              >
                {a}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
