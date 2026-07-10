import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import { SummaryTab } from "@/components/summary-tab";
import { useCreateStockRecord } from "@/hooks/mutations";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * Spec #05 (page-refactor) — the rewritten 汇总 tab through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). Single time-range-scoped view:
 * 时间段 selector → 库存卡 (as-of-now, range-independent) → 流水 (range-scoped,
 * day×staff, expandable). `now` is injected (#01's rangeFor seam) so the
 * date_range filtering is deterministic. Async mechanics (waitForSync /
 * flushPending / QueryClient clear) live in [testing/async.ts](../testing/async.ts).
 */

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderTab(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

/** Join MoneyText's two-children output (`["¥","9.00"]`) into one matchable string. */
function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
}

/** Injected "now" = 2026-07-10 noon → thisMonth = July 2026, lastMonth = June 2026. */
const NOW = new Date(2026, 6, 10, 12, 0).getTime();
const DAY = (d: number, h = 10, m = 0) => new Date(2026, 6, d, h, m).getTime(); // a day in July 2026

/** Base: one staff + cola (¥3.00) + water (¥5.00). Tests add the records they need. */
async function setup() {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
  const water = await repos.products.create({ title: "矿泉水", purchase_price: cents(500), category: "饮料" });
  return { repos, staffId: staff.id, colaId: cola.id, waterId: water.id };
}

describe("SummaryTab — 时间段 selector + range refilter (spec #05 AC1)", () => {
  it("defaults to 本月 with the range's flow totals, and switching the preset refilters the flow", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    // in: cola×4 + water×3 = 2700¢ (¥27.00); out: cola×1 = 300¢ (¥3.00) — on July 9 (thisMonth)
    await repos.stockRecords.create({
      staff_id: staffId, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 4 }, { product_id: waterId, qty: 3 }],
    });
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("flow-summary"));

    // default 本月 → the seeded July records are in range → range totals render.
    expect(money(view.getByTestId("flow-in-total"))).toMatch(/27\.00/);
    expect(money(view.getByTestId("flow-out-total"))).toMatch(/3\.00/);

    // switch to 上月 (June 2026) → no records in range → flow totals drop to ¥0.00.
    await fireEvent.press(view.getByTestId("range-lastMonth"));
    await flushPending();
    await waitForSync(() => expect(money(view.getByTestId("flow-in-total"))).toMatch(/0\.00/));
    expect(money(view.getByTestId("flow-out-total"))).toMatch(/0\.00/);
    // no day separators render for an empty range.
    expect(view.queryAllByTestId(/^day-/)).toHaveLength(0);
  });
});

describe("SummaryTab — 库存卡: as-of-now total, expandable, range-independent (spec #05 AC2)", () => {
  it("shows the as-of-now inventory total, expands per-product on tap, and ignores the range", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    await repos.stockRecords.create({
      staff_id: staffId, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 4 }, { product_id: waterId, qty: 3 }],
    });
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("inventory-total"));

    // as-of-now: cola net 3 × 300¢ + water net 3 × 500¢ = 2400¢ = ¥24.00
    expect(money(view.getByTestId("inventory-total"))).toMatch(/24\.00/);
    // collapsed by default → product rows hidden.
    expect(() => view.getByTestId(`inventory-product-${colaId}`)).toThrow();

    // expand → per-product rows (title / qty / cost).
    await fireEvent.press(view.getByTestId("inventory-toggle"));
    await flushPending();
    expect(view.getByTestId(`inventory-product-${colaId}`)).toBeTruthy();
    expect(view.getByTestId(`inventory-product-${waterId}`)).toBeTruthy();

    // switching the range does NOT change the as-of-now total (different caliber).
    await fireEvent.press(view.getByTestId("range-lastMonth"));
    await flushPending();
    expect(money(view.getByTestId("inventory-total"))).toMatch(/24\.00/);
  });
});

describe("SummaryTab — flow grouped by day × staff, newest first (spec #05 AC4)", () => {
  it("groups flow under per-day separators (newest day first) with a per-staff row carrying in/out", async () => {
    const { repos, staffId, colaId } = await setup();
    // July 8 (older): in cola×2 = ¥6.00; July 9 (newer): out cola×1 = ¥3.00
    await repos.stockRecords.create({ staff_id: staffId, direction: "in", timestamp: DAY(8, 10), items: [{ product_id: colaId, qty: 2 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 14), items: [{ product_id: colaId, qty: 1 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));

    // two per-day separators, newest (07/09) before older (07/08).
    const allDays = view.getAllByTestId(/^day-/);
    expect(allDays.indexOf(view.getByTestId("day-2026/07/09"))).toBeLessThan(allDays.indexOf(view.getByTestId("day-2026/07/08")));

    // day sections are collapsed by default (day-collapse spec) → expand July 8 to reach its staff row.
    await fireEvent.press(view.getByTestId("day-2026/07/08"));
    await flushPending();

    // a per-staff row on July 8 carries its in amount (cola×2 × 300¢ = ¥6.00).
    expect(view.getByTestId(`staff-row-2026-07-08-${staffId}`)).toBeTruthy();
    expect(money(view.getByTestId(`staff-in-2026-07-08-${staffId}`))).toMatch(/6\.00/);
  });
});

describe("SummaryTab — day section collapsible: default collapsed, tap to toggle (day-collapse AC1–AC3)", () => {
  it("hides a day's staff rows by default, reveals them on tap, hides again on second tap", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.stockRecords.create({
      staff_id: staffId, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 2 }],
    });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));

    // collapsed by default → the day's staff row isn't rendered yet.
    expect(() => view.getByTestId(`staff-row-2026-07-09-${staffId}`)).toThrow();

    // tap the day header → expands → the staff row appears.
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();
    expect(view.getByTestId(`staff-row-2026-07-09-${staffId}`)).toBeTruthy();

    // tap the same header again → collapses → the staff row disappears.
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();
    expect(() => view.getByTestId(`staff-row-2026-07-09-${staffId}`)).toThrow();
  });

  it("keeps each day's expand state independent (two days can be open at once)", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.stockRecords.create({ staff_id: staffId, direction: "in", timestamp: DAY(8, 10), items: [{ product_id: colaId, qty: 1 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "in", timestamp: DAY(9, 10), items: [{ product_id: colaId, qty: 1 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));

    // open July 9 only → July 8 staff row still hidden.
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();
    expect(view.getByTestId(`staff-row-2026-07-09-${staffId}`)).toBeTruthy();
    expect(() => view.getByTestId(`staff-row-2026-07-08-${staffId}`)).toThrow();

    // open July 8 too → both days' staff rows present (independent toggles).
    await fireEvent.press(view.getByTestId("day-2026/07/08"));
    await flushPending();
    expect(view.getByTestId(`staff-row-2026-07-08-${staffId}`)).toBeTruthy();
    expect(view.getByTestId(`staff-row-2026-07-09-${staffId}`)).toBeTruthy();
  });
});

describe("SummaryTab — staff-row expand → records → record detail (spec #05 AC5)", () => {
  it("expanding a staff row lists that day's records and opens one on tap", async () => {
    const { repos, staffId, colaId } = await setup();
    const rec = await repos.stockRecords.create({ staff_id: staffId, direction: "in", timestamp: DAY(9, 10), items: [{ product_id: colaId, qty: 2 }] });

    const onOpenRecord = jest.fn();
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} onOpenRecord={onOpenRecord} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));

    // day collapsed by default (day-collapse spec) → expand July 9 to reach its staff row.
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();

    // staff row collapsed by default → the record row isn't rendered yet.
    expect(() => view.getByTestId(`flow-record-${rec.record.id}`)).toThrow();

    // expand the staff row → the record row appears with its HH:mm time + items×qty.
    await fireEvent.press(view.getByTestId(`staff-row-2026-07-09-${staffId}`));
    await flushPending();
    expect(view.getByTestId(`flow-record-${rec.record.id}`)).toBeTruthy();
    expect(view.getByText("10:00")).toBeTruthy();
    expect(view.getByText(/可乐 ×2/)).toBeTruthy();

    // tapping the record row opens record detail.
    await fireEvent.press(view.getByTestId(`flow-record-${rec.record.id}`));
    expect(onOpenRecord).toHaveBeenCalledWith(rec.record.id);
  });
});

describe("SummaryTab — day-batched rendering (spec #05 AC6, ADR-0007)", () => {
  it("renders the first days, holds the rest back, and reveals them whole (batch = whole days)", async () => {
    const { repos, staffId, colaId } = await setup();
    // Seven records, one per distinct local day (July 1–7 2026, all in 本月).
    for (let d = 1; d <= 7; d++) {
      await repos.stockRecords.create({ staff_id: staffId, direction: "in", timestamp: DAY(d, 9), items: [{ product_id: colaId, qty: 1 }] });
    }
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("flow-summary"));

    // INITIAL_DAYS (5) day separators render first; the 6th day (07/02, newest-first) is held back.
    expect(view.getAllByTestId(/^day-/)).toHaveLength(5);
    expect(() => view.getByTestId("day-2026/07/02")).toThrow();
    expect(view.getByTestId("load-more-days")).toBeTruthy();

    // reveal → all 7 day separators, whole (no split); footer disappears.
    await fireEvent.press(view.getByTestId("load-more-days"));
    await flushPending();
    expect(view.getAllByTestId(/^day-/)).toHaveLength(7);
    expect(view.queryByTestId("load-more-days")).toBeNull();
  });
});

/** Test-only writer: posts an `in` record through the real mutation, so the suite
 *  can prove a write ELSEWHERE refreshes the open 汇总 view (AC7) — no manual refetch. */
function Poster({ staffId, productId }: { staffId: string; productId: string }) {
  const create = useCreateStockRecord();
  return (
    <Pressable
      testID="poster"
      onPress={() => create.mutate({ staff_id: staffId, direction: "in", items: [{ product_id: productId, qty: 1 }] })}>
      <Text>post</Text>
    </Pressable>
  );
}

describe("SummaryTab — cross-view refresh (spec #05 AC7)", () => {
  it("a post elsewhere refreshes the open 汇总 view without manual refetch", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    await repos.stockRecords.create({
      staff_id: staffId, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 4 }, { product_id: waterId, qty: 3 }],
    });
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(
      <View>
        <SummaryTab now={NOW} onOpenStaff={jest.fn()} />
        <Poster staffId={staffId} productId={colaId} />
      </View>,
      { repos },
    );
    await waitForSync(() => view.getByTestId("inventory-total"));
    // as-of-now inventory: cola net 3 + water net 3 = ¥24.00
    expect(money(view.getByTestId("inventory-total"))).toMatch(/24\.00/);

    // post another cola×1 elsewhere — useCreateStockRecord invalidates qk.inventory
    fireEvent.press(view.getByTestId("poster"));

    // inventory revalues live: cola net 4 × 300¢ + water 1500¢ = 2700¢ = ¥27.00
    await waitForSync(() => expect(money(view.getByTestId("inventory-total"))).toMatch(/27\.00/));
  });
});
