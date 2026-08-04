import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from "@expo/ui/community/datetime-picker";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import {
  formatDate,
  matchRangePreset,
  normalizeDayRange,
  rangeFor,
  type RangePreset,
} from "@/components/date-format";
import { FlowEventRow } from "@/components/flow-event-row";
import { FlowSummary } from "@/components/flow-summary";
import { MemberName } from "@/components/member-name";
import { MoneyText } from "@/components/money-text";
import { BottomTabInset } from "@/constants/theme";
import { cents } from "@/data/primitives";
import {
  aggregateBundleRetail,
  splitBundleRetail,
  type BundleRetail,
  type BundleRetailRecord,
} from "@/data/split-bundle";
import { ADMIN_STAFF_ID, DEFAULT_STAFF_LEVEL } from "@/data/staff";
import {
  useDailyFlow,
  useShopAggregate,
  useStaff,
  useStockRecords,
  useTopups,
} from "@/hooks/reads";
import { useTheme } from "@/hooks/use-theme";

/**
 * The 汇总 tab — time-range-scoped supervision view (summary-range-export #01):
 * toolbar (from/to + preset dropdown) → 库存卡 (as-of-now) → 流水 (range-scoped).
 */
const INITIAL_DAYS = 5;
const DAYS_PER_BATCH = 5;

const PRESETS: Array<{ key: RangePreset; label: string; testID: string }> = [
  { key: "last10Days", label: "近10天", testID: "range-last10Days" },
  { key: "thisMonth", label: "本月", testID: "range-thisMonth" },
  { key: "lastMonth", label: "上月", testID: "range-lastMonth" },
  { key: "thisWeek", label: "本周", testID: "range-thisWeek" },
  { key: "lastWeek", label: "上周", testID: "range-lastWeek" },
];

export interface SummaryTabProps {
  onOpenStaff: (staffId: string) => void;
  onOpenRecord?: (recordId: string) => void;
  onOpenTopup?: (topupId: string) => void;
  /** Epoch-ms "now" threaded into `rangeFor` — deterministic-test seam. */
  now?: number;
}

interface DaySection {
  dateDash: string;
  dateSlash: string;
  dayOut: number;
  dayTopup: number;
  staffRows: {
    staffId: string;
    outAmount: number;
    topupAmount: number;
  }[];
}

export function SummaryTab({
  onOpenStaff,
  onOpenRecord,
  onOpenTopup,
  now = Date.now(),
}: SummaryTabProps) {
  const theme = useTheme();
  const [range, setRange] = useState(() => rangeFor("last10Days", now));
  const [presetOpen, setPresetOpen] = useState(false);
  const [editingBound, setEditingBound] = useState<"from" | "to" | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [expandedStaffDay, setExpandedStaffDay] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [visibleDays, setVisibleDays] = useState(INITIAL_DAYS);

  const activePreset = matchRangePreset(range, now);
  const presetLabel =
    PRESETS.find((p) => p.key === activePreset)?.label ?? "自定义";

  const aggregate = useShopAggregate();
  const flow = useDailyFlow({ date_range: range });
  const records = useStockRecords({ date_range: range });
  const topups = useTopups({ date_range: range });
  const staff = useStaff();
  const staffById = useMemo(
    () => new Map((staff.data ?? []).map((s) => [s.id, s])),
    [staff.data],
  );

  const aggregateRows = aggregate.data ?? [];
  const inventoryTotal = aggregateRows.reduce(
    (sum, r) => sum + r.total_cost,
    0,
  );

  const { sections, totalDays, outTotal, topupTotal } = useMemo(() => {
    const byDay = new Map<string, DaySection>();
    let outT = 0;
    let topupT = 0;
    for (const row of flow.data ?? []) {
      if (row.staff_id === ADMIN_STAFF_ID) continue;
      let day = byDay.get(row.date);
      if (!day) {
        day = {
          dateDash: row.date,
          dateSlash: row.date.replace(/-/g, "/"),
          dayOut: 0,
          dayTopup: 0,
          staffRows: [],
        };
        byDay.set(row.date, day);
      }
      day.dayOut += row.out_amount;
      day.dayTopup += row.topup_amount;
      outT += row.out_amount;
      topupT += row.topup_amount;
      day.staffRows.push({
        staffId: row.staff_id,
        outAmount: row.out_amount,
        topupAmount: row.topup_amount,
      });
    }
    const all = [...byDay.values()];
    return {
      sections: all,
      totalDays: all.length,
      outTotal: outT,
      topupTotal: topupT,
    };
  }, [flow.data]);

  const bundleAggregate = useMemo(
    () => aggregateBundleRetail(records.data ?? []),
    [records.data],
  );

  const { dayBrMap, staffDayBrMap } = useMemo(() => {
    const dayGroups = new Map<string, BundleRetailRecord[]>();
    const staffDayGroups = new Map<string, BundleRetailRecord[]>();
    for (const rw of records.data ?? []) {
      const slash = formatDate(rw.record.timestamp);
      let arr = dayGroups.get(slash);
      if (!arr) dayGroups.set(slash, (arr = []));
      arr.push(rw);
      const skey = `${slash}|${rw.record.staff_id}`;
      let sarr = staffDayGroups.get(skey);
      if (!sarr) staffDayGroups.set(skey, (sarr = []));
      sarr.push(rw);
    }
    const materialize = (groups: Map<string, BundleRetailRecord[]>) => {
      const m = new Map<string, BundleRetail>();
      for (const [k, g] of groups) m.set(k, aggregateBundleRetail(g));
      return m;
    };
    return {
      dayBrMap: materialize(dayGroups),
      staffDayBrMap: materialize(staffDayGroups),
    };
  }, [records.data]);

  const visible = sections.slice(0, visibleDays);

  const applyPreset = (key: RangePreset) => {
    setRange(rangeFor(key, now));
    setPresetOpen(false);
    setEditingBound(null);
  };

  const onPickBound = (bound: "from" | "to", date: Date) => {
    const next =
      bound === "from"
        ? normalizeDayRange(date.getTime(), range.to)
        : normalizeDayRange(range.from, date.getTime());
    setRange(next);
    setEditingBound(null);
  };

  const renderDay = ({ item }: { item: DaySection }) => {
    const dayOpen = openDays.has(item.dateDash);
    const dayBr = dayBrMap.get(item.dateSlash) ?? { bundles: 0, retail: 0 };
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Pressable
          testID={`day-${item.dateSlash}`}
          onPress={() => toggleDay(item.dateDash)}
          style={styles.dayHead}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.dayDate, { color: theme.text }]}>
              {item.dateSlash}
            </Text>
            <FlowSummary
              testID={`flow-day-${item.dateDash}`}
              topup={item.dayTopup}
              out={item.dayOut}
              bundles={dayBr.bundles}
              retail={dayBr.retail}
              fontSize={12}
            />
            <Ionicons
              name={dayOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={theme.textSecondary}
            />
          </View>
        </Pressable>
        {dayOpen &&
          item.staffRows.map((sr) => {
            const key = `${item.dateDash}|${sr.staffId}`;
            const expanded = expandedStaffDay === key;
            const srBr = staffDayBrMap.get(
              `${item.dateSlash}|${sr.staffId}`,
            ) ?? {
              bundles: 0,
              retail: 0,
            };
            const s = staffById.get(sr.staffId);
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
                  style={styles.dayHead}
                >
                  <View style={styles.cardHead}>
                    <MemberName
                      name={s?.name ?? sr.staffId}
                      level={s?.level ?? DEFAULT_STAFF_LEVEL}
                      nameStyle={{ color: theme.text }}
                      maxWidth={42}
                    />
                    <FlowSummary
                      testID={`flow-staff-${item.dateDash}-${sr.staffId}`}
                      topup={sr.topupAmount}
                      out={sr.outAmount}
                      bundles={srBr.bundles}
                      retail={srBr.retail}
                      fontSize={12}
                    />
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={theme.textSecondary}
                    />
                  </View>
                </Pressable>
                {expanded &&
                  (() => {
                    type DrillEvent =
                      | {
                          kind: "checkout";
                          id: string;
                          timestamp: number;
                          amount: number;
                          unitPriceSnapshot: number | null | undefined;
                          selfUse: boolean;
                        }
                      | {
                          kind: "topup";
                          id: string;
                          timestamp: number;
                          amount: number;
                        };
                    const events: DrillEvent[] = [];
                    for (const rw of records.data ?? []) {
                      if (
                        rw.record.staff_id !== sr.staffId ||
                        formatDate(rw.record.timestamp) !== item.dateSlash
                      ) {
                        continue;
                      }
                      const amt = rw.items.reduce(
                        (s, i) => s + i.line_amount,
                        0,
                      );
                      events.push({
                        kind: "checkout",
                        id: rw.record.id,
                        timestamp: rw.record.timestamp,
                        amount: amt,
                        unitPriceSnapshot: rw.record.unit_price_snapshot,
                        selfUse: rw.record.self_use === true,
                      });
                    }
                    for (const t of topups.data ?? []) {
                      if (
                        t.staff_id !== sr.staffId ||
                        formatDate(t.timestamp) !== item.dateSlash
                      ) {
                        continue;
                      }
                      events.push({
                        kind: "topup",
                        id: t.id,
                        timestamp: t.timestamp,
                        amount: t.amount,
                      });
                    }
                    events.sort((a, b) => b.timestamp - a.timestamp);
                    return events.map((e) =>
                      e.kind === "checkout" ? (
                        (() => {
                          const selfUse = e.selfUse === true;
                          const { bundles, retail } = selfUse
                            ? { bundles: 0, retail: 0 }
                            : splitBundleRetail(
                                e.amount,
                                e.unitPriceSnapshot ?? 0,
                              );
                          return (
                            <FlowEventRow
                              key={e.id}
                              testID={`flow-record-${e.id}`}
                              kind="checkout"
                              timestamp={e.timestamp}
                              amountCents={e.amount}
                              bundles={bundles}
                              retailCents={retail}
                              selfUse={selfUse}
                              onPress={() => onOpenRecord?.(e.id)}
                            />
                          );
                        })()
                      ) : (
                        <FlowEventRow
                          key={e.id}
                          testID={`flow-topup-${e.id}`}
                          kind="topup"
                          timestamp={e.timestamp}
                          amountCents={e.amount}
                          onPress={() => onOpenTopup?.(e.id)}
                        />
                      ),
                    );
                  })()}
              </View>
            );
          })}
      </View>
    );
  };

  const revealMore = () =>
    setVisibleDays((n) => Math.min(n + DAYS_PER_BATCH, totalDays));

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
      style={{ flex: 1, backgroundColor: theme.background }}
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
          <View testID="summary-header" style={styles.header}>
          <View
            testID="range-toolbar"
            style={[styles.toolbar, { borderColor: theme.border }]}
          >
            <Pressable
              testID="range-from"
              onPress={() =>
                setEditingBound((b) => (b === "from" ? null : "from"))
              }
              style={styles.boundBtn}
            >
              <Text style={{ color: theme.text, fontSize: 13 }}>
                {formatDate(range.from)}
              </Text>
            </Pressable>
            <Text style={{ color: theme.textSecondary }}>～</Text>
            <Pressable
              testID="range-to"
              onPress={() =>
                setEditingBound((b) => (b === "to" ? null : "to"))
              }
              style={styles.boundBtn}
            >
              <Text style={{ color: theme.text, fontSize: 13 }}>
                {formatDate(range.to)}
              </Text>
            </Pressable>
            <View style={styles.presetWrap}>
              <Pressable
                testID="range-preset-trigger"
                onPress={() => setPresetOpen((v) => !v)}
                style={[
                  styles.presetTrigger,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.inputBg,
                  },
                ]}
              >
                <Text
                  testID="range-preset-label"
                  style={{ color: theme.text, fontSize: 13 }}
                >
                  {presetLabel}
                </Text>
                <Ionicons
                  name={presetOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.textSecondary}
                />
              </Pressable>
              {presetOpen && (
                <View
                  testID="range-preset-menu"
                  style={[
                    styles.presetMenu,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                >
                  {PRESETS.map((p) => {
                    const active = p.key === activePreset;
                    return (
                      <Pressable
                        key={p.key}
                        testID={p.testID}
                        onPress={() => applyPreset(p.key)}
                        style={[
                          styles.presetItem,
                          active && {
                            backgroundColor: theme.backgroundSelected,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? theme.text : theme.textSecondary,
                          }}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {editingBound && (
            <DateTimePicker
              testID={`range-${editingBound}-picker`}
              mode="date"
              value={new Date(editingBound === "from" ? range.from : range.to)}
              onValueChange={(_e: DateTimePickerChangeEvent, date: Date) =>
                onPickBound(editingBound, date)
              }
            />
          )}

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

          <FlowSummary
            topup={topupTotal}
            out={outTotal}
            bundles={bundleAggregate.bundles}
            retail={bundleAggregate.retail}
            style={[styles.card, { borderColor: theme.border }]}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 12, gap: 8, paddingBottom: BottomTabInset },
  header: { gap: 8, paddingBottom: 4 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    zIndex: 2,
  },
  boundBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  presetWrap: { flex: 1, minWidth: 88, zIndex: 3 },
  presetTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  presetMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
    zIndex: 10,
    elevation: 4,
  },
  presetItem: { paddingVertical: 10, paddingHorizontal: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "600" },
  dayDate: { flex: 1, fontSize: 13, fontWeight: "600" },
  dayHead: { gap: 4 },
  staffCard: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginLeft: 12,
  },
  title: { flex: 1, fontSize: 15 },
  loadMore: { alignItems: "center", paddingVertical: 12 },
});
