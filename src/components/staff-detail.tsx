import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { MoneyText } from '@/components/money-text';
import { formatDate, formatTime } from '@/components/date-format';
import { useStaffById, useStaffInventory, useStockRecords } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents } from '@/data/primitives';
import type { Direction, StockItem } from '@/data/stock-record';

/**
 * The staff look-back screen. Two read-only sections over the derived read
 * models: a collapsible 库存 section (per-product holdings + their current-price
 * total), and a movement history grouped by local day (newest-first), each day
 * prefixed with a separator line carrying that day's 入库 / 出单 totals. Each
 * record row still taps through to its detail (edit / void live there).
 *
 * Spec #04 (page-refactor) reshaped this from a flat `ScrollView` into a day-
 * grouped `FlatList`: 持仓→库存 with a header total + a collapse toggle (default
 * collapsed), a `共 N 条 / 入库 / 出单` record-section summary derived from the
 * loaded records, and ADR-0007 day-batched rendering. Each FlatList item is one
 * whole DAY SECTION (the separator + that day's record rows nested together), so
 * `visibleDays` caps how many days render and a batch boundary can never split a
 * day's separator from its records — the wholeness invariant is structural, not
 * enforced by slice arithmetic. `onEndReached` reveals the next days; a `加载更多`
 * footer is the same reveal via an explicit tap (more discoverable, a fallback
 * when onEndReached doesn't fire on short lists). Holdings are the current-price
 * cost view; record amounts are the frozen `line_amount` snapshot (ADR-0002).
 * Navigation is delegated (`onOpenRecord`); the route wires the router.
 */
const DIRECTION_LABEL: Record<Direction, string> = { in: '入库', out: '出单' };

/** Initial days rendered, and how many more each reveal (onEndReached / footer) adds. */
const INITIAL_DAYS = 5;
const DAYS_PER_BATCH = 5;

export interface StaffDetailProps {
  staffId: string;
  onOpenRecord: (recordId: string) => void;
}

/** One FlatList item = one local calendar day: its separator totals + record rows. */
interface DaySection {
  date: string; // YYYY/MM/DD via formatDate
  dayIn: number; // Σ in-direction line_amount that day (cents)
  dayOut: number; // Σ out-direction line_amount that day (cents)
  records: { recordId: string; timestamp: number; direction: Direction; items: StockItem[]; amount: number }[];
}

export function StaffDetail({ staffId, onOpenRecord }: StaffDetailProps) {
  const theme = useTheme();
  const staff = useStaffById(staffId);
  const holdings = useStaffInventory(staffId);
  const records = useStockRecords({ staff_id: staffId });
  const [holdingsOpen, setHoldingsOpen] = useState(false); // default collapsed
  const [visibleDays, setVisibleDays] = useState(INITIAL_DAYS);

  const holdingsList = holdings.data ?? [];
  const holdingsTotal = holdingsList.reduce((sum, h) => sum + h.cost_amount, 0);

  // Group records by local calendar day (newest-first), folding each item's frozen
  // line_amount into the day + section totals. Pure derived shape — never stored.
  const { sections, totalDays, inTotal, outTotal } = useMemo(() => {
    const byDay = new Map<string, DaySection>();
    let inT = 0;
    let outT = 0;
    for (const rw of records.data ?? []) {
      const date = formatDate(rw.record.timestamp);
      let day = byDay.get(date);
      if (!day) {
        day = { date, dayIn: 0, dayOut: 0, records: [] };
        byDay.set(date, day);
      }
      const amt = rw.items.reduce((s, i) => s + i.line_amount, 0);
      if (rw.record.direction === 'in') {
        day.dayIn += amt;
        inT += amt;
      } else {
        day.dayOut += amt;
        outT += amt;
      }
      day.records.push({
        recordId: rw.record.id,
        timestamp: rw.record.timestamp,
        direction: rw.record.direction,
        items: rw.items,
        amount: amt,
      });
    }
    // Days newest-first; within a day, records newest-first too.
    const all = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const day of all) day.records.sort((a, b) => b.timestamp - a.timestamp);
    return { sections: all, totalDays: all.length, inTotal: inT, outTotal: outT };
  }, [records.data]);

  // Day-batched slice (ADR-0007): render the first `visibleDays` whole day
  // sections. Because each section carries its own separator + records, slicing
  // at a day boundary can never split a day — no limit/offset on the read.
  const visible = sections.slice(0, visibleDays);

  const recordCount = (records.data ?? []).length;

  const renderDay = ({ item }: { item: DaySection }) => (
    <View>
      <View testID={`day-${item.date}`} style={[styles.dayHeader, { borderColor: theme.border }]}>
        <Text style={[styles.dayDate, { color: theme.text }]}>{item.date}</Text>
        <Text style={{ color: theme.success }}>入库</Text>
        <MoneyText cents={cents(item.dayIn)} />
        <Text style={{ color: theme.danger }}>出单</Text>
        <MoneyText cents={cents(item.dayOut)} />
      </View>
      {item.records.map((r) => (
        <Pressable
          key={r.recordId}
          testID={`history-${r.recordId}`}
          onPress={() => onOpenRecord(r.recordId)}
          style={[styles.row, { borderColor: theme.border }]}>
          <Text style={{ color: r.direction === 'in' ? theme.success : theme.danger }}>{DIRECTION_LABEL[r.direction]}</Text>
          <Text style={{ color: theme.textSecondary }}>{formatTime(r.timestamp)}</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {r.items.map((i) => `${i.title} ×${i.qty}`).join('、')}
          </Text>
          <MoneyText cents={cents(r.amount)} />
        </Pressable>
      ))}
    </View>
  );

  // Reveal the next batch of whole days. onEndReached drives it for users who
  // scroll; the `加载更多` footer (ListFooterComponent) is the same reveal via an
  // explicit tap — more discoverable, a graceful fallback when onEndReached
  // doesn't fire on short lists, and the stable seam the batch test presses.
  const revealMore = () => setVisibleDays((n) => Math.min(n + DAYS_PER_BATCH, totalDays));

  return (
    <FlatList
      testID="history-list"
      data={visible}
      keyExtractor={(item) => item.date}
      renderItem={renderDay}
      onEndReached={revealMore}
      onEndReachedThreshold={0.2}
      ListFooterComponent={
        visibleDays < totalDays ? (
          <Pressable testID="load-more-days" onPress={revealMore} style={styles.loadMore}>
            <Text style={{ color: theme.textSecondary }}>加载更多</Text>
          </Pressable>
        ) : null
      }
      contentContainerStyle={[styles.content, { backgroundColor: theme.background }]}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={[styles.name, { color: theme.text }]}>{staff.data?.name ?? '加载中'}</Text>

          <Pressable
            testID="holdings-toggle"
            onPress={() => setHoldingsOpen((v) => !v)}
            style={[styles.sectionHeader, { borderColor: theme.border }]}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>库存</Text>
            <MoneyText testID="holdings-total" cents={cents(holdingsTotal)} />
            <Ionicons name={holdingsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
          </Pressable>
          {holdingsOpen &&
            holdingsList.map((h) => (
              <View key={h.product.id} testID={`holding-${h.product.id}`} style={[styles.row, { borderColor: theme.border }]}>
                <Text style={[styles.title, { color: theme.text }]}>{h.product.title}</Text>
                <Text style={[styles.qty, { color: theme.text }]}>{h.qty}件</Text>
                <MoneyText cents={cents(h.cost_amount)} />
              </View>
            ))}

          <View testID="record-summary" style={[styles.summary, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text }}>共 {recordCount} 条</Text>
            <Text style={{ color: theme.success }}>入库</Text>
            <MoneyText testID="record-in-total" cents={cents(inTotal)} />
            <Text style={{ color: theme.danger }}>出单</Text>
            <MoneyText testID="record-out-total" cents={cents(outTotal)} />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 8 },
  header: { gap: 8, paddingBottom: 4 },
  name: { fontSize: 20, fontWeight: '700', paddingVertical: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  sectionLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  title: { flex: 1, fontSize: 15 },
  qty: { fontSize: 15 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  dayDate: { fontSize: 13, fontWeight: '600' },
  loadMore: { alignItems: 'center', paddingVertical: 12 },
});
