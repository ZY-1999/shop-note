import { Tabs } from 'expo-router';

/**
 * The three business tabs (spec #04): 记账 (bookkeeping, default) / 汇总 (summary)
 * / 管理 (manage). Each is a directory with its own Stack layout, so a list screen
 * can push a detail/form screen and `back` returns (AC4).
 *
 * Uses the stable `expo-router` `Tabs` (not `unstable-native-tabs`): SDK57
 * `NativeTabs` could not be device-verified to host a per-tab Stack, and the spec
 * sanctions this stable fallback (per-tab Stack via nested layouts is guaranteed).
 * This also unifies native + web — the template's separate `app-tabs.web.tsx` is
 * removed (Tabs renders cross-platform). AC1 (three switchable tabs, 记账 default)
 * is confirmed on device.
 */
export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // each tab's own Stack owns its header
      }}>
      <Tabs.Screen name="bookkeeping" options={{ title: '记账' }} />
      <Tabs.Screen name="summary" options={{ title: '汇总' }} />
      <Tabs.Screen name="manage" options={{ title: '管理' }} />
    </Tabs>
  );
}
