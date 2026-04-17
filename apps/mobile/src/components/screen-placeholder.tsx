import { PropsWithChildren } from "react";
import { SafeAreaView, Text, View } from "react-native";

import { appUi } from "@/theme/app-ui";
import { brandColors, brandSpacing } from "@/theme/brand";

type ScreenPlaceholderProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function ScreenPlaceholder({
  title,
  description,
  children,
}: ScreenPlaceholderProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: brandColors.background }}>
      <View style={{ flex: 1, padding: 24, gap: brandSpacing.section }}>
        <View style={[appUi.heroCard, { marginTop: 8 }]}>
          <Text style={appUi.pageEyebrow}>Wuwu Advisor</Text>
          <Text style={appUi.pageTitle}>
            {title}
          </Text>
          <Text style={appUi.pageSubtitle}>
            {description}
          </Text>
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}
