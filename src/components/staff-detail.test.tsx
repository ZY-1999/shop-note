import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";

import { StaffDetail } from "@/components/staff-detail";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * Spec #04 (page-refactor) — staff-detail through the real data stack (ADR-0006:
 * InMemoryAdapter, no mocked Repos). Reshape: 持仓→库存 (collapsible, default
 * collapsed, with a header total), a `共 N 条 / 入库 / 出库` record summary, history
 * grouped by local day with a per-day separator, and ADR-0007 day-batched
 * rendering driven by `onEndReached` (+ a `加载更多` footer that calls the same
 * reveal, for discoverability and a stable test seam). Async mechanics
 * (waitForSync / flushPending / QueryClient clear) live in
 * [testing/async.ts](../testing/async.ts).
 */

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

async function renderDetail(
  ui: ReactElement,
  opts?: { repos?: Repos },
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

/** Join a MoneyText node's `["¥","12.00"]` children into one matchable string. */
function moneyText(el: { props: Record<string, unknown> }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c);
}

/** Seed one staff + one ¥3.00 product; return them for tests to build records with. */
async function seedStaffProduct() {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const product = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
  return { repos, staffId: staff.id, productId: product.id };
}

describe("StaffDetail — 库存 section (collapsible + total) (spec #04 AC1)", () => {
  it("defaults collapsed, shows the holdings total in the header, and expands on tap", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.stockRecords.create({
      staff_id: staffId, direction: "in", items: [{ product_id: productId, qty: 4 }], // 4 @ 300¢ = 1200¢
    });
    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("holdings-toggle"));

    // Default collapsed → balance rows not rendered.
    expect(() => view.getByTestId(`holding-${productId}`)).toThrow();
    // Header shows the current-price total (Σ cost_amount = 1200¢ = ¥12.00).
    expect(moneyText(view.getByTestId("holdings-total"))).toBe("¥12.00");

    // Tap → expand → the per-product balance row appears.
    await fireEvent.press(view.getByTestId("holdings-toggle"));
    await flushPending();
    expect(view.getByTestId(`holding-${productId}`)).toBeTruthy();
  });

  it("renames the section 库存 (not 持仓)", async () => {
    const { repos, staffId } = await seedStaffProduct();
    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByText("库存"));
    expect(view.queryByText("持仓")).toBeNull();
  });
});

describe("StaffDetail — record summary 共 N 条 / 入库 / 出库 (spec #04 AC2)", () => {
  it("summarizes the record count + direction totals from the loaded records", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    // in 4 @ 300¢ = 1200¢ (¥12.00) + out 2 @ 300¢ = 600¢ (¥6.00)
    await repos.stockRecords.create({ staff_id: staffId, direction: "in", items: [{ product_id: productId, qty: 4 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 2 }] });

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("record-summary"));
    expect(view.getByText("共 2 条")).toBeTruthy();
    expect(moneyText(view.getByTestId("record-in-total"))).toBe("¥12.00");
    expect(moneyText(view.getByTestId("record-out-total"))).toBe("¥6.00");
  });
});

describe("StaffDetail — day section collapsible: default collapsed, tap to toggle (containment AC)", () => {
  it("hides a day's records by default, reveals them on tap, hides again on second tap", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    const rec = await repos.stockRecords.create({
      staff_id: staffId, direction: "in",
      timestamp: new Date(2026, 5, 10, 10, 0).getTime(), // 2026-06-10
      items: [{ product_id: productId, qty: 2 }],
    });

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/06/10"));

    // collapsed by default → the day's record row isn't rendered yet.
    expect(() => view.getByTestId(`history-${rec.record.id}`)).toThrow();

    // tap the day header → expands → the record row appears.
    await fireEvent.press(view.getByTestId("day-2026/06/10"));
    await flushPending();
    expect(view.getByTestId(`history-${rec.record.id}`)).toBeTruthy();

    // tap the same header again → collapses → the record row disappears.
    await fireEvent.press(view.getByTestId("day-2026/06/10"));
    await flushPending();
    expect(() => view.getByTestId(`history-${rec.record.id}`)).toThrow();
  });
});

describe("StaffDetail — history grouped by local day, newest first (spec #04 AC3/AC5)", () => {
  it("groups records under per-day separators (newest day first), labels out as 出库, and opens a record on tap", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    const older = await repos.stockRecords.create({
      staff_id: staffId, direction: "in",
      timestamp: new Date(2026, 5, 9, 10, 0).getTime(), // 2026-06-09
      items: [{ product_id: productId, qty: 1 }],
    });
    const newer = await repos.stockRecords.create({
      staff_id: staffId, direction: "out",
      timestamp: new Date(2026, 5, 10, 14, 30).getTime(), // 2026-06-10
      items: [{ product_id: productId, qty: 1 }],
    });

    const onOpenRecord = jest.fn();
    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={onOpenRecord} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/06/10"));

    // Two per-day separators, newest day (06/10) before older (06/09).
    const allDays = view.getAllByTestId(/^day-/);
    expect(allDays.indexOf(view.getByTestId("day-2026/06/10"))).toBeLessThan(allDays.indexOf(view.getByTestId("day-2026/06/09")));

    // day sections are collapsed by default (containment spec) → expand 06/10 to reach its records.
    await fireEvent.press(view.getByTestId("day-2026/06/10"));
    await flushPending();

    // The out record is labeled 出库 (not 出单) and carries its HH:mm time.
    // "出库" appears both in the day separator (the day's out-total label) and on
    // the out record row — assert presence (≥1), not uniqueness.
    expect(view.getAllByText("出库").length).toBeGreaterThan(0);
    expect(view.queryByText("出单")).toBeNull();
    expect(view.getByText("14:30")).toBeTruthy();

    // Tapping a record row opens its detail.
    await fireEvent.press(view.getByTestId(`history-${newer.record.id}`));
    expect(onOpenRecord).toHaveBeenCalledWith(newer.record.id);
    void older;
  });
});

describe("StaffDetail — day-batched rendering (spec #04 AC4, ADR-0007)", () => {
  it("renders the first days, holds the rest back, and reveals them whole (batch = whole days)", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    // Seven records, one per distinct local day (June 1–7 2026).
    for (let d = 1; d <= 7; d++) {
      await repos.stockRecords.create({
        staff_id: staffId, direction: "in",
        timestamp: new Date(2026, 5, d, 9, 0).getTime(),
        items: [{ product_id: productId, qty: 1 }],
      });
    }
    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("record-summary"));

    // INITIAL_DAYS (5) day separators render first; days 6–7 are held back.
    expect(view.getAllByTestId(/^day-/)).toHaveLength(5);
    expect(() => view.getByTestId("day-2026/06/02")).toThrow(); // the 6th day (newest-first) isn't split in
    // A "加载更多" affordance is shown while more days remain.
    expect(view.getByTestId("load-more-days")).toBeTruthy();

    // Reveal the next batch → all 7 day separators render, whole (no split), and the affordance disappears.
    await fireEvent.press(view.getByTestId("load-more-days"));
    await flushPending();
    expect(view.getAllByTestId(/^day-/)).toHaveLength(7);
    expect(view.queryByTestId("load-more-days")).toBeNull();
  });
});

describe("StaffDetail — member level badge in header (member-rename-level #03)", () => {
  it("shows the 金站 badge next to the name for a gold member (read-only)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const gold = await repos.staff.create({ name: "金客", phone: "", notes: "", level: "gold" });
    const { view } = await renderDetail(<StaffDetail staffId={gold.id} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByText("金客"));
    expect(view.getByText("金站")).toBeTruthy();
  });
});
