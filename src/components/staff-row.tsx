import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { useTheme } from '@/hooks/use-theme';
import { cents } from '@/data/primitives';
import type { StaffSummary } from '@/data/inventory';
import type { Staff } from '@/data/staff';

/**
 * One staff row in the 记账 list (spec #05). Shows the staff's per-staff holding
 * summary (variety / total qty / total amount via `MoneyText`) computed by the
 * one-pass `staffSummaries()` rollup; a 欠货 badge + danger-tinted row when any
 * product balance is negative; and 入库 / 出库 affordances that carry the staff id
 * to the form (#6). The row body taps through to staff detail (#7).
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
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          {summary ? `${summary.variety}种 / ${summary.total_qty}件` : '无记录'}
        </Text>
        {summary && <MoneyText cents={cents(summary.total_amount)} />}
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
          <Text style={styles.btnText}>出库</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, gap: 12 },
  main: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  badge: { fontSize: 12, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  sub: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
