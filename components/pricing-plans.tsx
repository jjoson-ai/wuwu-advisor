"use client";

import Link from "next/link";
import { useState } from "react";

import { UpgradeProButton } from "@/components/upgrade-pro-button";

type Plan = "monthly" | "annual";

const FREE_FEATURES = [
  "Daily briefing — Today signals, timing windows, domain guidance",
  "Blueprint overview — summary, core pattern, Chinese zodiac signature",
  "30-day Forecast — phase summary and snapshot",
  "Ask — 3 questions per day, 1 big decision per week",
];

const PRO_FEATURES = [
  "Full Blueprint — all sections, full depth across three systems",
  "Full 30-day Forecast — detailed guidance, supporting analysis",
  "Unlimited Ask — no daily cap, follow-up questions included",
  "Blueprint context in every generation — more personal, less generic",
];

type PricingPlansProps = {
  isPro: boolean;
  isLoggedIn: boolean;
};

export function PricingPlans({ isPro, isLoggedIn }: PricingPlansProps) {
  const [plan, setPlan] = useState<Plan>("annual");

  return (
    <>
      {/* Billing toggle */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface-raised, rgba(0,0,0,0.06))",
            borderRadius: "9999px",
            padding: "3px",
            gap: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => setPlan("monthly")}
            style={{
              padding: "0.4rem 1.1rem",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.88rem",
              fontWeight: plan === "monthly" ? 600 : 400,
              background: plan === "monthly" ? "var(--card-bg, #fff)" : "transparent",
              color: plan === "monthly" ? "var(--text)" : "var(--text-muted)",
              boxShadow: plan === "monthly" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setPlan("annual")}
            style={{
              padding: "0.4rem 1.1rem",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.88rem",
              fontWeight: plan === "annual" ? 600 : 400,
              background: plan === "annual" ? "var(--card-bg, #fff)" : "transparent",
              color: plan === "annual" ? "var(--text)" : "var(--text-muted)",
              boxShadow: plan === "annual" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            Annual
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                background: "var(--accent)",
                color: "#fff",
                padding: "0.15em 0.5em",
                borderRadius: "9999px",
                lineHeight: 1.5,
              }}
            >
              Save 50%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
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
          {!isLoggedIn ? (
            <Link
              className="button"
              data-testid="pricing-free-plan-cta"
              href="/login?mode=signup"
              style={{ textAlign: "center", justifyContent: "center" }}
            >
              Sign up — it's free
            </Link>
          ) : (
            <p
              className="muted"
              data-testid="pricing-free-plan-label"
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
            {plan === "annual" ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", flexWrap: "wrap" }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 800,
                      fontSize: "2rem",
                      letterSpacing: "-0.03em",
                      lineHeight: 1.1,
                      color: "var(--text)",
                    }}
                  >
                    $89.99
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                    / year
                  </p>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  $7.50/mo billed annually
                </p>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", flexWrap: "wrap" }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 800,
                      fontSize: "2rem",
                      letterSpacing: "-0.03em",
                      lineHeight: 1.1,
                      color: "var(--text)",
                    }}
                  >
                    $14.99
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                    / month
                  </p>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  No trial on monthly — start annual for 7 days free
                </p>
              </>
            )}
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
            <>
              <UpgradeProButton
                data-testid="pricing-upgrade-btn"
                label={plan === "annual" ? "Start 7-day free trial" : "Upgrade to Pro"}
                plan={plan}
                upgradeSurface="pricing_page"
                className="button"
                style={{ width: "100%", justifyContent: "center" }}
              />
              <p
                className="muted"
                style={{ margin: 0, fontSize: "0.82rem", textAlign: "center" }}
              >
                {plan === "annual"
                  ? "7-day free trial · Cancel anytime"
                  : "No trial · Cancel anytime"}
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
