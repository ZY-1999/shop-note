import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { useStaffById, useStaffInventory, useStockRecords } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents } from '@/data/primitives';
import type { Direction } from '@/data/stock-record';

/**
 * The staff look-back screen (spec #07) — two read-only sections over the
 * derived read models: the staff's current holdings (per-product qty + amount
 * via `staffInventory`) and their newest-first movement history (via
 * `stockRecords.list({ staff_id })`, which excludes voided). Tapping a history
 * row opens that record's detail (#07 RecordDetail) where edit / void live.
 *
 * Holdings are the current-price cost view (revalue on a price change); history
 * rows show each line's frozen snapshot title + qty (the amount is on the detail
 * screen). Navigation is delegated (`onOpenRecord`) so the component is a pure,
 * RNTL-testable piece; the route wires it to the router.
 */
const DIRECTION_LABEL: Record<Direction, string> = { in: '入库', out: '出库' };

export interface StaffDetailProps {
  staffId: string;
  onOpenRecord: (recordId: string) => void;
}

export function StaffDetail({ staffId, onOpenRecord }: StaffDetailProps) {
  const theme = useTheme();
  const staff = useStaffById(staffId);
  const holdings = useStaffInventory(staffId);
  const records = useStockRecords({ staff_id: staffId });

  // newest-first: list() returns timestamp-asc; flip for the look-back feed.
  const history = [...(records.data ?? [])].sort((a, b) => b.record.timestamp - a.record.timestamp);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.name, { color: theme.text }]}>{staff.data?.name ?? '加载中'}</Text>

      <Text style={[styles.section, { color: theme.textSecondary }]}>持仓</Text>
      {(holdings.data ?? []).map((h) => (
        <View key={h.product.id} testID={`holding-${h.product.id}`} style={[styles.row, { borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{h.product.title}</Text>
          <Text style={[styles.qty, { color: theme.text }]}>{h.qty}件</Text>
          <MoneyText cents={cents(h.cost_amount)} />
        </View>
      ))}

      <Text style={[styles.section, { color: theme.textSecondary }]}>记录</Text>
      {history.map(({ record, items }) => (
        <Pressable
          key={record.id}
          testID={`history-${record.id}`}
          onPress={() => onOpenRecord(record.id)}
          style={[styles.row, { borderColor: theme.border }]}
        >
          <Text style={{ color: record.direction === 'in' ? theme.success : theme.danger }}>
            {DIRECTION_LABEL[record.direction]}
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {items.map((i) => `${i.title} ×${i.qty}`).join('、')}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  name: { fontSize: 20, fontWeight: '700', paddingVertical: 4 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  title: { flex: 1, fontSize: 15 },
  qty: { fontSize: 15 },
});
