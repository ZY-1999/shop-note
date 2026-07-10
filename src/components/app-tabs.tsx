import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { TABS, TAB_BAR_SHOW_LABEL } from '@/navigation/tab-config';

/**
 * The three business tabs (spec #04): 记账 (bookkeeping, default) / 汇总 (summary)
 * / 管理 (manage). Each is a directory with its own Stack layout, so a list screen
 * can push a detail/form screen and `back` returns (AC4).
 *
 * Tab identity (name / Chinese title / icon) comes from the single source of truth
 * in `tab-config.ts` (nav-tweak), so this bottom bar and each tab's top Stack
 * header (configured in its `_layout.tsx`) cannot drift apart.
 *
 * Bottom bar is icon-only (nav-tweak #1): `tabBarShowLabel: false` + one Ionicons
 * glyph per tab; the label text is hidden, but `title` still serves as the tab's
 * accessibility name. Each tab's own Stack owns the top header (`headerShown:
 * false` here), and that header shows the current screen's Chinese title
 * (nav-tweak #2).
 *
 * Uses the stable `expo-router` `Tabs` (not `unstable-native-tabs`): SDK57
 * `NativeTabs` could not be device-verified to host a per-tab Stack, and the spec
 * sanctions this stable fallback (per-tab Stack via nested layouts is guaranteed).
 * AC1 (three switchable tabs, 记账 default) is confirmed on device.
 */
export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // each tab's own Stack owns its header
        tabBarShowLabel: TAB_BAR_SHOW_LABEL, // icon-only bar (nav-tweak #1)
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Ionicons name={tab.icon} size={24} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
