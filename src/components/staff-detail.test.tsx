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

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />, { repos });
    // spec #05: the standalone 余额 card is now MemberInfoHeader's second row —
    // sync on the balance text (the component's MoneyText has no per-staff testID).
    await waitForSync(() => view.getByText("¥70.00")); // 100 − 30, settled via useMemberBalance
    expect(view.getByTestId("member-info-header")).toBeTruthy();
    expect(view.queryByTestId("balance-section")).toBeNull(); // 独立余额卡片不再渲染
    expect(view.getByText("共 2 条记录")).toBeTruthy();
    expect(moneyText(view.getByTestId("member-flow-topup-total"))).toBe("¥100.00");
    expect(moneyText(view.getByTestId("member-flow-out-total"))).toBe("¥30.00");
  });

  it("marks a negative 余额 as 欠款 (out > topup)", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.topups.create({ staff_id: staffId, amount: cents(1000) }); // ¥10
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 10 }] }); // ¥30 → −¥20

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />, { repos });
    await waitForSync(() => view.getByText("欠款 ¥20.00")); // MemberInfoHeader 欠款标 (negative)
  });
});

describe("StaffDetail — summary uses FlowSummary (充值/出库/计单/零售)", () => {
  it("shows the member's overall flow via FlowSummary, bundles/retail split per out record's own snapshot", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.config.setUnitPrice(cents(500)); // ¥5.00/unit — frozen on each checkout
    await repos.topups.create({ staff_id: staffId, amount: cents(10000) }); // ¥100
    // out cola×7 = 2100¢ → splitBundleRetail(2100, 500) = 4 bundles + 100 retail
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 7 }] });
    // out cola×1 = 300¢ → 0 bundles + 300 retail
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", items: [{ product_id: productId, qty: 1 }] });

    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("member-flow"));

    // overall: topup ¥100, out ¥24 (2400¢), 4 bundles, retail ¥4.00 (400¢)
    expect(moneyText(view.getByTestId("member-flow-topup-total"))).toBe("¥100.00");
    expect(moneyText(view.getByTestId("member-flow-out-total"))).toBe("¥24.00");
    expect(view.getByTestId("member-flow-bundle-count").props.children).toEqual(
      expect.arrayContaining([4, " 单"]),
    );
    expect(moneyText(view.getByTestId("member-flow-retail"))).toBe("¥4.00");
  });
});

describe("StaffDetail — day header uses FlowSummary (per-day bundles/retail)", () => {
  it("each day separator shows that day's flow via FlowSummary (out/bundles/retail from the day's out records)", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.config.setUnitPrice(cents(500)); // ¥5.00/unit — frozen on each checkout
    // both on 2026-06-10: cola×7 = 2100¢ (4 bundles + 100 retail), cola×1 = 300¢ (0 + 300)
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: new Date(2026, 5, 10, 10, 0).getTime(), items: [{ product_id: productId, qty: 7 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: new Date(2026, 5, 10, 14, 0).getTime(), items: [{ product_id: productId, qty: 1 }] });

    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("member-day-flow-2026/06/10"));

    // that day: out ¥24 (2400¢), 4 bundles, retail ¥4.00 (400¢)
    expect(moneyText(view.getByTestId("member-day-flow-2026/06/10-out-total"))).toBe("¥24.00");
    expect(view.getByTestId("member-day-flow-2026/06/10-bundle-count").props.children).toEqual(
      expect.arrayContaining([4, " 单"]),
    );
    expect(moneyText(view.getByTestId("member-day-flow-2026/06/10-retail"))).toBe("¥4.00");
  });

  it("day header skips self_use out for bundles/retail (same predicate as aggregateBundleRetail); out¥ still counts", async () => {
    // AC7 — 按天手工 split 与 aggregateBundleRetail 同口径跳过自用。
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.config.setUnitPrice(cents(500));
    // non-self-use: cola×7 = 2100¢ → 4 bundles + 100 retail
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      timestamp: new Date(2026, 5, 10, 10, 0).getTime(),
      items: [{ product_id: productId, qty: 7 }],
    });
    // self-use: cola×7 = 2100¢ → must NOT add bundles/retail, but out¥ includes it
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      self_use: true,
      timestamp: new Date(2026, 5, 10, 14, 0).getTime(),
      items: [{ product_id: productId, qty: 7 }],
    });

    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("member-day-flow-2026/06/10"));

    // day out = 2100+2100 = ¥42; bundles/retail only from non-self-use
    expect(moneyText(view.getByTestId("member-day-flow-2026/06/10-out-total"))).toBe("¥42.00");
    expect(view.getByTestId("member-day-flow-2026/06/10-bundle-count").props.children).toEqual(
      expect.arrayContaining([4, " 单"]),
    );
    expect(moneyText(view.getByTestId("member-day-flow-2026/06/10-retail"))).toBe("¥1.00");
    // overview (aggregateBundleRetail) matches day path — no drift
    expect(view.getByTestId("member-flow-bundle-count").props.children).toEqual(
      expect.arrayContaining([4, " 单"]),
    );
    expect(moneyText(view.getByTestId("member-flow-retail"))).toBe("¥1.00");
    expect(moneyText(view.getByTestId("member-flow-out-total"))).toBe("¥42.00");
  });
});

describe("StaffDetail — 自用 checkout row (checkout-self-use)", () => {
  it("self_use out row shows 自用 and amount; hides bundles/retail; out¥ still in day/summary", async () => {
    const { repos, staffId, productId } = await seedStaffProduct();
    await repos.config.setUnitPrice(cents(500));
    const { record } = await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      self_use: true,
      timestamp: new Date(2026, 5, 10, 14, 0).getTime(),
      items: [{ product_id: productId, qty: 7 }], // 2100¢ — would be 4 单 + 100 if not self_use
    });

    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("day-2026/06/10"));
    await fireEvent.press(view.getByTestId("day-2026/06/10"));
    await flushPending();

    const row = view.getByTestId(`history-${record.id}`);
    expect(row).toBeTruthy();
    expect(view.getByTestId(`history-${record.id}-self-use`).props.children).toBe("自用");
    expect(moneyText(view.getByTestId(`history-${record.id}-amount`))).toBe("¥21.00");
    expect(view.queryByTestId(`history-${record.id}-bundle-count`)).toBeNull();
    expect(view.queryByTestId(`history-${record.id}-retail`)).toBeNull();
    // day/overview out¥ still counts; bundles/retail exclude
    expect(moneyText(view.getByTestId("member-day-flow-2026/06/10-out-total"))).toBe("¥21.00");
    expect(view.getByTestId("member-day-flow-2026/06/10-bundle-count").props.children).toEqual(
      expect.arrayContaining([0, " 单"]),
    );
    expect(moneyText(view.getByTestId("member-flow-out-total"))).toBe("¥21.00");
    expect(view.getByTestId("member-flow-bundle-count").props.children).toEqual(
      expect.arrayContaining([0, " 单"]),
    );
  });
});

describe("StaffDetail — 充值 history navigates to detail (flow-event-row)", () => {
  it("topup row calls onOpenTopup when tapped", async () => {
    const { repos, staffId } = await seedStaffProduct();
    const topup = await repos.topups.create({
      staff_id: staffId,
      amount: cents(10000),
      note: "首充",
      timestamp: new Date(2026, 5, 10, 9, 0, 0).getTime(),
    });

    const onOpenTopup = jest.fn();
    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={onOpenTopup} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("day-2026/06/10"));
    await fireEvent.press(view.getByTestId("day-2026/06/10"));
    await flushPending();

    await fireEvent.press(view.getByTestId(`topup-${topup.id}`));
    expect(onOpenTopup).toHaveBeenCalledWith(topup.id);
    expect(view.queryByTestId(`topup-void-${topup.id}`)).toBeNull();
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

    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />, { repos });
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
    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={onOpenRecord} onOpenTopup={jest.fn()} />, { repos });
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
    expect(view.getByTestId(`history-${newer.record.id}-time`).props.children).toBe("14:30:00");

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
    const { view } = await renderDetail(<StaffDetail staffId={staffId} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />, { repos });
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
  it("shows the 星站 badge next to the name for a gold member (read-only)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const gold = await repos.staff.create({ name: "金客", phone: "", notes: "", level: "gold" });
    const { view } = await renderDetail(<StaffDetail staffId={gold.id} onOpenRecord={jest.fn()} onOpenTopup={jest.fn()} />, { repos });
    await waitForSync(() => view.getByText("金客"));
    expect(view.getByText("星站")).toBeTruthy();
  });
});
