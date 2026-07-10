import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LevelBadge } from '@/components/level-badge';
import { useTheme } from '@/hooks/use-theme';
import type { Staff } from '@/data/staff';

/**
 * One member row in the 记账 list (stock-balance-refactor placeholder skeleton).
 *
 * Members no longer hold stock, so the old per-staff 「库存：N件/N种 ¥X」 summary
 * line + the 欠货 badge are gone; the 入库 affordance is gone too (restock is a
 * 管理-tab concern owned by the admin `-1`). What remains is the member's name +
 * level + an 出库 affordance. Spec 03 (balance-domain) fills the 余额 / 欠款
 * display + a 充值 affordance into the empty `main` area; spec 02 only tears the
 * deprecated per-staff-inventory wiring out so the build compiles clean.
 *
 * Navigation is delegated (`onOut` / `onOpen`) so the row stays a pure,
 * RNTL-testable presentational piece; the screen wires these to the router.
 */
export interface StaffRowProps {
  staff: Staff;
  onOut: (staffId: string) => void;
  onOpen: (staffId: string) => void;
}

export function StaffRow({ staff, onOut, onOpen }: StaffRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={`row-${staff.id}`}
      onPress={() => onOpen(staff.id)}
      style={[styles.row, { borderColor: theme.border }]}>
      <View style={styles.main}>
        <View style={styles.header}>
          <Text style={styles.name}>{staff.name}</Text>
          <LevelBadge level={staff.level} />
        </View>
      </View>
      <View style={styles.actions}>
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
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
