import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchBlueprint,
  generateBlueprint,
  mobileBlueprintQueryKey,
} from "@/api/blueprint";
import { DebugAccessBanner } from "@/components/debug-access-banner";
import { GenerationLoadingState } from "@/components/generation-loading-state";
import { CompassIcon } from "@/components/icons";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { StructuredCopy } from "@/components/structured-copy";
import { useAuthGateState } from "@/hooks/use-auth-gate";
import { isArtifactStaleForCurrentAccess } from "@/lib/access";
import { createNumerologyMentionFormatter } from "@/lib/numerology-mentions";
import { appUi } from "@/theme/app-ui";
import type { FormattedBlueprint } from "@/types/api";
import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";
import { formatBlueprintSummaryForDisplay } from "./blueprint-display";
import {
  formatBaziValue,
  formatChineseSignatureValue,
  formatGuidingNumberValue,
} from "./blueprint-symbols";

const FIXED_BLUEPRINT_SECTION_TITLES = {
  core_pattern: "How you come across",
  communication_and_connection: "How you connect",
  work_and_money_style: "How you work",
  energy_and_stress: "How you handle pressure",
  growth_edge: "Your growth edge",
} as const;

const BLUEPRINT_LOCKED_BULLETS = [
  `${FIXED_BLUEPRINT_SECTION_TITLES.work_and_money_style} — the pattern driving your work, motivation, and money decisions`,
  `${FIXED_BLUEPRINT_SECTION_TITLES.energy_and_stress} — how you actually decide under pressure, and what throws off your timing`,
  `${FIXED_BLUEPRINT_SECTION_TITLES.growth_edge} — the growth pattern that makes your choices steadier and sharper over time`,
  "BaZi signature — your Four Pillars: day master and year/month/day/hour pillars",
  "Human Design signature — your type, authority, and profile for decision style",
] as const;

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function hasRealValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "unavailable" && normalized !== "unknown";
}

type SectionCardProps = {
  title: string;
  supporting?: string;
  description: string;
  formatText: (text: string) => string;
};

function SectionCard({
  title,
  supporting,
  description,
  formatText,
}: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {supporting ? <Text style={styles.supportingLabel}>{supporting}</Text> : null}
      <StructuredCopy text={description} textStyle={styles.bodyText} formatText={formatText} />
    </View>
  );
}

function OverviewCard({
  description,
  formatText,
}: {
  description: string;
  formatText: (text: string) => string;
}) {
  const sections = formatBlueprintSummaryForDisplay(description);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.narrativeSections}>
        {sections.map((section) => (
          <View
            key={`${section.title}-${section.body.slice(0, 24)}`}
            style={styles.narrativeSection}
          >
            {section.title === "Overview" ? null : (
              <Text style={styles.narrativeSectionTitle}>{section.title}</Text>
            )}
            <StructuredCopy text={section.body} textStyle={styles.bodyText} formatText={formatText} />
          </View>
        ))}
      </View>
    </View>
  );
}

function SignatureRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Text style={styles.bodyText}>
      <Text style={styles.inlineLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

function ExplainedSignatureRow({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.explainedRow}>
      <View style={styles.explainedRowHeader}>
        <View style={styles.explainedLabelGroup}>
          <Text style={styles.inlineLabel}>{label}</Text>
          {explanation ? (
            <Pressable
              accessibilityLabel={`${label} explanation`}
              accessibilityHint={explanation}
              accessibilityRole="button"
              onPress={() => {
                setIsOpen((current) => !current);
              }}
              style={styles.infoButton}
            >
              <Text style={styles.infoButtonText}>i</Text>
            </Pressable>
          ) : null}
          <Text style={styles.bodyText}>:</Text>
        </View>
        <Text style={styles.bodyText}>{value}</Text>
      </View>
      {isOpen && explanation ? (
        <Text style={styles.inlineExplanation}>{explanation}</Text>
      ) : null}
    </View>
  );
}

function renderHumanDesignStatus(blueprint: FormattedBlueprint) {
  const signature = blueprint.human_design_signature;
  const isAvailable =
    hasRealValue(signature.type) &&
    hasRealValue(signature.authority) &&
    hasRealValue(signature.profile);

  if (isAvailable) {
    return (
      <>
        <SignatureRow label="Type" value={signature.type} />
        <SignatureRow label="Authority" value={signature.authority} />
        <SignatureRow label="Profile" value={signature.profile} />
      </>
    );
  }

  return (
    <Text style={styles.supportingText}>
      Human Design support is coming soon. Your birth data can be used once the
      chart engine is added.
    </Text>
  );
}

export function BlueprintScreenContent() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { accessLevel, featureAccess, user } = useAuthGateState();
  const blueprintQuery = useQuery({
    queryKey: mobileBlueprintQueryKey(user?.id),
    queryFn: fetchBlueprint,
  });
  const generateMutation = useMutation({
    mutationFn: generateBlueprint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: mobileBlueprintQueryKey(user?.id),
      });
    },
  });

  const blueprint = blueprintQuery.data?.blueprint ?? null;
  const queryError =
    blueprintQuery.error instanceof Error ? blueprintQuery.error.message : null;
  const topStatus = useMemo(() => {
    if (generateMutation.error instanceof Error) {
      return generateMutation.error.message;
    }

    return null;
  }, [generateMutation.error]);

  const hasBaziSignature =
    blueprint !== null &&
    hasRealValue(blueprint.bazi_signature.day_master) &&
    hasRealValue(blueprint.bazi_signature.year_pillar) &&
    hasRealValue(blueprint.bazi_signature.month_pillar) &&
    hasRealValue(blueprint.bazi_signature.day_pillar) &&
    hasRealValue(blueprint.bazi_signature.hour_pillar);
  const blueprintNeedsRegeneration =
    blueprint !== null &&
    featureAccess.canViewFullBlueprint &&
    isArtifactStaleForCurrentAccess(
      accessLevel,
      blueprint.generation_access_level,
    );
  const canViewFullBlueprint =
    featureAccess.canViewFullBlueprint && blueprintNeedsRegeneration === false;
  const formatNumerologyMention = createNumerologyMentionFormatter();

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.heroCard}>
          <View style={appUi.pageHeroKickerRow}>
            <View style={appUi.pageHeroIcon}>
              <CompassIcon size={20} />
            </View>
            <Text style={styles.pageEyebrow}>Birth profile</Text>
          </View>
          <Text style={styles.pageTitle}>Your Birth Blueprint</Text>
          <Text style={styles.pageSubtitle}>
            A stable reference for how you think, connect, work, and handle
            pressure.
          </Text>
          <DebugAccessBanner accessLevel={accessLevel} />
          {blueprint ? (
            <Text style={styles.metaText}>
              Updated {formatTimestamp(blueprint.updated_at)}
            </Text>
          ) : null}
          <Pressable
            disabled={generateMutation.isPending}
            onPress={() => {
              generateMutation.mutate();
            }}
            style={[
              styles.primaryButton,
              generateMutation.isPending && styles.primaryButtonDisabled,
            ]}
          >
            {generateMutation.isPending ? (
              <Text style={styles.primaryButtonText}>Working...</Text>
            ) : (
              <Text style={styles.primaryButtonText}>
                {blueprint === null ? "Generate My Blueprint" : "Regenerate Blueprint"}
              </Text>
            )}
          </Pressable>
          {generateMutation.isPending || blueprintQuery.isRefetching ? (
            <GenerationLoadingState
              compact
              stages={["Reading your core pattern", "Building your blueprint"]}
            />
          ) : null}
          <Text style={styles.statusText}>{queryError ?? topStatus ?? " "}</Text>
        </View>

        {blueprintQuery.isPending && blueprint === null ? (
          <View style={styles.card}>
            <GenerationLoadingState
              stages={["Reading your core pattern", "Building your blueprint"]}
            />
          </View>
        ) : null}

        {blueprint === null && queryError ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Unable to load Blueprint</Text>
            <Text style={styles.supportingText}>{queryError}</Text>
          </View>
        ) : null}

        {blueprint === null && blueprintQuery.isPending === false && queryError === null ? (
          <View style={appUi.emptyStateCard}>
            <Text style={appUi.sectionLabel}>Built once, used everywhere</Text>
            <Text style={appUi.sectionTitle}>Generate your Birth Blueprint</Text>
            <Text style={appUi.supportingText}>
              A stable profile across three systems — Western chart, numerology,
              and Chinese zodiac. Everything else in the app reads from this.
            </Text>
            <View style={appUi.emptyStateList}>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <CompassIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  How you come across and how you decide
                </Text>
              </View>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <CompassIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  Guiding numbers: Life Path, Birthday, Attitude, Name
                </Text>
              </View>
              <View style={appUi.emptyStateRow}>
                <View style={appUi.emptyStateBullet}>
                  <CompassIcon size={16} />
                </View>
                <Text style={appUi.emptyStateBulletText}>
                  Chinese signature: animal, element, polarity
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {blueprint ? (
          <>
            {blueprintNeedsRegeneration ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Refresh for your current tier</Text>
                <Text style={styles.supportingText}>
                  This Blueprint was generated with free-tier context. Regenerate
                  it to load the richer profile depth for your current tier.
                </Text>
              </View>
            ) : null}

            <OverviewCard
              description={blueprint.summary}
              formatText={formatNumerologyMention}
            />

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Guiding numbers</Text>
              <ExplainedSignatureRow
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
              <ExplainedSignatureRow
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
              <ExplainedSignatureRow
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
              <ExplainedSignatureRow
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
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Chinese signature</Text>
              <ExplainedSignatureRow
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
              <ExplainedSignatureRow
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
              <ExplainedSignatureRow
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
            </View>

            {canViewFullBlueprint ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>BaZi signature</Text>
                {hasBaziSignature ? (
                  <>
                    <ExplainedSignatureRow
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
                    <ExplainedSignatureRow
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
                    <ExplainedSignatureRow
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
                    <ExplainedSignatureRow
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
                    <ExplainedSignatureRow
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
                  </>
                ) : (
                  <Text style={styles.supportingText}>
                    BaZi support is not available in this saved Blueprint yet.
                  </Text>
                )}
              </View>
            ) : null}

            {canViewFullBlueprint ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Human Design</Text>
                {renderHumanDesignStatus(blueprint)}
              </View>
            ) : null}

            <SectionCard
              title={FIXED_BLUEPRINT_SECTION_TITLES.core_pattern}
              description={blueprint.core_pattern.description}
              formatText={formatNumerologyMention}
            />
            <SectionCard
              title={FIXED_BLUEPRINT_SECTION_TITLES.communication_and_connection}
              description={blueprint.communication_and_connection.description}
              formatText={formatNumerologyMention}
            />
            {canViewFullBlueprint ? (
              <>
                <SectionCard
                  title={FIXED_BLUEPRINT_SECTION_TITLES.work_and_money_style}
                  description={blueprint.work_and_money_style.description}
                  formatText={formatNumerologyMention}
                />
                <SectionCard
                  title={FIXED_BLUEPRINT_SECTION_TITLES.energy_and_stress}
                  description={blueprint.energy_and_stress.description}
                  formatText={formatNumerologyMention}
                />
                <SectionCard
                  title={FIXED_BLUEPRINT_SECTION_TITLES.growth_edge}
                  description={blueprint.growth_edge.description}
                  formatText={formatNumerologyMention}
                />
              </>
            ) : blueprintNeedsRegeneration ? (
              <LockedFeatureCard
                bullets={BLUEPRINT_LOCKED_BULLETS}
                ctaLabel="Regenerate Blueprint"
                description="This Blueprint was generated at the free tier. Regenerate it to load the fuller profile depth now included in your plan."
                featured
                statusLabel="Needs refresh"
                title="Load your full Blueprint"
              />
            ) : (
              <LockedFeatureCard
                bullets={BLUEPRINT_LOCKED_BULLETS}
                description="Pro unlocks the deeper pattern sections and the full signature data for a sharper, more specific read of how you decide."
                feature="blueprint"
                featured
                title="Unlock your full Blueprint"
                upgradeSurface="blueprint_consolidated_paywall"
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.background,
  },
  content: {
    gap: brandSpacing.section,
    paddingHorizontal: brandSpacing.screen,
  },
  heroCard: {
    ...appUi.heroCard,
  },
  pageEyebrow: {
    ...appUi.pageEyebrow,
  },
  pageTitle: {
    ...appUi.pageTitle,
  },
  pageSubtitle: {
    ...appUi.pageSubtitle,
  },
  metaText: {
    ...appUi.metaText,
  },
  card: {
    ...appUi.card,
  },
  explainedRow: {
    gap: 6,
  },
  explainedRowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  explainedLabelGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6,
  },
  sectionTitle: {
    ...appUi.sectionTitle,
  },
  supportingLabel: {
    ...appUi.supportingLabel,
  },
  supportingText: {
    ...appUi.supportingText,
  },
  bodyText: {
    ...appUi.bodyText,
  },
  narrativeSections: {
    gap: 14,
  },
  narrativeSection: {
    gap: 6,
  },
  narrativeSectionTitle: {
    color: brandColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  inlineLabel: {
    color: brandColors.text,
    fontWeight: "700",
  },
  infoButton: {
    alignItems: "center",
    borderColor: brandColors.border,
    borderRadius: brandRadii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 6,
  },
  infoButtonText: {
    color: brandColors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  inlineExplanation: {
    color: brandColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    ...appUi.primaryButton,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    ...appUi.primaryButtonText,
  },
  statusText: {
    color: brandColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 20,
  },
});
