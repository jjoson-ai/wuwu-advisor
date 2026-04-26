import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import type { ComponentType, SVGProps } from "react";

import { BriefingFeedbackForm } from "@/components/briefing-feedback-form";
import { MemoryIntroToast } from "@/components/memory-intro-toast";
import {
  BoltIcon,
  BriefcaseIcon,
  CoinsIcon,
  SunIcon,
  UsersIcon,
} from "@/components/icons";
import { formatBriefingForDashboard } from "@/domain/briefing/briefing.formatter";
import { getLatestBriefingForUser } from "@/domain/briefing/briefing.service";
import { highlightAstroTerms } from "@/domain/display/astro-terms";
import { createNumerologyMentionFormatter } from "@/domain/display/numerology-mentions";
import { splitDisplayParagraphs } from "@/domain/display/narrative-display";
import { getFeedbackForBriefing } from "@/domain/feedback/feedback.service";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser, isAgeVerified } from "@/lib/auth";
import { GenerateBriefingButton } from "@/components/generate-briefing-button";
import { getServerAccessState } from "@/lib/debug-access";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";
import { UpgradeProButton } from "@/components/upgrade-pro-button";

export const metadata: Metadata = {
  title: "Today",
};

function renderParagraphs(text: string, formatText: (text: string) => string) {
  return splitDisplayParagraphs(formatText(text)).map((paragraph, index) => {
    const key = `${paragraph.slice(0, 24)}-${index}`;
    return (
      <p key={key} style={{ margin: 0 }}>
        {highlightAstroTerms(paragraph, key)}
      </p>
    );
  });
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

type LifeCardProps = {
  eyebrow: string;
  headline: string;
  bullets: Array<{ label: string; value: string }>;
  extra?: React.ReactNode;
  Icon: IconComponent;
};

function LifeCard({ eyebrow, headline, bullets, extra, Icon }: LifeCardProps) {
  return (
    <div className="card card-muted life-card">
      <div className="life-card-head">
        <span className="life-card-icon" aria-hidden>
          <Icon size={18} />
        </span>
        <p className="card-eyebrow">{eyebrow}</p>
      </div>
      <p className="section-heading-serif">{headline}</p>
      {extra}
      <ul className="life-card-bullets">
        {bullets.map(({ label, value }) => (
          <li key={label} className="life-card-bullet">
            <span className="life-card-bullet-label">{label}</span>
            <span>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  if (!isAgeVerified(user)) {
    redirect("/age-gate?next=/dashboard");
  }

  const record = await getOnboardingRecord(user.id);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  const access = await getServerAccessState(user);
  const latestBriefing = await getLatestBriefingForUser(user.id);
  const formattedBriefing =
    latestBriefing === null ? null : formatBriefingForDashboard(latestBriefing);
  const briefingNeedsRegeneration =
    formattedBriefing !== null &&
    isArtifactStaleForCurrentAccess(
      access.accessLevel,
      formattedBriefing.generation_access_level,
    );
  const latestFeedback =
    latestBriefing === null
      ? null
      : await getFeedbackForBriefing(user.id, latestBriefing.id);
  const formatNumerologyMention = createNumerologyMentionFormatter();

  return (
    <div className="stack">
      {/* UX audit C-03 (2026-04-26): introduce the "What Wuwu remembers"
          page on first fact extraction. Self-gates on a localStorage flag
          and a fact-count check, so it appears once and only after there's
          actually something to surface. */}
      <MemoryIntroToast />
      {/* Tier 1: Hero */}
      <section className="card page-hero">
        <div className="page-hero-grid">
          <div className="page-hero-kicker-row">
            <span className="page-hero-icon" aria-hidden>
              <SunIcon size={22} />
            </span>
            <p className="page-kicker">Daily timing</p>
          </div>
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">
            Your daily read on timing, decisions, relationships, and energy.
          </p>
        </div>

        <div className="page-actions">
          <GenerateBriefingButton
            canGenerateUnlimitedToday={access.featureAccess.canGenerateUnlimitedToday}
            hasBriefing={formattedBriefing !== null}
            todayRefreshesPerDay={access.dailyUsageLimits.todayRefreshesPerDay}
            userKey={user.id}
          />
          <Link className="button secondary" href="/onboarding">
            Open Settings
          </Link>
        </div>

        {formattedBriefing === null ? (
          <div className="card card-muted stack empty-state" data-testid="today-empty-state">
            <p className="card-eyebrow">First read</p>
            <h2 className="card-title">Your first daily briefing is one click away</h2>
            <p className="card-subtitle">
              Today reads your chart against the current transits and gives you a
              concrete take on timing, work, money, relationships, and energy.
            </p>
            <ul className="empty-state-list">
              <li>
                <span className="empty-state-bullet">
                  <SunIcon size={16} />
                </span>
                Today&rsquo;s thesis and best timing window
              </li>
              <li>
                <span className="empty-state-bullet">
                  <BriefcaseIcon size={16} />
                </span>
                A specific move for work and money
              </li>
              <li>
                <span className="empty-state-bullet">
                  <BoltIcon size={16} />
                </span>
                Energy and pacing guidance
              </li>
            </ul>
          </div>
        ) : (
          <div className="page-meta">
            <span className="meta-pill">{formattedBriefing.date}</span>
            <span className="meta-pill">Confidence {formattedBriefing.confidence}</span>
            <span className="meta-pill">
              {access.featureAccess.canGenerateUnlimitedToday ? "Pro" : "Free"} depth
            </span>
          </div>
        )}
      </section>

      {formattedBriefing === null ? null : (
        <div className="stack">
          {briefingNeedsRegeneration ? (
            <div className="card card-state card-state--stale stack">
              <p className="card-eyebrow">Needs refresh</p>
              <h2 className="card-title">Refresh for your current tier</h2>
              <p className="card-subtitle">
                This Briefing was generated with free-tier context. Refresh Today
                to recompute it for your current tier.
              </p>
            </div>
          ) : null}

          {/* Concordance badge — only shown when signals from multiple systems agree */}
          {formattedBriefing.systems_agreement ? (
            <section className="card card-muted" data-testid="today-concordance">
              <p className="card-eyebrow">Systems align</p>
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.55 }}>
                {formattedBriefing.systems_agreement}
              </p>
            </section>
          ) : null}

          {/* Tier 2: Daily thesis (the big read) */}
          <section className="card card-featured card-hero stack" data-testid="today-briefing-content">
            <p className="card-eyebrow">Today&rsquo;s thesis</p>
            <div className="text-block">
              {renderParagraphs(
                formattedBriefing.executive_summary,
                formatNumerologyMention,
              )}
            </div>
          </section>

          {/* Tier 3: Today's move — integrated decision + timing + micro */}
          <section className="card card-feature stack today-move">
            <div className="today-move-primary">
              <p className="card-eyebrow">Today&rsquo;s move</p>
              <h2 className="card-title">{formattedBriefing.decision_of_day.scenario}</h2>
            </div>
            <div className="today-move-primary-body text-block">
              {renderParagraphs(
                formattedBriefing.decision_of_day.do,
                formatNumerologyMention,
              )}
            </div>

            <div className="today-move-split">
              <div className="today-move-split-cell">
                <p className="life-card-bullet-label">Watch for</p>
                <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.55 }}>
                  {highlightAstroTerms(
                    formatNumerologyMention(formattedBriefing.decision_of_day.avoid),
                    "today-avoid",
                  )}
                </p>
                <p
                  className="muted"
                  style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5 }}
                >
                  {formattedBriefing.decision_of_day.why}
                </p>
              </div>

              <div className="today-move-windows">
                <div className="today-move-window-row">
                  <span className="life-card-bullet-label">Best window</span>
                  <span style={{ fontSize: "0.92rem" }}>
                    {formattedBriefing.timing.best_window}
                  </span>
                </div>
                <div className="today-move-window-row">
                  <span className="life-card-bullet-label">Avoid window</span>
                  <span className="muted" style={{ fontSize: "0.92rem" }}>
                    {formattedBriefing.timing.avoid_window}
                  </span>
                </div>
              </div>
            </div>

            <div className="today-micro-footer">
              <p className="life-card-bullet-label">
                Micro move · {formattedBriefing.micro_claim.horizon}
              </p>
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}>
                {formattedBriefing.micro_claim.statement}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                {formattedBriefing.micro_claim.track_prompt}
              </p>
            </div>
          </section>

          {/* Tier 4: Life in focus — 4-up compact grid */}
          <div className="stack" style={{ gap: "0.75rem" }}>
            <p className="section-label" style={{ margin: 0 }}>
              Life in focus
            </p>
            <div className="section-grid four-up">
              <LifeCard
                eyebrow="Work"
                Icon={BriefcaseIcon}
                headline={formattedBriefing.cards.career.headline}
                bullets={[
                  { label: "Best move", value: formattedBriefing.cards.career.best_move },
                  { label: "Careful with", value: formattedBriefing.cards.career.watch_out },
                ]}
              />
              <LifeCard
                eyebrow="Money"
                Icon={CoinsIcon}
                headline={formattedBriefing.cards.money.headline}
                extra={
                  <span className="risk-pill">
                    Risk · {formattedBriefing.cards.money.risk_level}
                  </span>
                }
                bullets={[
                  { label: "Lean toward", value: formattedBriefing.cards.money.lean_toward },
                  { label: "Avoid", value: formattedBriefing.cards.money.avoid },
                ]}
              />
              <LifeCard
                eyebrow="Relationships"
                Icon={UsersIcon}
                headline={formattedBriefing.cards.relationships.headline}
                bullets={[
                  { label: "Best move", value: formattedBriefing.cards.relationships.best_action },
                  { label: "Avoid", value: formattedBriefing.cards.relationships.avoid },
                ]}
              />
              <LifeCard
                eyebrow="Energy"
                Icon={BoltIcon}
                headline={formattedBriefing.cards.health.headline}
                bullets={[
                  { label: "Best use", value: formattedBriefing.cards.health.best_use },
                  { label: "Careful with", value: formattedBriefing.cards.health.avoid },
                ]}
              />
            </div>
          </div>

          {/* Tier 5: Upgrade nudge (free only, positioned above reflection so free users see it) */}
          {access.featureAccess.canViewFullBlueprint ? null : (
            <div className="card card-state card-state--locked stack">
              <p className="card-eyebrow">Go deeper</p>
              <h2 className="card-title">Sharpen this with your full Blueprint</h2>
              <p className="card-subtitle">
                Pro unlocks the deeper patterns behind today&rsquo;s read — so timing
                windows and domain guidance get measurably more specific to you.
              </p>
              <div>
                <UpgradeProButton
                  className="button"
                  feature="blueprint"
                  label="Start 7-day free trial"
                  upgradeSurface="today_blueprint_nudge"
                />
              </div>
            </div>
          )}

          {/* Tier 6: Reflection — lighter, standalone */}
          <section className="card card-muted stack">
            <p className="card-eyebrow">Reflection</p>
            <p className="section-heading-serif">
              {formattedBriefing.cards.personal_growth.headline}
            </p>
            <ul className="life-card-bullets">
              <li className="life-card-bullet">
                <span className="life-card-bullet-label">Focus</span>
                <span>{formattedBriefing.cards.personal_growth.focus}</span>
              </li>
              <li className="life-card-bullet">
                <span className="life-card-bullet-label">Good for</span>
                <span>{formattedBriefing.cards.personal_growth.good_for}</span>
              </li>
              <li className="life-card-bullet">
                <span className="life-card-bullet-label">Not ideal for</span>
                <span>{formattedBriefing.cards.personal_growth.not_ideal_for}</span>
              </li>
            </ul>
          </section>

          <BriefingFeedbackForm
            briefingId={formattedBriefing.id}
            existingFeedback={latestFeedback}
          />
        </div>
      )}
    </div>
  );
}
