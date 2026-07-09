import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MoneyText } from '@/components/money-text';
import { useBalance, useDailyFlow, useShopAggregate, useStaff, useStaffSummaries } from '@/hooks/reads';
import { useTheme } from '@/hooks/use-theme';
import { cents } from '@/data/primitives';

/**
 * The 汇总 tab (spec #08) — the supervision / reconciliation surface. A
 * segmented switcher over four read-only, derived views of the one ledger:
 * overview (cross-staff totals per product + grand total), daily flow
 * (per day×staff money movement), by-staff (who holds what), and by-product
 * (where each product went). All derived, never stored (ADR-0002); all refresh
 * automatically when the ledger changes (every write path invalidates
 * qk.inventory / qk.dailyFlow — no view-local refetch).
 *
 * Read-only and delegation-only: do NOT sneak aggregation into the UI (the
 * reads already did it). Navigation is delegated (`onOpenStaff`) so the tab is
 * router-agnostic and RNTL-testable; the route wires it to the router.
 */
type ViewName = 'overview' | 'dailyFlow' | 'byStaff' | 'byProduct';

const SEGMENTS: Array<{ key: ViewName; label: string; testID: string }> = [
  { key: 'overview', label: '总览', testID: 'seg-overview' },
  { key: 'dailyFlow', label: '流水', testID: 'seg-dailyFlow' },
  { key: 'byStaff', label: '按员工', testID: 'seg-byStaff' },
  { key: 'byProduct', label: '按商品', testID: 'seg-byProduct' },
];

export interface SummaryTabProps {
  onOpenStaff: (staffId: string) => void;
}

export function SummaryTab({ onOpenStaff }: SummaryTabProps) {
  const theme = useTheme();
  const [view, setView] = useState<ViewName>('overview');

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.segments, { borderColor: theme.border }]}>
        {SEGMENTS.map((seg) => {
          const active = seg.key === view;
          return (
            <Pressable
              key={seg.key}
              testID={seg.testID}
              onPress={() => setView(seg.key)}
              style={[styles.segment, active && { backgroundColor: theme.backgroundSelected }]}>
              <Text style={[styles.segmentText, { color: active ? theme.text : theme.textSecondary }]}>{seg.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'overview' && <OverviewView />}
      {view === 'dailyFlow' && <DailyFlowView />}
      {view === 'byStaff' && <ByStaffView onOpenStaff={onOpenStaff} />}
      {view === 'byProduct' && <ByProductView />}
    </ScrollView>
  );
}

/** By-staff view — each staff's variety/qty/amount from one `useStaffSummaries()`
 *  pass; tapping a row opens that staff's holdings detail (#07). 欠货 flagged. */
function ByStaffView({ onOpenStaff }: { onOpenStaff: (staffId: string) => void }) {
  const theme = useTheme();
  const summaries = useStaffSummaries();
  const staff = useStaff();
  const staffName = new Map((staff.data ?? []).map((s) => [s.id, s.name]));
  const rows = summaries.data ?? [];

  return (
    <View testID="view-byStaff">
      {rows.map((s) => (
        <Pressable
          key={s.staff_id}
          testID={`bystaff-row-${s.staff_id}`}
          onPress={() => onOpenStaff(s.staff_id)}
          style={[styles.row, { borderColor: theme.border }, s.has_negative && { backgroundColor: theme.backgroundSelected }]}>
          <Text style={[styles.title, { color: theme.text }]}>{staffName.get(s.staff_id) ?? s.staff_id}</Text>
          <Text style={[styles.qty, { color: theme.textSecondary }]}>{`${s.variety}种 / ${s.total_qty}件`}</Text>
          <MoneyText cents={cents(s.total_amount)} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Daily flow — per (day × staff) money movement from one `useDailyFlow()` read,
 * newest day first. Amounts are the FROZEN snapshot `line_amount` (unit_price ×
 * qty at posting / last-touch), NOT current-price-revalued — so a later price
 * edit does not mutate past flow rows (contrast with overview, which revalues).
 */
function DailyFlowView() {
  const theme = useTheme();
  const flow = useDailyFlow();
  const staff = useStaff();
  const staffName = new Map((staff.data ?? []).map((s) => [s.id, s.name]));
  const rows = flow.data ?? [];

  return (
    <View testID="view-dailyFlow">
      {rows.map((row) => (
        <View key={`${row.date}-${row.staff_id}`} testID={`flowrow-${row.date}-${row.staff_id}`} style={[styles.row, { borderColor: theme.border }]}>
          <Text style={[styles.date, { color: theme.text }]}>{row.date}</Text>
          <Text style={[styles.staff, { color: theme.textSecondary }]}>{staffName.get(row.staff_id) ?? row.staff_id}</Text>
          <View style={styles.amountPair}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>入 </Text>
            <MoneyText cents={cents(row.in_amount)} testID={`flow-in-${row.date}-${row.staff_id}`} />
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}> 出 </Text>
            <MoneyText cents={cents(row.out_amount)} testID={`flow-out-${row.date}-${row.staff_id}`} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Overview — per-product cross-staff totals (qty + amount) from one
 * `shopAggregate()` read, plus a grand total. Current-price cost view: a later
 * price change revalues these rows on the next read (contrast with dailyFlow's
 * frozen snapshot).
 */
function OverviewView() {
  const theme = useTheme();
  const aggregate = useShopAggregate();
  const rows = aggregate.data ?? [];
  const grandTotal = rows.reduce((sum, r) => sum + r.total_cost, 0);

  return (
    <View testID="view-overview">
      {rows.map((r) => (
        <View key={r.product.id} testID={`overview-product-${r.product.id}`} style={[styles.row, { borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{r.product.title}</Text>
          <Text testID={`overview-qty-${r.product.id}`} style={[styles.qty, { color: theme.textSecondary }]}>
            {r.total_qty}件
          </Text>
          <MoneyText cents={cents(r.total_cost)} testID={`overview-amount-${r.product.id}`} />
        </View>
      ))}
      <View style={[styles.grandRow, { borderColor: theme.border }]}>
        <Text style={[styles.grandLabel, { color: theme.text }]}>合计</Text>
        <MoneyText cents={cents(grandTotal)} testID="overview-grand-total" />
      </View>
    </View>
  );
}

/**
 * By-product — each product's cross-staff total qty/amount (`shopAggregate()`).
 * Tapping a product reveals its per-staff breakdown ON DEMAND: each staff row is
 * its own `<ProductStaffBalance>` component that calls `useBalance(staffId,
 * productId)` — rules-of-React clean (one hook per component, not N calls in one
 * render body), and only mounted when a product is selected. Staff with a zero
 * balance for the product stay hidden.
 */
function ByProductView() {
  const theme = useTheme();
  const aggregate = useShopAggregate();
  const staff = useStaff();
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const rows = aggregate.data ?? [];
  const staffList = staff.data ?? [];

  return (
    <View testID="view-byProduct">
      {rows.map((r) => (
        <Pressable
          key={r.product.id}
          testID={`byproduct-row-${r.product.id}`}
          onPress={() => setSelectedProduct((p) => (p === r.product.id ? null : r.product.id))}
          style={[styles.row, { borderColor: theme.border }, selectedProduct === r.product.id && { backgroundColor: theme.backgroundSelected }]}>
          <Text style={[styles.title, { color: theme.text }]}>{r.product.title}</Text>
          <Text style={[styles.qty, { color: theme.textSecondary }]}>{`${r.total_qty}件`}</Text>
          <MoneyText cents={cents(r.total_cost)} testID={`byproduct-amount-${r.product.id}`} />
        </Pressable>
      ))}
      {selectedProduct &&
        staffList.map((s) => (
          <ProductStaffBalance key={s.id} staffId={s.id} staffName={s.name} productId={selectedProduct} />
        ))}
    </View>
  );
}

/** One staff's balance for the tapped product — a component so its `useBalance` hook is rules-compliant. */
function ProductStaffBalance({ staffId, staffName, productId }: { staffId: string; staffName: string; productId: string }) {
  const theme = useTheme();
  const balance = useBalance(staffId, productId);
  const qty = balance.data?.qty ?? 0;
  if (qty === 0) return null; // hide staff who don't hold this product
  return (
    <View testID={`byproduct-staff-${productId}-${staffId}`} style={[styles.subRow, { borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{staffName}</Text>
      <Text style={[styles.qty, { color: theme.textSecondary }]}>{`${qty}件`}</Text>
      <MoneyText cents={cents(balance.data!.cost_amount)} testID={`byproduct-staff-amount-${productId}-${staffId}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 8 },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  title: { flex: 1, fontSize: 15 },
  qty: { fontSize: 14 },
  date: { fontSize: 14, fontWeight: '600' },
  staff: { flex: 1, fontSize: 14 },
  amountPair: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  amountLabel: { fontSize: 13 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginLeft: 12 },
  grandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginTop: 4 },
  grandLabel: { fontSize: 16, fontWeight: '700' },
});
