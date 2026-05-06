import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";

import {
  getDebugAccessLevelOverride,
  setDebugAccessLevelOverride,
  type DebugAccessLevel,
} from "@/lib/debug-access";
import { brandColors, brandRadii, brandSpacing } from "@/theme/brand";

const OPTIONS: Array<{ label: string; value: DebugAccessLevel | "auto" }> = [
  { label: "Auto", value: "auto" },
  { label: "Free", value: "free" },
  { label: "Pro", value: "pro" },
  { label: "Internal", value: "internal" },
];

type DebugAccessBannerProps = {
  accessLevel: string;
};

export function DebugAccessBanner({
  accessLevel,
}: DebugAccessBannerProps) {
  if (!__DEV__) return null;

  const queryClient = useQueryClient();
  const [selectedOverride, setSelectedOverride] = useState<
    DebugAccessLevel | "auto"
  >("auto");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getDebugAccessLevelOverride().then((value) => {
      if (isMounted) {
        setSelectedOverride(value ?? "auto");
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSelect(value: DebugAccessLevel | "auto") {
    setIsUpdating(true);

    try {
      await setDebugAccessLevelOverride(value === "auto" ? null : value);
      setSelectedOverride(value);
      await queryClient.invalidateQueries();
    } finally {
      setIsUpdating(false);
    }
  }

  const effectiveAccessLevel =
    selectedOverride === "auto" ? accessLevel : selectedOverride;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Debug tier: <Text style={styles.value}>{effectiveAccessLevel}</Text>
      </Text>
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const isSelected = selectedOverride === option.value;

          return (
            <Pressable
              key={option.value}
              disabled={isUpdating}
              onPress={() => {
                void handleSelect(option.value);
              }}
              style={[
                styles.button,
                isSelected && styles.buttonSelected,
              ]}
            >
              {isUpdating && isSelected ? (
                <ActivityIndicator color={brandColors.accent} size="small" />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    isSelected && styles.buttonTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={[styles.button, styles.crashButton]}
        disabled={!__DEV__ || isUpdating}
        onPress={() => {
          void Sentry.captureMessage("Test crash from debug banner");
          void Sentry.nativeCrash();
        }}
      >
        <Text style={[styles.buttonText, styles.crashButtonText]}>
          Test Crash
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brandColors.accentSoft,
    borderColor: brandColors.border,
    borderRadius: brandRadii.card,
    borderWidth: 1,
    gap: brandSpacing.section / 2,
    padding: brandSpacing.card,
  },
  label: {
    color: brandColors.textSubtle,
    fontSize: 13,
    fontWeight: "600",
  },
  value: {
    color: brandColors.text,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: brandSpacing.section / 3,
  },
  button: {
    alignItems: "center",
    backgroundColor: brandColors.surface,
    borderColor: brandColors.border,
    borderRadius: brandRadii.pill,
    borderWidth: 1,
    minWidth: 70,
    paddingHorizontal: brandSpacing.section,
    paddingVertical: 8,
  },
  buttonSelected: {
    backgroundColor: brandColors.accent,
    borderColor: brandColors.accent,
  },
  buttonText: {
    color: brandColors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  buttonTextSelected: {
    color: "#FFFFFF",
  },
  crashButton: {
    backgroundColor: brandColors.accent,
    borderColor: brandColors.accent,
    marginTop: brandSpacing.card / 2,
  },
  crashButtonText: {
    color: "#FFFFFF",
  },
});
