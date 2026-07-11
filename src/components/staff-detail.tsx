import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { formatDate } from "@/components/date-format";
import { FlowEventRow } from "@/components/flow-event-row";
import { MemberInfoHeader } from "@/components/member-info-header";
import { MoneyText } from "@/components/money-text";
import { cents } from "@/data/primitives";
import { splitBundleRetail } from "@/data/split-bundle";
import type { Direction, StockItem } from "@/data/stock-record";
import { useStockRecords, useTopups } from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";
import { BottomTabInset } from "@/constants/theme";

/**
 * The member look-back screen (stock-balance-refactor balance-domain).
 *
 * Two regions:
 *  1. 余额 — the derived member money balance (`useMemberBalance`: Σ topup − Σ out
 *     line_amount), with a 欠款 mark when negative.
 *  2. 综合历史 — a merged day-grouped timeline of the member's checkouts (`out`
 *     records) and top-ups, newest day first. Each day is a collapsible card
 *     (default collapsed); a top-up row carries a 作废 affordance (confirm →
 *     `useVoidTopup`), the operator-action close that lets a mis-keyed top-up be
 *     corrected and the balance recompute (US11). Checkout rows tap through to
 *     record detail.
 *
 * Under the new model a member's records are all `out` (restock `in` is admin -1),
 * so the day separator shows 出库 + 充值 totals (no 入库). Day-batched rendering
 * (ADR-0007); record amounts are frozen `line_amount` snapshots (ADR-0002).
 * Navigation is delegated (`onOpenRecord`); the route wires the router.
 */

/** Initial days rendered, and how many more each reveal (onEndReached / footer) adds. */
const INITIAL_DAYS = 5;
const DAYS_PER_BATCH = 5;

export interface StaffDetailProps {
  staffId: string;
  onOpenRecord: (recordId: string) => void;
  onOpenTopup: (topupId: string) => void;
}

type EventKind = "record" | "topup";

/** One merged history event (a checkout or a top-up) inside a day section. */
interface HistoryEvent {
  id: string;
  kind: EventKind;
  timestamp: number;
  amount: number; // frozen line_amount (record) or top-up amount, in cents
  direction?: Direction; // record only
  items?: StockItem[]; // record only
  unitPriceSnapshot?: number | null; // record only — frozen bundle split basis
  note?: string | null; // topup only
}

/** One FlatList item = one local calendar day: its separator totals + events. */
interface DaySection {
  date: string; // YYYY/MM/DD via formatDate
  dayTopup: number; // Σ top-up amount that day (cents)
  dayOut: number; // Σ out line_amount that day (cents)
  events: HistoryEvent[];
}

export function StaffDetail({ staffId, onOpenRecord, onOpenTopup }: StaffDetailProps) {
  const theme = useTheme();
  const records = useStockRecords({ staff_id: staffId });
  const topups = useTopups({ staff_id: staffId });
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [visibleDays, setVisibleDays] = useState(INITIAL_DAYS);

  // Merge checkouts + top-ups into a day-grouped timeline (newest-first). Pure
  // derived shape — never stored.
  const { sections, totalDays, outTotal, topupTotal } = useMemo(() => {
    const byDay = new Map<string, DaySection>();
    let outT = 0;
    let topupT = 0;
    const ensure = (date: string): DaySection => {
      let day = byDay.get(date);
      if (!day) {
        day = { date, dayTopup: 0, dayOut: 0, events: [] };
        byDay.set(date, day);
      }
      return day;
    };
    for (const rw of records.data ?? []) {
      const date = formatDate(rw.record.timestamp);
      const day = ensure(date);
      const amt = rw.items.reduce((s, i) => s + i.line_amount, 0);
      // a member's records are all 'out'; direction is tracked so an 'in' (if any)
      // wouldn't be mislabeled, but only 'out' feeds the balance/separator.
      if (rw.record.direction === "out") {
        day.dayOut += amt;
        outT += amt;
      }
      day.events.push({
        id: rw.record.id,
        kind: "record",
        timestamp: rw.record.timestamp,
        amount: amt,
        direction: rw.record.direction,
        items: rw.items,
        unitPriceSnapshot: rw.record.unit_price_snapshot,
      });
    }
    for (const t of topups.data ?? []) {
      const date = formatDate(t.timestamp);
      const day = ensure(date);
      day.dayTopup += t.amount;
      topupT += t.amount;
      day.events.push({
        id: t.id,
        kind: "topup",
        timestamp: t.timestamp,
        amount: t.amount,
        note: t.note,
      });
    }
    const all = [...byDay.values()].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    for (const day of all) day.events.sort((a, b) => b.timestamp - a.timestamp);
    return {
      sections: all,
      totalDays: all.length,
      outTotal: outT,
      topupTotal: topupT,
    };
  }, [records.data, topups.data]);

  const visible = sections.slice(0, visibleDays);
  const recordCount = (records.data ?? []).length + (topups.data ?? []).length;

  const renderDay = ({ item }: { item: DaySection }) => {
    const dayOpen = openDays.has(item.date);
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Pressable
          testID={`day-${item.date}`}
          onPress={() => toggleDay(item.date)}
          style={styles.cardHead}
        >
          <Text style={[styles.dayDate, { color: theme.text }]}>
            {item.date}
          </Text>
          <Text style={{ color: theme.success }}>充值</Text>
          <MoneyText cents={cents(item.dayTopup)} />
          <Text style={{ color: theme.danger }}>出库</Text>
          <MoneyText cents={cents(item.dayOut)} />
          <Ionicons
            name={dayOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={theme.textSecondary}
          />
        </Pressable>
        {dayOpen &&
          item.events.map((e) =>
            e.kind === "record" ? (
              (() => {
                const { bundles, retail } = splitBundleRetail(
                  e.amount,
                  e.unitPriceSnapshot ?? 0,
                );
                return (
                  <FlowEventRow
                    key={e.id}
                    testID={`history-${e.id}`}
                    kind="checkout"
                    timestamp={e.timestamp}
                    amountCents={e.amount}
                    bundles={bundles}
                    retailCents={retail}
                    onPress={() => onOpenRecord(e.id)}
                  />
                );
              })()
            ) : (
              <FlowEventRow
                key={e.id}
                testID={`topup-${e.id}`}
                kind="topup"
                timestamp={e.timestamp}
                amountCents={e.amount}
                onPress={() => onOpenTopup(e.id)}
              />
            ),
          )}
      </View>
    );
  };

  const revealMore = () =>
    setVisibleDays((n) => Math.min(n + DAYS_PER_BATCH, totalDays));
  const toggleDay = (date: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

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
          <Pressable
            testID="load-more-days"
            onPress={revealMore}
            style={styles.loadMore}
          >
            <Text style={{ color: theme.textSecondary }}>加载更多</Text>
          </Pressable>
        ) : null
      }
      contentContainerStyle={[
        styles.content,
        { backgroundColor: theme.background },
      ]}
      ListHeaderComponent={
        <View style={styles.header}>
          <MemberInfoHeader staffId={staffId} />
          <View testID="record-summary" style={styles.summary}>
            <Text style={{ color: theme.text }}>共 {recordCount} 条记录</Text>
            <Text style={{ color: theme.success }}>充值</Text>
            <MoneyText testID="record-topup-total" cents={cents(topupTotal)} />
            <Text style={{ color: theme.danger }}>出库</Text>
            <MoneyText testID="record-out-total" cents={cents(outTotal)} />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 8, paddingBottom: BottomTabInset },
  header: { gap: 8, paddingBottom: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 20, fontWeight: "700", paddingVertical: 4 },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    fontSize: 15,
    fontWeight: "600",
    gap: 8,
  },
  dayDate: { flex: 1, fontSize: 13, fontWeight: "600" },
  loadMore: { alignItems: "center", paddingVertical: 12 },
});
