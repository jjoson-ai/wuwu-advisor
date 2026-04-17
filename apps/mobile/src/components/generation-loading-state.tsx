import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { appUi } from "@/theme/app-ui";
import { brandColors, brandRadii } from "@/theme/brand";

type GenerationLoadingStateProps = {
  stages: string[];
  compact?: boolean;
  style?: ViewStyle;
};

export function GenerationLoadingState({
  stages,
  compact = false,
  style,
}: GenerationLoadingStateProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const translateX = useRef(new Animated.Value(-1)).current;
  const activeStages = useMemo(
    () => (stages.length > 0 ? stages : ["Working on it"]),
    [stages],
  );

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );

    translateX.setValue(-1);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [translateX]);

  useEffect(() => {
    if (activeStages.length <= 1) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setStageIndex((current) => (current + 1) % activeStages.length);
    }, 2200);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeStages]);

  useEffect(() => {
    setStageIndex(0);
  }, [activeStages]);

  const fillTransform = {
    transform: [
      {
        translateX: translateX.interpolate({
          inputRange: [-1, 1],
          outputRange: [-140, 140],
        }),
      },
    ],
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={[styles.container, compact ? styles.compactContainer : null, style]}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>In progress</Text>
        <Text style={styles.stage}>{activeStages[stageIndex]}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillTransform]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  compactContainer: {
    gap: 8,
  },
  copy: {
    gap: 4,
  },
  label: {
    ...appUi.sectionLabel,
    color: brandColors.textSubtle,
    fontSize: 12,
  },
  stage: {
    ...appUi.supportingText,
    color: brandColors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  track: {
    backgroundColor: brandColors.surfaceMuted,
    borderRadius: brandRadii.pill,
    height: 6,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    backgroundColor: brandColors.accent,
    borderRadius: brandRadii.pill,
    height: "100%",
    opacity: 0.9,
    width: 120,
  },
});
