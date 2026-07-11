import { StyleSheet, Text, View } from "react-native";

import { LevelBadge } from "@/components/level-badge";
import { MoneyText } from "@/components/money-text";
import { cents } from "@/data/primitives";
import { useMemberBalance, useStaffById } from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";

/**
 * The unified member-info header (topup-subpage spec #01) — a pure-display
 * component reused four places: the 充值 / 出库 form headers, the member-detail
 * header, and the 记账 list row. One prop (`staffId`) hides "staff query + tier
 * badge + derived balance + 欠款 marker" — a deep module.
 *
 * Renders exactly two rows, no border / no button / no callback:
 *  1. name + `<LevelBadge>` (普站 omits the badge; 金站 shows it)
 *  2. 「余额」label + `<MoneyText>` (negative → 欠款 in danger)
 *
 * Data comes from two independent top-level `useQuery` calls (`useStaffById` +
 * `useMemberBalance`) — rules-of-react clean under React Compiler. While the
 * staff query is pending the name shows 「加载中」 and the balance falls back to
 * ¥0.00 (same posture as staff-detail).
 */
export interface MemberInfoHeaderProps {
  staffId: string;
}

export function MemberInfoHeader({ staffId }: MemberInfoHeaderProps) {
  const theme = useTheme();
  const staff = useStaffById(staffId);
  const balance = useMemberBalance(staffId);

  const amount = balance.data?.amount ?? 0;

  return (
    <View testID="member-info-header" style={styles.root}>
      <View style={styles.row1}>
        <Text style={styles.name}>{staff.data?.name ?? "加载中"}</Text>
        {staff.data && <LevelBadge level={staff.data.level} />}
      </View>
      <View style={styles.row2}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>余额</Text>
        <MoneyText cents={cents(amount)} negativeLabel="欠款" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 2, marginBottom: 8 },
  row1: { flexDirection: "row", alignItems: "center", gap: 8 },
  row2: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 13 },
});
