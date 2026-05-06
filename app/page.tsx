import { redirect } from "next/navigation";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import {
  CompassIcon,
  LogoMark,
  MessageIcon,
  SparklesIcon,
  SunIcon,
  TrendingIcon,
} from "@/components/icons";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { getCurrentUser, isAgeVerified } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getLatestBriefingForUser } from "@/domain/briefing/briefing.service";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const FEATURES: ReadonlyArray<{
  label: string;
  description: string;
  Icon: IconComponent;
  href: string;
}> = [
  {
    label: "Today",
    Icon: SunIcon,
    href: "/dashboard",
    description:
      "A daily briefing with today's thesis, your specific move, and timing windows for work, money, relationships, and energy.",
  },
  {
    label: "Forecast",
    Icon: TrendingIcon,
    href: "/forecast",
    description:
      "A 30-day planning read. What's gaining momentum, what to build steadily, what to avoid forcing, and when the month's pivots land.",
  },
  {
    label: "Blueprint",
    Icon: CompassIcon,
    href: "/blueprint",
    description:
      "Your natal chart decoded across all three systems. Personality pattern, decision style, life path, and Chinese pillars — built once, referenced everywhere.",
  },
  {
    label: "Ask",
    Icon: MessageIcon,
    href: "/decision",
    description:
      "On-demand guidance for a specific decision. Bring the context, get a chart-based answer — not generic advice.",
  },
];

const SYSTEMS: ReadonlyArray<{ n: string; label: string; body: string }> = [
  {
    n: "01",
    label: "Western astrology",
    body: "Tracks planetary transits against your natal chart — surfaces timing windows, energetic patterns, and when to push vs. wait.",
  },
  {
    n: "02",
    label: "Numerology",
    body: "Pulls your Life Path and personal-year cycles — shows which themes are active this month and how your core numbers shape decisions.",
  },
  {
    n: "03",
    label: "Chinese zodiac",
    body: "Reads your year, month, day, and hour pillars — adds pacing and relational context that Western astrology alone misses.",
  },
];

const FOR_YOU: ReadonlyArray<string> = [
  "Make real decisions and want a second read on timing",
  "Are astrology-curious but allergic to daily horoscope vibes",
  "Want specific guidance, not daily platitudes",
  'Prefer \u201Chere\u2019s what to watch\u201D over \u201Chere\u2019s what will happen\u201D',
];

const NOT_FOR_YOU: ReadonlyArray<string> = [
  'Want daily \u201Cyou will meet a tall stranger\u201D horoscopes',
  "Don\u2019t want your birth data on file",
  "Are looking for fortune-telling, not a decision tool",
];

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Is this real astrology or just AI making things up?",
    a: `${PRODUCT_NAME} uses real astronomical data — planetary positions, transits, and numerology calculations computed from your exact birth time. The AI doesn't invent the chart, it reads it. Where the AI adds value is translation: explaining what the chart pattern means for your specific decisions in plain language.`,
  },
  {
    q: "How accurate can this really be?",
    a: "Astrology is a framework for noticing patterns, not a prediction engine. Wuwu won't tell you exactly what will happen. It will tell you what's likely to be easy vs. hard today, where your timing is sharp, and what to watch. Think second opinion, not crystal ball.",
  },
  {
    q: "Do I need to believe in astrology for this to be useful?",
    a: "No. Many users treat it as a thinking tool — a way to get a different angle on a decision. If the read resonates, you've got a useful frame. If it doesn't, ignore it. The practice is: read it, don't be bound by it.",
  },
  {
    q: "What happens with my birth data?",
    a: "Your birth date, time, and place live on your private account and are used to compute your chart. They're never shared or sold. See the Privacy page for specifics.",
  },
];

// ─── Logged-in home ──────────────────────────────────────────────────────────

type LoggedInHomeProps = {
  displayName: string | null;
  hasBriefing: boolean;
  isFree: boolean;
};

function LoggedInHome({ displayName, hasBriefing, isFree }: LoggedInHomeProps) {
  const greeting = displayName ? `Welcome back, ${displayName}.` : "Welcome back.";

  return (
    <>
      {/* Hero */}
      <section className="card page-hero" style={{ gap: "1.25rem" }}>
        <p className="page-kicker">{BRAND_NAME} · Personal decision advisor</p>
        <h1 className="page-title">{greeting}</h1>
        <p className="page-subtitle">
          {hasBriefing
            ? "Your reads are ready. Jump straight in or start fresh."
            : "Your chart is set up. Generate your first read below."}
        </p>
        <div className="page-actions">
          <Link className="button" href="/dashboard">
            {hasBriefing ? "Open today's read" : "Generate today's read"}
          </Link>
          <Link className="button secondary" href="/onboarding">
            Settings
          </Link>
        </div>
      </section>

      {/* Surface grid */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p className="section-label" style={{ margin: 0 }}>
          Your reads
        </p>
        <div className="section-grid two-up">
          {FEATURES.map(({ label, description, Icon, href }) => (
            <Link
              key={label}
              href={href}
              className="card stack card-feature"
              style={{ textDecoration: "none", color: "inherit" }}
            >
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
            </Link>
          ))}
        </div>
      </div>

      {/* Upgrade nudge — free users only */}
      {isFree ? (
        <section
          className="card card-hero stack"
          style={{ padding: "1.5rem 1.75rem" }}
        >
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p className="card-eyebrow">Upgrade to Pro</p>
            <p
              className="card-title"
              style={{ fontSize: "1.1rem", margin: 0 }}
            >
              Full Blueprint, unlimited Ask, and complete Forecast detail.
            </p>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.93rem" }}>
            $14.99 / mo · or $89.99 / yr · 7-day free trial included.
          </p>
          <div className="page-actions" style={{ gap: "0.65rem" }}>
            <Link className="button" href="/pricing">
              See what's included
            </Link>
          </div>
        </section>
      ) : null}

      {/* Collapsed marketing — three systems, for sharing context */}
      <section className="card stack" style={{ padding: "1.75rem 2rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="card-eyebrow">How it works</p>
          <p className="card-title" style={{ fontSize: "1.25rem" }}>
            Three systems, cross-read.
          </p>
          <p
            className="muted"
            style={{ margin: 0, lineHeight: 1.62, fontSize: "0.95rem" }}
          >
            {PRODUCT_NAME} reads all three and surfaces where they agree — which
            is how you get a specific answer instead of a generic one.
          </p>
        </div>
        <div style={{ display: "grid", gap: "1.1rem", marginTop: "0.5rem" }}>
          {SYSTEMS.map(({ n, label, body }) => (
            <div
              key={n}
              style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  minWidth: "2.4rem",
                  color: "var(--accent)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  letterSpacing: "0.04em",
                  marginTop: "0.15rem",
                }}
              >
                {n}
              </span>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
                <p
                  className="muted"
                  style={{ margin: 0, fontSize: "0.93rem", lineHeight: 1.6 }}
                >
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ─── Marketing landing (anonymous visitors) ───────────────────────────────────

function MarketingLanding() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      {/* No conversion CTA in the hero — user hasn't seen value yet.
          Soft anchor to the sample read sets up the proof step.
          (UX QA 2026-04-26: "start free / see pricing introduced too early".) */}
      <section
        className="card page-hero landing-hero"
        style={{ padding: "2.75rem 2rem 2.25rem", gap: "1.5rem" }}
      >
        <span className="landing-hero-mark" aria-hidden>
          <LogoMark size={180} />
        </span>
        <p className="page-kicker">{BRAND_NAME} · Personal decision advisor</p>
        <h1 className="page-title">
          Your chart. Your timing.
          <br />
          Your next move.
        </h1>
        <p className="page-subtitle">
          {PRODUCT_NAME} reads your birth chart across three systems — Western astrology, numerology, and Chinese zodiac — and translates it into specific timing and decisions for what&apos;s actually on your plate.
        </p>
        <div className="page-actions">
          <Link className="button secondary" href="#sample">
            See how it works ↓
          </Link>
        </div>
      </section>

      {/* ── Sample briefing (proof) ────────────────────────────────────── */}
      <section id="sample" className="stack" style={{ gap: "0.75rem" }}>
        <p className="section-label" style={{ margin: 0 }}>
          What a daily read looks like
        </p>
        <div
          className="card card-featured card-hero stack"
          style={{ padding: "1.75rem" }}
        >
          <p className="card-eyebrow">Sample briefing · Today</p>
          <div style={{ display: "grid", gap: "1.5rem" }}>
            <div className="stack" style={{ gap: "0.5rem" }}>
              <p className="card-eyebrow">Today&rsquo;s thesis</p>
              <p style={{ margin: 0, lineHeight: 1.68 }}>
                Today tilts toward structure over speed. The Moon&rsquo;s angle to
                your Saturn rewards careful work and punishes the half-finished,
                so anything you ship today should be something you can stand
                behind a week from now.
              </p>
            </div>
            <div className="soft-divider" />
            <div className="stack" style={{ gap: "0.5rem" }}>
              <p className="card-eyebrow">Today&rsquo;s move</p>
              <p style={{ margin: 0, lineHeight: 1.68 }}>
                Pick the one conversation you&rsquo;ve been avoiding — the one
                where you need to ask for something clearly. Between 2pm and 5pm
                your chart&rsquo;s communication window is open and your Life
                Path 8 favors direct talk. After 6pm the Mercury pressure turns
                softer; save nuance for later.
              </p>
            </div>
            <div className="soft-divider" />
            <div className="stack" style={{ gap: "0.5rem" }}>
              <p className="card-eyebrow">Energy + pacing</p>
              <p style={{ margin: 0, lineHeight: 1.68 }}>
                Morning is best for detail work. Don&rsquo;t schedule anything
                that requires selling or persuasion before noon — the Saturn
                drag makes you sound heavier than you are.
              </p>
            </div>
          </div>
        </div>
        <p
          className="muted"
          style={{ margin: 0, fontSize: "0.85rem", textAlign: "center" }}
        >
          Sample output. Your actual read is generated from your birth chart.
        </p>
      </section>

      {/* ── Three systems (differentiator) ─────────────────────────────── */}
      <section className="card stack" style={{ padding: "1.75rem 2rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="card-eyebrow">Why it feels specific</p>
          <p className="card-title" style={{ fontSize: "1.35rem" }}>
            Three systems, cross-read.
          </p>
          <p
            className="muted"
            style={{ margin: 0, lineHeight: 1.62, fontSize: "0.98rem" }}
          >
            Most astrology apps read one system and call it a day.{" "}
            {PRODUCT_NAME} reads all three and surfaces where they agree — which
            is how you get a specific answer instead of a generic one.
          </p>
        </div>
        <div style={{ display: "grid", gap: "1.1rem", marginTop: "0.5rem" }}>
          {SYSTEMS.map(({ n, label, body }) => (
            <div
              key={n}
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "flex-start",
              }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  minWidth: "2.4rem",
                  color: "var(--accent)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  letterSpacing: "0.04em",
                  marginTop: "0.15rem",
                }}
              >
                {n}
              </span>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
                <p
                  className="muted"
                  style={{
                    margin: 0,
                    fontSize: "0.93rem",
                    lineHeight: 1.6,
                  }}
                >
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── First conversion CTA ───────────────────────────────────────── */}
      {/* Placed AFTER hero → proof → how-it-works (per UX QA 2026-04-26).
          The user has now seen what a daily read looks like and how the
          three-system cross-read works — first time it's appropriate to
          ask for a signup. */}
      <section
        className="card card-hero stack"
        style={{ padding: "1.75rem 2rem", textAlign: "center", gap: "0.85rem" }}
      >
        <p
          className="card-title"
          style={{ fontSize: "1.25rem", margin: 0 }}
        >
          Ready to see your own read?
        </p>
        <p
          className="muted"
          style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}
        >
          Free is a real daily tool, not a trial. Add your birth details and get
          your first briefing in under a minute.
        </p>
        <div
          className="page-actions"
          style={{ justifyContent: "center", gap: "0.65rem" }}
        >
          <Link className="button" href="/login?mode=signup">
            Start free — no credit card
          </Link>
        </div>
      </section>

      {/* ── What you can do ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <p className="section-label" style={{ margin: 0 }}>
          What you can do
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

      {/* ── Who it's for ───────────────────────────────────────────────── */}
      <section className="card stack" style={{ padding: "1.75rem 2rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="card-eyebrow">Is this for you</p>
          <p className="card-title" style={{ fontSize: "1.25rem" }}>
            Wuwu pre-qualifies hard.
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
                color: "var(--accent)",
              }}
            >
              Yes, if you
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.5rem",
              }}
            >
              {FOR_YOU.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: "0.55rem",
                    alignItems: "flex-start",
                    fontSize: "0.92rem",
                    lineHeight: 1.55,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      marginTop: "0.1rem",
                      color: "var(--accent)",
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className="card card-muted stack"
            style={{ padding: "1.25rem", boxShadow: "none" }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>
              Probably not, if you
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.5rem",
              }}
            >
              {NOT_FOR_YOU.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    gap: "0.55rem",
                    alignItems: "flex-start",
                    fontSize: "0.92rem",
                    lineHeight: 1.55,
                    color: "var(--text-muted)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      marginTop: "0.1rem",
                      fontWeight: 700,
                    }}
                  >
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── FAQ / objections ───────────────────────────────────────────── */}
      <section className="card stack" style={{ padding: "1.75rem 2rem" }}>
        <p className="card-eyebrow">Questions you should be asking</p>
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {FAQ.map(({ q, a }) => (
            <div key={q} className="stack" style={{ gap: "0.4rem" }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.98rem" }}>
                {q}
              </p>
              <p
                className="muted"
                style={{ margin: 0, fontSize: "0.93rem", lineHeight: 1.62 }}
              >
                {a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing + final CTA ────────────────────────────────────────── */}
      <section className="card stack" style={{ padding: "1.75rem 2rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="card-eyebrow">Pricing</p>
          <p className="card-title" style={{ fontSize: "1.35rem" }}>
            Free to start. Pro for the full depth.
          </p>
          <p
            className="muted"
            style={{ margin: 0, lineHeight: 1.62, fontSize: "0.95rem" }}
          >
            Free is a real daily tool, not a trial. Pro unlocks the deeper
            sections and Blueprint-aware context in every read.
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
            <div style={{ display: "grid", gap: "0.2rem" }}>
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
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.2rem",
                  flexWrap: "wrap",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    fontSize: "1.5rem",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.1,
                  }}
                >
                  $14.99
                </p>
                <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                  /mo · or $89.99/yr
                </p>
              </div>
            </div>
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
              <li style={{ fontSize: "0.9rem" }}>
                Blueprint context in every read
              </li>
            </ul>
          </div>
        </div>
        <div className="page-actions" style={{ gap: "0.75rem" }}>
          <Link className="button" href="/login?mode=signup">
            Start free
          </Link>
          <Link className="button secondary" href="/pricing">
            Compare plans
          </Link>
        </div>
        <p
          className="muted"
          style={{ margin: 0, fontSize: "0.82rem", textAlign: "center" }}
        >
          <SparklesIcon size={12} /> Free plan has no expiry · Pro includes a
          7-day free trial
        </p>
      </section>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user === null) {
    return <MarketingLanding />;
  }

  if (!isAgeVerified(user)) {
    redirect("/age-gate?next=/dashboard");
  }

  const record = await getOnboardingRecord(user.id);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  const [access, latestBriefing] = await Promise.all([
    getServerAccessState(user),
    getLatestBriefingForUser(user.id),
  ]);

  const onboardingInput = record.profile?.display_name ?? null;

  return (
    <LoggedInHome
      displayName={onboardingInput}
      hasBriefing={latestBriefing !== null}
      isFree={access.accessLevel === "free"}
    />
  );
}
