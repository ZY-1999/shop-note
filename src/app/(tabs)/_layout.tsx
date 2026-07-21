import { Tabs } from "expo-router";

import { TAB_BAR_SHOW_LABEL, TABS } from "@/navigation/tab-config";
import { Ionicons } from "@expo/vector-icons";

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // each tab's own Stack owns its header
        tabBarShowLabel: TAB_BAR_SHOW_LABEL, // icon-only bar (nav-tweak #1)
      }}
    >
      <Tabs.Screen key={"index"} name={"index"} redirect />
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => (
              <Ionicons name={tab.icon} size={24} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
