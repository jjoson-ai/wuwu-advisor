import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

import { brandColors } from "@/theme/brand";

const TAB_ICONS = {
  today: {
    active: "home",
    inactive: "home-outline",
  },
  blueprint: {
    active: "book",
    inactive: "book-outline",
  },
  forecast: {
    active: "calendar",
    inactive: "calendar-outline",
  },
  ask: {
    active: "chatbubble-ellipses",
    inactive: "chatbubble-ellipses-outline",
  },
  settings: {
    active: "settings",
    inactive: "settings-outline",
  },
} as const;

type TabName = keyof typeof TAB_ICONS;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const tabName = route.name as TabName;
        const icon = TAB_ICONS[tabName];

        return {
          headerShown: false,
          tabBarActiveTintColor: brandColors.accent,
          tabBarInactiveTintColor: brandColors.textSubtle,
          tabBarStyle: {
            backgroundColor: brandColors.surfaceRaised,
            borderTopColor: brandColors.border,
            borderTopWidth: 1,
            height: 84,
            paddingTop: 8,
            paddingBottom: 10,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 0.2,
          },
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              color={color}
              name={focused ? icon.active : icon.inactive}
              size={size}
            />
          ),
        };
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="blueprint" options={{ title: "Blueprint" }} />
      {/* UX audit F-10 (2026-04-26): label = timeframe, not "Forecast". */}
      <Tabs.Screen name="forecast" options={{ title: "10 days" }} />
      {/* UX audit F-10 (2026-04-26): label matches /decision route purpose. */}
      <Tabs.Screen name="ask" options={{ title: "Decisions" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
