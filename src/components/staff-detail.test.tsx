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

describe("StaffDetail — 余额 partition + summary (balance-domain)", () => {
  it("shows the derived 余额 (Σ topup − Σ out) + the 充值/出库 summary totals", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.topups.create({ staff_id: staffId, amount: cents(10000) }); // ¥100
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 10 }] }); // ¥30

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    // spec #05: the standalone 余额 card is now MemberInfoHeader's second row —
    // sync on the balance text (the component's MoneyText has no per-staff testID).
    await waitForSync(() => view.getByText("¥70.00")); // 100 − 30, settled via useMemberBalance
    expect(view.getByTestId("member-info-header")).toBeTruthy();
    expect(view.queryByTestId("balance-section")).toBeNull(); // 独立余额卡片不再渲染
    expect(view.getByText("共 2 条记录")).toBeTruthy();
    expect(moneyText(view.getByTestId("record-topup-total"))).toBe("¥100.00");
    expect(moneyText(view.getByTestId("record-out-total"))).toBe("¥30.00");
  });

  it("marks a negative 余额 as 欠款 (out > topup)", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.topups.create({ staff_id: staffId, amount: cents(1000) }); // ¥10
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 10 }] }); // ¥30 → −¥20

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByText("欠款 ¥20.00")); // MemberInfoHeader 欠款标 (negative)
  });
});

describe("StaffDetail — 充值 history + 作废 (balance-domain US11)", () => {
  it("lists top-ups in the day history and voiding one recovers the balance", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.topups.create({ staff_id: staffId, amount: cents(10000), note: "首充", timestamp: new Date(2026, 5, 10, 9, 0).getTime() });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 10 }], timestamp: new Date(2026, 5, 10, 10, 0).getTime() });

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/06/10"));
    await fireEvent.press(view.getByTestId("day-2026/06/10"));
    await flushPending();

    // the top-up row carries a 作废 affordance; balance starts at ¥70 (100 − 30).
    await waitForSync(() => view.getByText("¥70.00")); // MemberInfoHeader 余额
    const [topup] = await repos.topups.list({ staff_id: staffId });
    await fireEvent.press(view.getByTestId(`topup-void-${topup.id}`));
    await fireEvent.press(view.getByTestId(`topup-confirm-${topup.id}`));

    // voiding the ¥100 top-up → balance recomputes to −¥30 (only the out remains).
    await waitForSync(() => view.getByText("欠款 ¥30.00"));
    expect((await repos.topups.list({ staff_id: staffId }))).toHaveLength(0); // voided → excluded
  });
});

describe("StaffDetail — day section collapsible: default collapsed, tap to toggle (containment AC)", () => {
  it("hides a day's records by default, reveals them on tap, hides again on second tap", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    const rec = await repos.stockRecords.create({
      staff_id: staffId, direction: "out",
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
      staff_id: staffId, direction: "out",
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
        staff_id: staffId, direction: "out",
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
