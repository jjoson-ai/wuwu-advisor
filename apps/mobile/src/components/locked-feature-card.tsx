import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { trackProductEvent } from "@/lib/product-events";
import { startProCheckout } from "@/lib/pro-checkout";
import { PlanSelector, type PlanOption } from "@/components/plan-selector";
import { appUi } from "@/theme/app-ui";
import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";

type LockedFeatureCardProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  statusLabel?: string;
  feature?: "today" | "forecast" | "blueprint" | "ask";
  upgradeSurface?: string;
  featured?: boolean;
  bullets?: ReadonlyArray<string>;
  plan?: "monthly" | "annual";
};

export function LockedFeatureCard({
  title,
  description,
  ctaLabel = "Start 7-day free trial",
  statusLabel = "Included in Pro",
  feature,
  upgradeSurface,
  featured = false,
  bullets,
  plan = "annual",
}: LockedFeatureCardProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>(plan);
  const isStaleState = statusLabel.toLowerCase().includes("refresh");

  useEffect(() => {
    if (feature == null || upgradeSurface == null) {
      return;
    }

    void trackProductEvent(
      {
        event_name: "paywall_shown",
        feature,
        plan_type: "pro",
        upgrade_surface: upgradeSurface,
      },
      {
        onceKey: `paywall:${feature}:${upgradeSurface}`,
      },
    );
  }, [feature, upgradeSurface]);

  return (
    <View
      style={[
        styles.card,
        isStaleState ? styles.staleCard : styles.lockedCard,
        featured ? styles.featuredCard : null,
      ]}
    >
      <Text style={styles.lockedLabel}>{statusLabel}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {bullets && bullets.length > 0 ? (
        <View style={styles.bulletList}>
          {bullets.map((bullet) => {
            const separatorIndex = bullet.indexOf(" — ");
            const head =
              separatorIndex === -1 ? bullet : bullet.slice(0, separatorIndex);
            const tail =
              separatorIndex === -1 ? "" : bullet.slice(separatorIndex);

            return (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  <Text style={styles.bulletHead}>{head}</Text>
                  {tail}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <PlanSelector value={selectedPlan} onChange={setSelectedPlan} />
      <Pressable
        onPress={() => {
          if (feature == null || upgradeSurface == null) {
            return;
          }

          void (async () => {
            await trackProductEvent({
              event_name: "upgrade_clicked",
              feature,
              plan_type: "pro",
              upgrade_surface: upgradeSurface,
            });

            await startProCheckout({
              feature,
              upgradeSurface,
              plan: selectedPlan,
            });
          })();
        }}
        style={styles.ctaButton}
      >
        <Text style={styles.ctaButtonText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...appUi.card,
    gap: 14,
  },
  lockedCard: {
    ...appUi.lockedCard,
  },
  staleCard: {
    ...appUi.staleCard,
  },
  featuredCard: {
    borderWidth: 1.5,
    borderColor: brandColors.accent,
  },
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  bulletDot: {
    color: brandColors.accent,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  bulletText: {
    ...appUi.supportingText,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  bulletHead: {
    fontWeight: "600",
    color: brandColors.text,
  },
  title: {
    ...appUi.sectionTitle,
  },
  lockedLabel: {
    ...appUi.sectionLabel,
    color: brandColors.accent,
  },
  description: {
    ...appUi.supportingText,
    fontSize: 15,
    lineHeight: 23,
  },
  ctaButton: {
    ...appUi.secondaryButton,
    marginTop: 4,
  },
  ctaButtonText: {
    ...appUi.secondaryButtonText,
  },
});
