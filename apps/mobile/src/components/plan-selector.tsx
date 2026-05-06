import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";

export type PlanOption = "monthly" | "annual";

type PlanSelectorProps = {
  value: PlanOption;
  onChange: (plan: PlanOption) => void;
};

export function PlanSelector({ value, onChange }: PlanSelectorProps) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onChange("monthly")}
        style={[styles.option, value === "monthly" && styles.optionSelected]}
      >
        <Text
          style={[styles.optionLabel, value === "monthly" && styles.optionLabelSelected]}
        >
          Monthly
        </Text>
        <Text style={[styles.optionPrice, value === "monthly" && styles.optionLabelSelected]}>
          $14.99/mo
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onChange("annual")}
        style={[styles.option, value === "annual" && styles.optionSelected]}
      >
        <View style={styles.optionHeader}>
          <Text
            style={[styles.optionLabel, value === "annual" && styles.optionLabelSelected]}
          >
            Annual
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Save 50%</Text>
          </View>
        </View>
        <Text style={[styles.optionPrice, value === "annual" && styles.optionLabelSelected]}>
          $7.50/mo
        </Text>
        <Text style={[styles.optionSubtext, value === "annual" && styles.optionLabelSelected]}>
          billed annually
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: brandSpacing.card / 2,
    padding: 4,
    backgroundColor: brandColors.surface,
    borderRadius: brandRadii.pill,
    borderWidth: 1,
    borderColor: brandColors.border,
  },
  option: {
    flex: 1,
    alignItems: "center",
    paddingVertical: brandSpacing.card / 2,
    paddingHorizontal: brandSpacing.card,
    borderRadius: brandRadii.pill - 4,
    gap: 2,
  },
  optionSelected: {
    backgroundColor: brandColors.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: brandColors.textSubtle,
  },
  optionLabelSelected: {
    color: brandColors.text,
    fontWeight: "600",
  },
  optionPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: brandColors.textSubtle,
  },
  optionSubtext: {
    fontSize: 10,
    color: brandColors.textSubtle,
    marginTop: 1,
  },
  badge: {
    backgroundColor: brandColors.accent,
    borderRadius: brandRadii.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: "0.02em",
  },
});
