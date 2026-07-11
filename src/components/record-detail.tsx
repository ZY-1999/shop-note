import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { RecordForm } from '@/components/record-form';
import { useVoidStockRecord } from '@/hooks/mutations';
import { useStaffById, useStockRecordById } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents } from '@/data/primitives';
import { splitBundleRetail } from '@/data/split-bundle';
import type { Direction } from '@/data/stock-record';
import { BottomTabInset } from '@/constants/theme';

/**
 * The record detail screen (spec #07) — the look-back / correct surface. Shows
 * each line's FROZEN posting-time snapshot (title / unit_price / qty /
 * line_amount) and the header (direction / timestamp / note), so history reads
 * what actually moved, not a re-derivation from the product's current state (a
 * later product edit / void must not distort it). `getById` returns even voided
 * records, so the detail stays viewable after a void.
 *
 * [作废] confirms then voids; the record stays viewable (flagged 已作废) but
 * drops out of every derived balance/flow. (Edit mode is added by the route that
 * reuses #06's form preloaded with the record's lines — each carrying its stable
 * `id` so the repo's touched-vs-untouched merge preserves untouched snapshots.)
 *
 * Router-agnostic: the route reads `recordId` from params and passes it as a
 * prop, so the detail is RNTL-testable with no router context.
 */
const DIRECTION_LABEL: Record<Direction, string> = { in: '入库', out: '出库' };

export interface RecordDetailProps {
  recordId: string;
}

export function RecordDetail({ recordId }: RecordDetailProps) {
  const theme = useTheme();
  const detail = useStockRecordById(recordId);
  const staff = useStaffById(detail.data?.record.staff_id ?? '');
  const voidRecord = useVoidStockRecord();
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [editing, setEditing] = useState(false);
  const record = detail.data?.record;
  const items = detail.data?.items ?? [];

  if (!record) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>加载中</Text>
      </View>
    );
  }

  const voided = record.voided_at != null;

  // Edit mode reuses #06's form, preloaded with the record's frozen lines — each
  // carrying its stable item `id`, which is what drives the repo's touched (resnapshot)
  // vs untouched (keep snapshot) merge. After save, flip back to view; the detail's
  // own query refetches (the mutation invalidates qk.records) and shows the new snapshots.
  if (editing && staff.data) {
    return (
      <RecordForm
        staffId={record.staff_id}
        direction={record.direction}
        edit={{
          recordId,
          timestamp: record.timestamp,
          note: record.note,
          lines: items.map((i) => ({ id: i.id, productId: i.product_id, title: i.title, price: i.unit_price, qty: i.qty })),
        }}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Text style={{ color: record.direction === 'in' ? theme.success : theme.danger, fontSize: 18, fontWeight: '700' }}>
          {DIRECTION_LABEL[record.direction]}
        </Text>
        {staff.data && <Text style={[styles.note, { color: theme.text }]}>{staff.data.name}</Text>}
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {new Date(record.timestamp).toLocaleString()}
        </Text>
        {record.note != null && record.note !== '' && (
          <Text style={[styles.note, { color: theme.text }]}>{record.note}</Text>
        )}
        {voided && <Text style={{ color: theme.danger }}>已作废</Text>}
      </View>

      {items.map((item) => (
        <View key={item.id} testID={`line-${item.id}`} style={[styles.line, { borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
          <Text style={[styles.qty, { color: theme.text }]}>{item.qty}件</Text>
          <View style={styles.amounts}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>单价 </Text>
            <MoneyText cents={item.unit_price} testID={`unit-price-${item.id}`} />
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}> 小计 </Text>
            <MoneyText cents={item.line_amount} testID={`line-amount-${item.id}`} />
          </View>
        </View>
      ))}

      {record.direction === 'out' && record.unit_price_snapshot != null && record.unit_price_snapshot > 0 && (() => {
        const total = items.reduce((s, i) => s + i.line_amount, 0);
        const { bundles, retail } = splitBundleRetail(total, record.unit_price_snapshot);
        return (
          <View testID="bundle-split" style={[styles.line, { borderColor: theme.border }]}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>快照单价 </Text>
            <MoneyText cents={record.unit_price_snapshot} testID="snapshot-unit-price" />
            <Text style={[styles.qty, { color: theme.text }]} testID="bundle-count"> {bundles} 单</Text>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}> 零售 </Text>
            <MoneyText cents={cents(retail)} testID="bundle-retail" />
          </View>
        );
      })()}

      {!voided && (
        <View style={styles.actions}>
          {!confirmingVoid ? (
            <View style={styles.confirmRow}>
              <Pressable
                testID="edit"
                onPress={() => setEditing(true)}
                style={[styles.actionBtn, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text }}>编辑</Text>
              </Pressable>
              <Pressable
                testID="void"
                onPress={() => setConfirmingVoid(true)}
                style={[styles.actionBtn, { borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger }}>作废</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.confirmRow}>
              <Pressable
                testID="void-confirm"
                onPress={() => voidRecord.mutate(recordId)}
                disabled={voidRecord.isPending}
                style={[styles.actionBtn, { backgroundColor: theme.danger }]}>
                <Text style={styles.confirmText}>{voidRecord.isPending ? '作废中…' : '确认作废'}</Text>
              </Pressable>
              <Pressable
                testID="void-cancel"
                onPress={() => setConfirmingVoid(false)}
                style={[styles.actionBtn, { borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger }}>取消</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8, paddingBottom: BottomTabInset },
  header: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  note: { fontSize: 14 },
  line: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  qty: { fontSize: 15 },
  amounts: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  amountLabel: { fontSize: 13 },
  actions: { marginTop: 8 },
  confirmRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
