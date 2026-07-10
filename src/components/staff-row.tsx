import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { useTheme } from '@/hooks/use-theme';
import { cents } from '@/data/primitives';
import type { StaffSummary } from '@/data/inventory';
import type { Staff } from '@/data/staff';

/**
 * One staff row in the 记账 list. Shows the staff's per-staff holding summary as
 * a single merged line `库存：{qty}件/{variety}种` + the amount via `MoneyText`
 * (spec #02 / page-refactor — denser than the old two-line layout); a 欠货 badge
 * + danger-tinted row when any product balance is negative; and 入库 / 出单
 * affordances that carry the staff id to the form. The row body taps through to
 * staff detail.
 *
 * `summary` may be `undefined` — a staff with no movements yet renders zeros
 * rather than a sentinel. Such staff now surface in the default list too (spec
 * #02 AC3, revised 2026-07-10); this row is purely presentational, so the list
 * composition lives in the screen, not here.
 *
 * Navigation is delegated (`onIn` / `onOut` / `onOpen`) so the row is a pure,
 * RNTL-testable presentational piece; the screen wires these to the router.
 */
export interface StaffRowProps {
  staff: Staff;
  summary?: StaffSummary;
  onIn: (staffId: string) => void;
  onOut: (staffId: string) => void;
  onOpen: (staffId: string) => void;
}

export function StaffRow({ staff, summary, onIn, onOut, onOpen }: StaffRowProps) {
  const theme = useTheme();
  const negative = summary?.has_negative === true;
  const qty = summary?.total_qty ?? 0;
  const variety = summary?.variety ?? 0;
  const amount = summary?.total_amount ?? 0;
  return (
    <Pressable
      testID={`row-${staff.id}`}
      onPress={() => onOpen(staff.id)}
      style={[styles.row, { borderColor: theme.border }, negative && { backgroundColor: theme.backgroundSelected }]}>
      <View style={styles.main}>
        <View style={styles.header}>
          <Text style={styles.name}>{staff.name}</Text>
          {negative && (
            <Text style={[styles.badge, { color: theme.danger, borderColor: theme.danger }]}>
              欠货
            </Text>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            库存：{qty}件/{variety}种
          </Text>
          <MoneyText cents={cents(amount)} />
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          testID={`in-${staff.id}`}
          onPress={() => onIn(staff.id)}
          style={[styles.btn, { backgroundColor: theme.success }]}>
          <Text style={styles.btnText}>入库</Text>
        </Pressable>
        <Pressable
          testID={`out-${staff.id}`}
          onPress={() => onOut(staff.id)}
          style={[styles.btn, { backgroundColor: theme.danger }]}>
          <Text style={styles.btnText}>出单</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, gap: 12 },
  main: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  badge: { fontSize: 12, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sub: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
