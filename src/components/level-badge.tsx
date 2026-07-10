import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_STAFF_LEVEL, labelForLevel, type StaffLevel } from '@/data/staff';

/**
 * Member-level badge — the read-only tier marker shown next to a member's name
 * in the manage list, the 记账 row, and the member detail header (spec #03).
 *
 * Rendered only for tiers ABOVE the default 普站: a 普站 member shows nothing
 * (the default is not worth list noise), 金站 gets a prominent tag. The label
 * comes from the single `STAFF_LEVELS` registry via `labelForLevel`, so this
 * component never hardcodes 「普站/金站」 — rebranding or adding a tier is a
 * registry change, not an edit here.
 */
export function LevelBadge({ level }: { level: StaffLevel }) {
  const theme = useTheme();
  if (level === DEFAULT_STAFF_LEVEL) return null;
  return (
    <Text testID="level-badge" style={[styles.badge, { color: theme.accent, borderColor: theme.accent }]}>
      {labelForLevel(level)}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: { fontSize: 12, fontWeight: '600', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
});
