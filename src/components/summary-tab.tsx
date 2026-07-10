import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import {
  formatDate,
  formatTime,
  rangeFor,
  type RangePreset,
} from "@/components/date-format";
import { MoneyText } from "@/components/money-text";
import { cents } from "@/data/primitives";
import type { Direction } from "@/data/stock-record";
import {
  useDailyFlow,
  useShopAggregate,
  useStaff,
  useStockRecords,
} from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";

/**
 * The 汇总 tab (rewritten, spec #05 / page-refactor) — a single time-range-scoped
 * supervision view that replaced the old four-segment switcher. Three regions:
 *
 *  1. 时间段 selector (本月/上月/本周/上周) — drives the flow region's `date_range`
 *     via #01's `rangeFor`. `now` is injectable (rangeFor's designed test seam).
 *  2. 库存卡 — an as-of-now snapshot of the whole shop's stock value
 *     (`useShopAggregate`, NOT range-scoped): the total never changes when you
 *     switch the range. Labelled 「当前」 so the operator feels the caliber
 *     difference from the flow (current price vs frozen history — ADR-0002).
 *  3. 流水 — the range's in/out totals + a day-grouped (newest-first) × staff
 *     movement from one `useDailyFlow({ date_range })` pass. Each staff row
 *     expands to that day's records (drilled from the range-scoped
 *     `useStockRecords`, filtered by staff + local day). Record rows tap through
 *     to record detail (edit / void live there).
 *
 * Each FlatList item is one whole DAY SECTION (the day card + its staff cards
 * nested together), so `visibleDays` caps how many days render and a batch
 * boundary can never split a day (ADR-0007; same structural-wholeness trick as
 * staff-detail #04). Each level is a **container card** mirroring the 库存卡:
 * the day card (`styles.card`) wraps its header + staff cards; a staff card
 * (`styles.staffCard`) wraps its header + record lines. `openDays` holds the
 * expanded dateDash set (default empty = all collapsed) — a header tap toggles
 * membership, and the card's height grows to contain its children with `gap`
 * only when open. `expandedStaffDay` is the same pattern one level down (staff
 * card → record lines). `onEndReached` reveals more days; a `加载更多` footer
 * is the same reveal via an explicit tap. Navigation is delegated
 * (`onOpenStaff` / `onOpenRecord`); the route wires the router, so the tab is
 * RNTL-testable.
 */
const DIRECTION_LABEL: Record<Direction, string> = { in: "入库", out: "出库" };

/** Initial days rendered, and how many more each reveal (onEndReached / footer) adds. */
const INITIAL_DAYS = 5;
const DAYS_PER_BATCH = 5;

const PRESETS: Array<{ key: RangePreset; label: string; testID: string }> = [
  { key: "thisMonth", label: "本月", testID: "range-thisMonth" },
  { key: "lastMonth", label: "上月", testID: "range-lastMonth" },
  { key: "thisWeek", label: "本周", testID: "range-thisWeek" },
  { key: "lastWeek", label: "上周", testID: "range-lastWeek" },
];

export interface SummaryTabProps {
  onOpenStaff: (staffId: string) => void;
  /** Record-row tap (inside an expanded staff row) → record detail (#07 route). */
  onOpenRecord?: (recordId: string) => void;
  /** Epoch-ms "now" threaded into `rangeFor` — #01's deterministic-test seam. Defaults to Date.now(). */
  now?: number;
}

/** One FlatList item = one local calendar day: its separator totals + staff rows. */
interface DaySection {
  dateDash: string; // 'YYYY-MM-DD' (dailyFlow row.date) — the day key + keyExtractor
  dateSlash: string; // 'YYYY/MM/DD' — display + testID (matches formatDate)
  dayIn: number; // Σ in_amount across the day's staff (cents)
  dayOut: number; // Σ out_amount across the day's staff (cents)
  staffRows: { staffId: string; inAmount: number; outAmount: number }[];
}

export function SummaryTab({
  onOpenStaff,
  onOpenRecord,
  now = Date.now(),
}: SummaryTabProps) {
  const theme = useTheme();
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [expandedStaffDay, setExpandedStaffDay] = useState<string | null>(null);
  // Per-day collapse (day-collapse spec): empty set = every day collapsed. A day
  // header tap toggles its dateDash in the set; staff rows render only when open.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [visibleDays, setVisibleDays] = useState(INITIAL_DAYS);

  const range = useMemo(() => rangeFor(preset, now), [preset, now]);
  const aggregate = useShopAggregate(); // as-of-now, NOT range-scoped
  const flow = useDailyFlow({ date_range: range });
  const records = useStockRecords({ date_range: range }); // drill-down for staff-row expand
  const staff = useStaff();
  const staffName = useMemo(
    () => new Map((staff.data ?? []).map((s) => [s.id, s.name])),
    [staff.data],
  );

  const aggregateRows = aggregate.data ?? [];
  const inventoryTotal = aggregateRows.reduce(
    (sum, r) => sum + r.total_cost,
    0,
  );

  // Group the (already newest-first) dailyFlow rows by day, folding each row into
  // the day + section totals. Pure derived shape — never stored.
  const { sections, totalDays, inTotal, outTotal } = useMemo(() => {
    const byDay = new Map<string, DaySection>();
    let inT = 0;
    let outT = 0;
    for (const row of flow.data ?? []) {
      let day = byDay.get(row.date);
      if (!day) {
        day = {
          dateDash: row.date,
          dateSlash: row.date.replace(/-/g, "/"),
          dayIn: 0,
          dayOut: 0,
          staffRows: [],
        };
        byDay.set(row.date, day);
      }
      day.dayIn += row.in_amount;
      day.dayOut += row.out_amount;
      inT += row.in_amount;
      outT += row.out_amount;
      day.staffRows.push({
        staffId: row.staff_id,
        inAmount: row.in_amount,
        outAmount: row.out_amount,
      });
    }
    // flow returns newest-first; Map preserves first-seen order, so sections stay newest-first.
    const all = [...byDay.values()];
    return {
      sections: all,
      totalDays: all.length,
      inTotal: inT,
      outTotal: outT,
    };
  }, [flow.data]);

  // Day-batched slice (ADR-0007): each section is a whole day, so slicing at a day
  // boundary can never split a day's separator from its staff rows.
  const visible = sections.slice(0, visibleDays);

  const renderDay = ({ item }: { item: DaySection }) => {
    const dayOpen = openDays.has(item.dateDash);
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Pressable
          testID={`day-${item.dateSlash}`}
          onPress={() => toggleDay(item.dateDash)}
          style={styles.cardHead}
        >
          <Text style={[styles.dayDate, { color: theme.text }]}>
            {item.dateSlash}
          </Text>
          <Text style={{ color: theme.success }}>入库</Text>
          <MoneyText cents={cents(item.dayIn)} />
          <Text style={{ color: theme.danger }}>出库</Text>
          <MoneyText cents={cents(item.dayOut)} />
          <Ionicons
            name={dayOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={theme.textSecondary}
          />
        </Pressable>
        {dayOpen &&
          item.staffRows.map((sr) => {
            const key = `${item.dateDash}|${sr.staffId}`;
            const expanded = expandedStaffDay === key;
            return (
              <View
                key={key}
                style={[styles.staffCard, { borderColor: theme.border }]}
              >
                <Pressable
                  testID={`staff-row-${item.dateDash}-${sr.staffId}`}
                  onPress={() =>
                    setExpandedStaffDay((cur) => (cur === key ? null : key))
                  }
                  onLongPress={() => onOpenStaff(sr.staffId)}
                  style={styles.cardHead}
                >
                  <Text style={[styles.title, { color: theme.text }]}>
                    {staffName.get(sr.staffId) ?? sr.staffId}
                  </Text>
                  <Text style={{ color: theme.success }}>入</Text>
                  <MoneyText
                    testID={`staff-in-${item.dateDash}-${sr.staffId}`}
                    cents={cents(sr.inAmount)}
                  />
                  <Text style={{ color: theme.danger }}>出</Text>
                  <MoneyText
                    testID={`staff-out-${item.dateDash}-${sr.staffId}`}
                    cents={cents(sr.outAmount)}
                  />
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={theme.textSecondary}
                  />
                </Pressable>
                {expanded &&
                  (records.data ?? [])
                    .filter(
                      (rw) =>
                        rw.record.staff_id === sr.staffId &&
                        formatDate(rw.record.timestamp) === item.dateSlash,
                    )
                    .map((rw) => {
                      const amt = rw.items.reduce(
                        (s, i) => s + i.line_amount,
                        0,
                      );
                      return (
                        <Pressable
                          key={rw.record.id}
                          testID={`flow-record-${rw.record.id}`}
                          onPress={() => onOpenRecord?.(rw.record.id)}
                          style={styles.recordLine}
                        >
                          <Text
                            style={{
                              color:
                                rw.record.direction === "in"
                                  ? theme.success
                                  : theme.danger,
                            }}
                          >
                            {DIRECTION_LABEL[rw.record.direction]}
                          </Text>
                          <Text style={{ color: theme.textSecondary }}>
                            {formatTime(rw.record.timestamp)}
                          </Text>
                          <Text style={[styles.title, { color: theme.text }]}>
                            {rw.items
                              .map((i) => `${i.title} ×${i.qty}`)
                              .join("、")}
                          </Text>
                          <MoneyText cents={cents(amt)} />
                        </Pressable>
                      );
                    })}
              </View>
            );
          })}
      </View>
    );
  };

  const revealMore = () =>
    setVisibleDays((n) => Math.min(n + DAYS_PER_BATCH, totalDays));

  // Toggle one day's collapse without mutating the current set (rules-of-react).
  const toggleDay = (dateDash: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateDash)) next.delete(dateDash);
      else next.add(dateDash);
      return next;
    });

  return (
    <FlatList
      testID="summary-list"
      data={visible}
      keyExtractor={(item) => item.dateDash}
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
          {/* 库存卡 — as-of-now snapshot, range-independent. 「当前」 flags the caliber. */}
          <Pressable
            testID="inventory-toggle"
            onPress={() => setInventoryOpen((v) => !v)}
            style={[styles.card, { borderColor: theme.border }]}
          >
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                库存（当前）
              </Text>
              <MoneyText
                testID="inventory-total"
                cents={cents(inventoryTotal)}
              />
              <Ionicons
                name={inventoryOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={theme.textSecondary}
              />
            </View>
            {inventoryOpen &&
              aggregateRows.map((r) => (
                <View
                  key={r.product.id}
                  testID={`inventory-product-${r.product.id}`}
                  style={[styles.subRow, { borderColor: theme.border }]}
                >
                  <Text style={[styles.title, { color: theme.text }]}>
                    {r.product.title}
                  </Text>
                  <Text style={{ color: theme.textSecondary }}>
                    {r.total_qty}件
                  </Text>
                  <MoneyText cents={cents(r.total_cost)} />
                </View>
              ))}
          </Pressable>
          {/* 时间段 selector — drives the flow region's date_range */}
          <View style={[styles.presets, { borderColor: theme.border }]}>
            {PRESETS.map((p) => {
              const active = p.key === preset;
              return (
                <Pressable
                  key={p.key}
                  testID={p.testID}
                  onPress={() => setPreset(p.key)}
                  style={[
                    styles.preset,
                    active && { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Text
                    style={{ color: active ? theme.text : theme.textSecondary }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 流水 region header — the range's in/out totals (frozen line_amount, ADR-0002) */}
          <View
            testID="flow-summary"
            style={[styles.summary, { borderColor: theme.border }]}
          >
            <Text style={{ color: theme.success }}>入库</Text>
            <MoneyText testID="flow-in-total" cents={cents(inTotal)} />
            <Text style={{ color: theme.danger }}>出库</Text>
            <MoneyText testID="flow-out-total" cents={cents(outTotal)} />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 8 },
  header: { gap: 8, paddingBottom: 4 },
  presets: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  preset: { flex: 1, paddingVertical: 10, alignItems: "center" },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "600" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dayDate: { flex: 1, fontSize: 13, fontWeight: "600" },
  // Nested container card (a day card holds staff cards; a staff card holds
  // record lines) — same containment model as `card`/库存卡, just tighter so the
  // nesting reads. `gap` spaces the header from its expanded children.
  staffCard: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  recordLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 12,
  },
  title: { flex: 1, fontSize: 15 },
  loadMore: { alignItems: "center", paddingVertical: 12 },
});
