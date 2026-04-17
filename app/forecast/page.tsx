import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GenerateForecastButton } from "@/components/generate-forecast-button";
import { TrendingIcon } from "@/components/icons";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { highlightAstroTerms } from "@/domain/display/astro-terms";
import { createNumerologyMentionFormatter } from "@/domain/display/numerology-mentions";
import {
  formatNarrativeSectionsForDisplay,
  splitDisplayParagraphs,
} from "@/domain/display/narrative-display";
import { formatForecastForPage } from "@/domain/forecast/forecast.formatter";
import { getForecastForUser } from "@/domain/forecast/forecast.service";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser } from "@/lib/auth";
import { getServerAccessState } from "@/lib/debug-access";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";

const FIXED_FORECAST_SECTION_TITLES = {
  current_phase: "Current phase",
  career_and_money: "Career and money",
  relationships: "Relationships",
  energy_and_pacing: "Energy and pacing",
  best_use_of_this_period: "Best use of this period",
  what_to_avoid: "What to avoid",
} as const;

export const metadata: Metadata = {
  title: "Forecast",
};

const FORECAST_SUMMARY_TITLES = [
  "What’s unfolding this month",
  "Current phase",
  "What is gaining momentum",
  "What to build steadily",
  "What to avoid forcing",
  "Likely turning point",
] as const;

const FORECAST_LOCKED_BULLETS = [
  `${FIXED_FORECAST_SECTION_TITLES.career_and_money} — where work and money deserve steady effort, and where patience pays`,
  `${FIXED_FORECAST_SECTION_TITLES.relationships} — what this period is asking of your relationships and when timing matters`,
  `${FIXED_FORECAST_SECTION_TITLES.energy_and_pacing} — how to pace this period well without forcing the wrong rhythm`,
  `${FIXED_FORECAST_SECTION_TITLES.best_use_of_this_period} — where momentum belongs this month`,
  `${FIXED_FORECAST_SECTION_TITLES.what_to_avoid} — what to stop pushing on for now`,
];

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

type ForecastDetailCardProps = {
  title: string;
  headline: string;
  description: string;
  formatText: (text: string) => string;
  featured?: boolean;
  eyebrow?: string;
  "data-testid"?: string;
};

function ForecastDetailCard({
  title,
  headline,
  description,
  formatText,
  featured = false,
  eyebrow,
  "data-testid": dataTestId,
}: ForecastDetailCardProps) {
  const HeadingTag = featured ? "h2" : "h3";

  return (
    <div
      className={`card stack ${featured ? "card-featured card-hero" : "card-feature card-muted"}`}
      data-testid={dataTestId}
      style={{ gap: featured ? "1rem" : "0.8rem" }}
    >
      {eyebrow ? <p className="card-eyebrow">{eyebrow}</p> : null}
      <HeadingTag className={featured ? "card-title" : "section-heading"}>
        {title}
      </HeadingTag>
      <p className="card-subtitle">{headline}</p>
      <div className="text-block">
        {renderParagraphs(description, formatText)}
      </div>
    </div>
  );
}

export default async function ForecastPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const record = await getOnboardingRecord(user.id);
  const access = await getServerAccessState(user);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  const forecastRow = await getForecastForUser(user.id);
  const forecast =
    forecastRow === null ? null : formatForecastForPage(forecastRow);
  const forecastNeedsRegeneration =
    forecast !== null &&
    access.featureAccess.canViewFullForecast &&
    isArtifactStaleForCurrentAccess(
      access.accessLevel,
      forecast.generation_access_level,
    );
  const canViewFullForecast =
    access.featureAccess.canViewFullForecast && forecastNeedsRegeneration === false;
  const formatNumerologyMention = createNumerologyMentionFormatter();
  const summarySections =
    forecast === null
      ? []
      : formatNarrativeSectionsForDisplay({
          text: formatNumerologyMention(forecast.summary),
          titles: FORECAST_SUMMARY_TITLES,
        });
  const [summaryLead, ...summarySupport] = summarySections;

  return (
    <div className="stack">
      <section className="card page-hero">
        <div className="page-hero-grid">
          <div className="page-hero-kicker-row">
            <span className="page-hero-icon" aria-hidden>
              <TrendingIcon size={22} />
            </span>
            <p className="page-kicker">30-Day Outlook</p>
          </div>
          <h1 className="page-title">Forecast</h1>
          <p className="page-subtitle">
            A medium-horizon read on what is taking shape, where momentum belongs,
            and what is not worth forcing this month.
          </p>
        </div>

        <div className="page-actions">
          <GenerateForecastButton
            label={forecast === null ? "Generate My Forecast" : "Regenerate Forecast"}
          />
        </div>

        {forecast === null ? (
          <div className="card card-muted stack empty-state">
            <p className="card-eyebrow">30-day planning brief</p>
            <h2 className="card-title">Generate your Forecast</h2>
            <p className="card-subtitle">
              A structured read on the month ahead — where momentum belongs,
              what&rsquo;s worth building steadily, and what to not force.
            </p>
            <ul className="empty-state-list">
              <li>
                <span className="empty-state-bullet">
                  <TrendingIcon size={16} />
                </span>
                The current phase and what it&rsquo;s asking of you
              </li>
              <li>
                <span className="empty-state-bullet">
                  <TrendingIcon size={16} />
                </span>
                Career, money, relationships, and pacing
              </li>
              <li>
                <span className="empty-state-bullet">
                  <TrendingIcon size={16} />
                </span>
                Best use of the month and what to avoid
              </li>
            </ul>
          </div>
        ) : (
          <div className="page-meta">
            <span className="meta-pill">
              Updated {new Date(forecast.updated_at).toLocaleString()}
            </span>
            <span className="meta-pill">
              {canViewFullForecast ? "Pro" : "Free"} depth
            </span>
          </div>
        )}
      </section>

      {forecast === null ? null : (
        <div className="stack">
          {forecastNeedsRegeneration ? (
            <div className="card card-state card-state--stale stack" data-testid="forecast-stale-card">
              <p className="card-eyebrow">Needs refresh</p>
              <h2 className="card-title">Refresh for your current tier</h2>
              <p className="card-subtitle">
                This Forecast was generated with free-tier context. Regenerate it
                to load the fuller planning depth for your current tier.
              </p>
            </div>
          ) : null}

          <section className="card card-hero stack">
            <p className="card-eyebrow">Month thesis</p>
            <h2 className="card-title">What&apos;s unfolding this month</h2>
            <div className="surface-cluster">
              {summaryLead ? (
                <div className="summary-lead">
                  <p className="section-label">Core pattern</p>
                  <div className="text-block">
                    {renderParagraphs(summaryLead.body, formatNumerologyMention)}
                  </div>
                </div>
              ) : null}

              <div className="summary-grid">
                {summarySupport.map((section) => (
                  <div
                    key={`${section.title}-${section.body.slice(0, 24)}`}
                    className="summary-cell"
                  >
                    <p className="section-label">{section.title}</p>
                    <div className="text-block">
                      {renderParagraphs(section.body, formatNumerologyMention)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {canViewFullForecast ? (
            <div className="stack">
              <ForecastDetailCard
                title={FIXED_FORECAST_SECTION_TITLES.current_phase}
                headline={forecast.current_phase.headline}
                description={forecast.current_phase.description}
                eyebrow="Planning lens"
                data-testid="forecast-planning-lens"
                featured
                formatText={formatNumerologyMention}
              />

              <div className="section-grid two-up">
                <ForecastDetailCard
                  title={FIXED_FORECAST_SECTION_TITLES.career_and_money}
                  headline={forecast.career_and_money.headline}
                  description={forecast.career_and_money.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastDetailCard
                  title={FIXED_FORECAST_SECTION_TITLES.relationships}
                  headline={forecast.relationships.headline}
                  description={forecast.relationships.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastDetailCard
                  title={FIXED_FORECAST_SECTION_TITLES.energy_and_pacing}
                  headline={forecast.energy_and_pacing.headline}
                  description={forecast.energy_and_pacing.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastDetailCard
                  title={FIXED_FORECAST_SECTION_TITLES.best_use_of_this_period}
                  headline={forecast.best_use_of_this_period.headline}
                  description={forecast.best_use_of_this_period.description}
                  formatText={formatNumerologyMention}
                />
                <ForecastDetailCard
                  title={FIXED_FORECAST_SECTION_TITLES.what_to_avoid}
                  headline={forecast.what_to_avoid.headline}
                  description={forecast.what_to_avoid.description}
                  formatText={formatNumerologyMention}
                />
              </div>
            </div>
          ) : forecastNeedsRegeneration ? (
            <LockedFeatureCard
              data-testid="forecast-stale-paywall"
              featured
              ctaLabel="Regenerate Forecast"
              description="This Forecast was generated at the free tier. Regenerate it to load the fuller planning depth now included in your plan."
              statusLabel="Needs refresh"
              title="Refresh your full Forecast"
              bullets={FORECAST_LOCKED_BULLETS}
            />
          ) : (
            <LockedFeatureCard
              data-testid="forecast-upgrade-paywall"
              featured
              ctaLabel="Upgrade to Pro"
              description="Pro unlocks the deeper planning sections — so each month's guidance gets measurably more specific to where your effort belongs."
              statusLabel="Included in Pro"
              title="Unlock your full Forecast"
              feature="forecast"
              upgradeSurface="forecast_consolidated_paywall"
              bullets={FORECAST_LOCKED_BULLETS}
            />
          )}
        </div>
      )}
    </div>
  );
}
