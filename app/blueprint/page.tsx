import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getBaziGateContext } from "@/domain/bazi/context.server";
import { ExplainedValueRow } from "@/components/explained-value-row";
import { CompassIcon } from "@/components/icons";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import {
  formatBlueprintSummaryForDisplay,
  splitBlueprintNarrativeIntoParagraphs,
} from "@/domain/blueprint/blueprint-display";
import {
  formatBaziValue,
  formatChineseSignatureValue,
  formatGuidingNumberValue,
} from "@/domain/blueprint/blueprint-symbols";
import { GenerateBlueprintButton } from "@/components/generate-blueprint-button";
import { formatBlueprintForPage } from "@/domain/blueprint/blueprint.formatter";
import { getBlueprintForUser } from "@/domain/blueprint/blueprint.service";
import { highlightAstroTerms } from "@/domain/display/astro-terms";
import { createNumerologyMentionFormatter } from "@/domain/display/numerology-mentions";
import { buildHumanDesignContext } from "@/domain/human_design/context";
import {
  getOnboardingRecord,
  isOnboardingComplete,
} from "@/domain/profile/profile.service";
import { getCurrentUser } from "@/lib/auth";
import {
  getServerAccessState,
  isDebugAccessOverrideEnabled,
} from "@/lib/debug-access";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";

export const metadata: Metadata = {
  title: "Your Birth Blueprint",
};

function hasRealSignatureValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "unavailable" && normalized !== "unknown";
}

const FIXED_BLUEPRINT_SECTION_TITLES = {
  core_pattern: "How you come across",
  communication_and_connection: "How you connect",
  work_and_money_style: "How you work",
  energy_and_stress: "How you handle pressure",
  growth_edge: "Your growth edge",
} as const;

function renderNarrativeParagraphs(
  text: string,
  formatText: (text: string) => string,
) {
  return splitBlueprintNarrativeIntoParagraphs(formatText(text)).map((paragraph, index) => {
    const key = `${paragraph.slice(0, 24)}-${index}`;
    return (
      <p key={key} style={{ margin: 0 }}>
        {highlightAstroTerms(paragraph, key)}
      </p>
    );
  });
}

type BlueprintNarrativeCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  formatText: (text: string) => string;
  featured?: boolean;
};

function BlueprintNarrativeCard({
  eyebrow,
  title,
  description,
  formatText,
  featured = false,
}: BlueprintNarrativeCardProps) {
  return (
    <div className={`card stack ${featured ? "card-featured card-hero" : "card-feature card-muted"}`}>
      <p className="card-eyebrow">{eyebrow}</p>
      <h2 className={featured ? "card-title" : "section-heading-serif"}>{title}</h2>
      <div className="text-block">{renderNarrativeParagraphs(description, formatText)}</div>
    </div>
  );
}

export default async function BlueprintPage() {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const record = await getOnboardingRecord(user.id);
  const access = await getServerAccessState(user);

  if (isOnboardingComplete(record) === false) {
    redirect("/onboarding");
  }

  const blueprintRow = await getBlueprintForUser(user.id);
  const blueprint =
    blueprintRow === null ? null : formatBlueprintForPage(blueprintRow);
  const baziContext = getBaziGateContext({
    birth_date: record.birthData?.birth_date,
    birth_time: record.birthData?.birth_time,
    birth_time_confidence: record.birthData?.birth_time_confidence,
    birth_city: record.birthData?.birth_city,
    birth_latitude: record.birthData?.birth_latitude ?? null,
    birth_longitude: record.birthData?.birth_longitude ?? null,
    bazi_calculation_marker: record.birthData?.bazi_calculation_marker ?? null,
  });
  const humanDesignContext = buildHumanDesignContext({
    birth_date: record.birthData?.birth_date,
    birth_time: record.birthData?.birth_time,
    birth_time_confidence: record.birthData?.birth_time_confidence,
    birth_latitude: record.birthData?.birth_latitude ?? null,
    birth_longitude: record.birthData?.birth_longitude ?? null,
    birth_timezone: record.birthData?.birth_timezone ?? null,
  });
  const hasHumanDesignSignature =
    blueprint !== null &&
    hasRealSignatureValue(blueprint.human_design_signature.type) &&
    hasRealSignatureValue(blueprint.human_design_signature.authority) &&
    hasRealSignatureValue(blueprint.human_design_signature.profile);
  const hasBaziSignature =
    blueprint !== null &&
    hasRealSignatureValue(blueprint.bazi_signature.day_master) &&
    hasRealSignatureValue(blueprint.bazi_signature.year_pillar) &&
    hasRealSignatureValue(blueprint.bazi_signature.month_pillar) &&
    hasRealSignatureValue(blueprint.bazi_signature.day_pillar) &&
    hasRealSignatureValue(blueprint.bazi_signature.hour_pillar);
  const baziDisplayMessage =
    baziContext.status === "ready_for_calculation"
      ? "BaZi support is available for this data, but this blueprint does not have a reliable Four Pillars result yet. Regenerate to try again."
      : baziContext.gating_message;
  const debugBaziFailure =
    isDebugAccessOverrideEnabled() &&
    blueprint !== null &&
    hasBaziSignature === false &&
    blueprint.bazi_debug !== null &&
    blueprint.bazi_debug.limitations.length > 0
      ? blueprint.bazi_debug
      : null;
  const blueprintNeedsRegeneration =
    blueprint !== null &&
    access.featureAccess.canViewFullBlueprint &&
    isArtifactStaleForCurrentAccess(
      access.accessLevel,
      blueprint.generation_access_level,
    );
  const canViewFullBlueprint =
    access.featureAccess.canViewFullBlueprint && blueprintNeedsRegeneration === false;
  const overviewSections =
    blueprint === null ? [] : formatBlueprintSummaryForDisplay(blueprint.summary);
  const formatNumerologyMention = createNumerologyMentionFormatter();

  const lockedBullets = [
    `${FIXED_BLUEPRINT_SECTION_TITLES.work_and_money_style} — the pattern driving your work, motivation, and money decisions`,
    `${FIXED_BLUEPRINT_SECTION_TITLES.energy_and_stress} — how you actually decide under pressure, and what throws off your timing`,
    `${FIXED_BLUEPRINT_SECTION_TITLES.growth_edge} — the growth pattern that makes your choices steadier and sharper over time`,
    "BaZi signature — your Four Pillars: day master and year/month/day/hour pillars",
    "Human Design signature — your type, authority, and profile for decision style",
  ];

  return (
    <div className="stack">
      {/* Hero */}
      <section className="card page-hero">
        <div className="page-hero-grid">
          <div className="page-hero-kicker-row">
            <span className="page-hero-icon" aria-hidden>
              <CompassIcon size={22} />
            </span>
            <p className="page-kicker">Profile reference</p>
          </div>
          <h1 className="page-title">Your Birth Blueprint</h1>
          <p className="page-subtitle">
            A stable reference for how you tend to think, connect, work, and
            handle pressure.
          </p>
        </div>

        <div className="page-actions">
          <GenerateBlueprintButton
            label={
              blueprint === null ? "Generate My Blueprint" : "Regenerate Blueprint"
            }
          />
        </div>

        {blueprint === null ? (
          <div className="card card-muted stack empty-state">
            <p className="card-eyebrow">Built once, used everywhere</p>
            <h2 className="card-title">Generate your Birth Blueprint</h2>
            <p className="card-subtitle">
              A stable profile across three systems — Western chart, numerology,
              and Chinese zodiac. Everything else in the app reads from this.
            </p>
            <ul className="empty-state-list">
              <li>
                <span className="empty-state-bullet">
                  <CompassIcon size={16} />
                </span>
                How you come across and how you decide
              </li>
              <li>
                <span className="empty-state-bullet">
                  <CompassIcon size={16} />
                </span>
                Guiding numbers: Life Path, Birthday, Attitude, Name
              </li>
              <li>
                <span className="empty-state-bullet">
                  <CompassIcon size={16} />
                </span>
                Chinese signature: animal, element, polarity
              </li>
            </ul>
          </div>
        ) : (
          <div className="page-meta">
            <span className="meta-pill">
              Updated {new Date(blueprint.updated_at).toLocaleString()}
            </span>
            <span className="meta-pill">
              {canViewFullBlueprint ? "Pro" : "Free"} depth
            </span>
          </div>
        )}
      </section>

      {blueprint === null ? null : (
        <div className="stack">
          {blueprintNeedsRegeneration ? (
            <div className="card card-state card-state--stale stack">
              <p className="card-eyebrow">Needs refresh</p>
              <h2 className="card-title">Refresh for your current tier</h2>
              <p className="card-subtitle">
                This Blueprint was generated with free-tier context. Regenerate it
                to load the richer profile depth for your current tier.
              </p>
            </div>
          ) : null}

          {/* Tier 1: Overview — the main read */}
          <section className="card card-featured card-hero stack">
            <p className="card-eyebrow">Core reading</p>
            <div className="surface-cluster">
              {overviewSections.map((section) => (
                <div
                  key={`${section.title}-${section.body.slice(0, 24)}`}
                  className={section.title === "Overview" ? "summary-lead" : "summary-cell"}
                >
                  {section.title === "Overview" ? null : (
                    <p className="section-label">{section.title}</p>
                  )}
                  <div className="text-block">
                    {renderNarrativeParagraphs(section.body, formatNumerologyMention)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tier 2: Core pattern narrative */}
          <BlueprintNarrativeCard
            eyebrow="Core pattern"
            featured
            title={FIXED_BLUEPRINT_SECTION_TITLES.core_pattern}
            description={blueprint.core_pattern.description}
            formatText={formatNumerologyMention}
          />

          {/* Tier 3: Supporting narratives */}
          {canViewFullBlueprint ? (
            <div className="section-grid two-up">
              <BlueprintNarrativeCard
                eyebrow="Communication"
                title={FIXED_BLUEPRINT_SECTION_TITLES.communication_and_connection}
                description={blueprint.communication_and_connection.description}
                formatText={formatNumerologyMention}
              />
              <BlueprintNarrativeCard
                eyebrow="Work and money"
                title={FIXED_BLUEPRINT_SECTION_TITLES.work_and_money_style}
                description={blueprint.work_and_money_style.description}
                formatText={formatNumerologyMention}
              />
              <BlueprintNarrativeCard
                eyebrow="Pressure"
                title={FIXED_BLUEPRINT_SECTION_TITLES.energy_and_stress}
                description={blueprint.energy_and_stress.description}
                formatText={formatNumerologyMention}
              />
              <BlueprintNarrativeCard
                eyebrow="Growth"
                title={FIXED_BLUEPRINT_SECTION_TITLES.growth_edge}
                description={blueprint.growth_edge.description}
                formatText={formatNumerologyMention}
              />
            </div>
          ) : (
            <>
              {/* Free: show one narrative, then consolidated paywall */}
              <BlueprintNarrativeCard
                eyebrow="Communication"
                title={FIXED_BLUEPRINT_SECTION_TITLES.communication_and_connection}
                description={blueprint.communication_and_connection.description}
                formatText={formatNumerologyMention}
              />

              {blueprintNeedsRegeneration ? (
                <LockedFeatureCard
                  featured
                  statusLabel="Needs refresh"
                  title="Load your full Blueprint"
                  description="This Blueprint was generated at the free tier. Regenerate it to load the fuller profile depth now included in your plan."
                  ctaLabel="Regenerate Blueprint"
                  bullets={lockedBullets}
                />
              ) : (
                // UX audit C-02 (2026-04-26): value-led hierarchy.
                <LockedFeatureCard
                  featured
                  statusLabel="Pro Blueprint"
                  title="See the full pattern, the way Wuwu reads it."
                  description="Every Pro generation pulls in your deeper Blueprint signature, so Today, Forecast, and Decisions get more personal — less generic, more about your shape."
                  ctaLabel="Start 7-day free trial"
                  feature="blueprint"
                  upgradeSurface="blueprint_consolidated_paywall"
                  bullets={lockedBullets}
                  planMeta="7-day free trial · then $89.99/yr or $14.99/mo · cancel anytime"
                />
              )}
            </>
          )}

          {/* Tier 4: Data reference — signatures */}
          <div className="stack" style={{ gap: "0.75rem" }}>
            <p className="section-label" style={{ margin: 0 }}>
              Your signatures
            </p>
            <div className="section-grid two-up">
              <div className="card card-feature stack">
                <p className="card-eyebrow">Numerology</p>
                <h2 className="section-heading-serif">Guiding numbers</h2>
                <div className="value-list">
                  <ExplainedValueRow
                    label="Life path"
                    value={
                      formatGuidingNumberValue(
                        "life_path",
                        blueprint.guiding_numbers.life_path,
                      ).value
                    }
                    explanation={
                      formatGuidingNumberValue(
                        "life_path",
                        blueprint.guiding_numbers.life_path,
                      ).explanation
                    }
                  />
                  <ExplainedValueRow
                    label="Birthday"
                    value={
                      formatGuidingNumberValue(
                        "birthday",
                        blueprint.guiding_numbers.birthday,
                      ).value
                    }
                    explanation={
                      formatGuidingNumberValue(
                        "birthday",
                        blueprint.guiding_numbers.birthday,
                      ).explanation
                    }
                  />
                  <ExplainedValueRow
                    label="Attitude"
                    value={
                      formatGuidingNumberValue(
                        "attitude",
                        blueprint.guiding_numbers.attitude,
                      ).value
                    }
                    explanation={
                      formatGuidingNumberValue(
                        "attitude",
                        blueprint.guiding_numbers.attitude,
                      ).explanation
                    }
                  />
                  <ExplainedValueRow
                    label="Name number"
                    value={
                      formatGuidingNumberValue(
                        "name_number",
                        blueprint.guiding_numbers.name_number,
                      ).value
                    }
                    explanation={
                      formatGuidingNumberValue(
                        "name_number",
                        blueprint.guiding_numbers.name_number,
                      ).explanation
                    }
                  />
                </div>
              </div>

              <div className="card card-feature stack">
                <p className="card-eyebrow">Chinese signature</p>
                <h2 className="section-heading-serif">Chinese signature</h2>
                <div className="value-list">
                  <ExplainedValueRow
                    label="Animal"
                    value={
                      formatChineseSignatureValue(
                        "animal",
                        blueprint.chinese_signature.animal,
                      ).value
                    }
                    explanation={
                      formatChineseSignatureValue(
                        "animal",
                        blueprint.chinese_signature.animal,
                      ).explanation
                    }
                  />
                  <ExplainedValueRow
                    label="Element"
                    value={
                      formatChineseSignatureValue(
                        "element",
                        blueprint.chinese_signature.element,
                      ).value
                    }
                    explanation={
                      formatChineseSignatureValue(
                        "element",
                        blueprint.chinese_signature.element,
                      ).explanation
                    }
                  />
                  <ExplainedValueRow
                    label="Polarity"
                    value={
                      formatChineseSignatureValue(
                        "polarity",
                        blueprint.chinese_signature.polarity,
                      ).value
                    }
                    explanation={
                      formatChineseSignatureValue(
                        "polarity",
                        blueprint.chinese_signature.polarity,
                      ).explanation
                    }
                  />
                </div>
              </div>

              {/* BaZi + Human Design only for pro/internal */}
              {canViewFullBlueprint ? (
                <>
                  {hasBaziSignature ? (
                    <div className="card card-feature stack">
                      <p className="card-eyebrow">Four Pillars</p>
                      <h2 className="section-heading-serif">BaZi signature</h2>
                      <div className="value-list">
                        <ExplainedValueRow
                          label="Day master"
                          value={
                            formatBaziValue(
                              "day_master",
                              blueprint.bazi_signature.day_master,
                            ).value
                          }
                          explanation={
                            formatBaziValue(
                              "day_master",
                              blueprint.bazi_signature.day_master,
                            ).explanation
                          }
                        />
                        <ExplainedValueRow
                          label="Year pillar"
                          value={
                            formatBaziValue(
                              "year_pillar",
                              blueprint.bazi_signature.year_pillar,
                            ).value
                          }
                          explanation={
                            formatBaziValue(
                              "year_pillar",
                              blueprint.bazi_signature.year_pillar,
                            ).explanation
                          }
                        />
                        <ExplainedValueRow
                          label="Month pillar"
                          value={
                            formatBaziValue(
                              "month_pillar",
                              blueprint.bazi_signature.month_pillar,
                            ).value
                          }
                          explanation={
                            formatBaziValue(
                              "month_pillar",
                              blueprint.bazi_signature.month_pillar,
                            ).explanation
                          }
                        />
                        <ExplainedValueRow
                          label="Day pillar"
                          value={
                            formatBaziValue(
                              "day_pillar",
                              blueprint.bazi_signature.day_pillar,
                            ).value
                          }
                          explanation={
                            formatBaziValue(
                              "day_pillar",
                              blueprint.bazi_signature.day_pillar,
                            ).explanation
                          }
                        />
                        <ExplainedValueRow
                          label="Hour pillar"
                          value={
                            formatBaziValue(
                              "hour_pillar",
                              blueprint.bazi_signature.hour_pillar,
                            ).value
                          }
                          explanation={
                            formatBaziValue(
                              "hour_pillar",
                              blueprint.bazi_signature.hour_pillar,
                            ).explanation
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="card card-feature stack">
                      <p className="card-eyebrow">Four Pillars</p>
                      <h2 className="section-heading-serif">BaZi / Four Pillars</h2>
                      <p className="card-subtitle">{baziDisplayMessage}</p>
                      {debugBaziFailure === null ? null : (
                        <div
                          className="stack"
                          style={{
                            gap: "0.35rem",
                            padding: "0.85rem",
                            borderRadius: "0.75rem",
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                          }}
                        >
                          <p
                            className="muted"
                            style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}
                          >
                            Debug: BaZi generation status {debugBaziFailure.status}
                          </p>
                          <p style={{ margin: 0 }}>{debugBaziFailure.limitations[0]}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {hasHumanDesignSignature ? (
                    <div className="card card-feature stack">
                      <p className="card-eyebrow">Human design</p>
                      <h2 className="section-heading-serif">Human Design signature</h2>
                      <div className="value-list">
                        <ExplainedValueRow
                          label="Type"
                          value={blueprint.human_design_signature.type}
                        />
                        <ExplainedValueRow
                          label="Authority"
                          value={blueprint.human_design_signature.authority}
                        />
                        <ExplainedValueRow
                          label="Profile"
                          value={blueprint.human_design_signature.profile}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="card card-feature stack">
                      <p className="card-eyebrow">Human design</p>
                      <h2 className="section-heading-serif">Human Design</h2>
                      <p className="card-subtitle">
                        {humanDesignContext.status === "needs_exact_birth_time"
                          ? "Human Design needs exact birth time for a reliable chart."
                          : humanDesignContext.status === "integration_unavailable"
                            ? "Human Design support is coming soon. Your birth data is sufficient for a reliable chart once the calculation engine is added."
                            : humanDesignContext.gating_message}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
