import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import {
  CompassIcon,
  LogoMark,
  MessageIcon,
  SunIcon,
  TrendingIcon,
} from "@/components/icons";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const FEATURES: ReadonlyArray<{
  label: string;
  href: string;
  description: string;
  Icon: IconComponent;
}> = [
  {
    label: "Today",
    href: "/dashboard",
    Icon: SunIcon,
    description:
      "Daily signals and timing windows from your chart and current transits. Work, money, relationships, and energy — in one read.",
  },
  {
    label: "Forecast",
    href: "/forecast",
    Icon: TrendingIcon,
    description:
      "A 30-day planning brief. What's gaining momentum, what to build steadily, what to avoid forcing, and when things shift.",
  },
  {
    label: "Blueprint",
    href: "/blueprint",
    Icon: CompassIcon,
    description:
      "Your natal chart decoded across three systems. Personality pattern, decision style, life path, and Chinese zodiac — built once, used everywhere.",
  },
  {
    label: "Ask",
    href: "/decision",
    Icon: MessageIcon,
    description:
      "On-demand guidance for a specific decision. Bring context, get a chart-based answer — not generic advice.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Set up once",
    body: "Enter your birth data. Wuwu builds your personal chart across three systems and keeps it on file.",
  },
  {
    n: "2",
    title: "Read today",
    body: "Get a daily briefing with key signals, timing windows, and domain guidance for work, money, relationships, and energy.",
  },
  {
    n: "3",
    title: "Ask anything",
    body: "Bring a real decision. Wuwu reads your chart in context and gives you a concrete, specific answer.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section
        className="card page-hero landing-hero"
        style={{ padding: "2.5rem 2rem 2.25rem", gap: "1.5rem" }}
      >
        <span className="landing-hero-mark" aria-hidden>
          <LogoMark size={180} />
        </span>
        <p className="page-kicker">{BRAND_NAME} · Personal decision advisor</p>
        <h1 className="page-title">
          Know what&rsquo;s active.
          <br />
          Move when it&rsquo;s right.
        </h1>
        <p className="page-subtitle">
          {PRODUCT_NAME} reads your birth chart across three systems — Western
          astrology, numerology, and Chinese zodiac — and translates it into a
          daily briefing, a 30-day planning outlook, and on-demand guidance for
          the decisions that actually matter.
        </p>
        <div className="page-actions">
          <Link className="button" href="/login">
            Start free
          </Link>
          <Link className="button secondary" href="/pricing">
            See pricing
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="card stack" style={{ padding: "1.75rem" }}>
        <p className="card-eyebrow">How it works</p>
        <div style={{ display: "grid", gap: "1.35rem" }}>
          {STEPS.map(({ n, title, body }) => (
            <div
              key={n}
              style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: "2rem",
                  height: "2rem",
                  borderRadius: "50%",
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                }}
              >
                {n}
              </span>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
                <p
                  className="muted"
                  style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.62 }}
                >
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p className="section-label" style={{ margin: 0 }}>
          What you get
        </p>
        <div className="section-grid two-up">
          {FEATURES.map(({ label, description, Icon }) => (
            <div key={label} className="card stack card-feature">
              <span className="feature-icon" aria-hidden>
                <Icon size={22} />
              </span>
              <p className="card-eyebrow">{label}</p>
              <p
                className="muted"
                style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.62 }}
              >
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing teaser */}
      <section className="card stack" style={{ padding: "1.75rem 2rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="card-eyebrow">Pricing</p>
          <p className="card-title" style={{ fontSize: "1.35rem" }}>
            Free to start. Pro for the full picture.
          </p>
        </div>
        <div className="section-grid two-up" style={{ gap: "1rem" }}>
          <div
            className="card card-muted stack"
            style={{ padding: "1.25rem", boxShadow: "none" }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "0.95rem",
                letterSpacing: "-0.01em",
              }}
            >
              Free
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.15rem",
                display: "grid",
                gap: "0.4rem",
              }}
            >
              <li className="muted" style={{ fontSize: "0.9rem" }}>
                Daily briefing
              </li>
              <li className="muted" style={{ fontSize: "0.9rem" }}>
                Blueprint overview
              </li>
              <li className="muted" style={{ fontSize: "0.9rem" }}>
                30-day forecast snapshot
              </li>
              <li className="muted" style={{ fontSize: "0.9rem" }}>
                2 Ask questions per day
              </li>
            </ul>
          </div>
          <div
            className="card card-hero stack"
            style={{ padding: "1.25rem", borderColor: "var(--border-strong)" }}
          >
            <p
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "0.95rem",
                letterSpacing: "-0.01em",
                color: "var(--accent)",
              }}
            >
              Pro
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.15rem",
                display: "grid",
                gap: "0.4rem",
              }}
            >
              <li style={{ fontSize: "0.9rem" }}>Full Blueprint — all sections</li>
              <li style={{ fontSize: "0.9rem" }}>Full 30-day Forecast detail</li>
              <li style={{ fontSize: "0.9rem" }}>Unlimited Ask questions</li>
              <li style={{ fontSize: "0.9rem" }}>Blueprint context in every read</li>
            </ul>
          </div>
        </div>
        <div className="page-actions" style={{ gap: "0.75rem" }}>
          <Link className="button" href="/pricing">
            Compare plans
          </Link>
          <Link className="button secondary" href="/login">
            Start free
          </Link>
        </div>
      </section>
    </>
  );
}
