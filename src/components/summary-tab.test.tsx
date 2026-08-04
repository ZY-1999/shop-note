import type { ReactElement } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent, within } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import { SummaryTab } from "@/components/summary-tab";
import { useCreateStockRecord } from "@/hooks/mutations";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { cents } from "@/data/primitives";
import type { ExportJob } from "@/export/types";
import { summaryExportFilename } from "@/export/build-summary-workbook";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";
import * as XLSX from "xlsx";

/**
 * Spec #05 + summary-range-export #01/#02 — 汇总 tab through the real data stack.
 * DateTimePicker stubbed; `runExport` mocked (share/write off-device).
 */

const mockRunExport = jest.fn<(job: ExportJob) => Promise<string>>(
  async () => "file:///cache/out.xlsx",
);
jest.mock("@/export/run-export", () => ({
  runExport: (job: ExportJob) => mockRunExport(job),
}));

jest.mock("@expo/ui/community/datetime-picker", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Text, Pressable } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  return {
    __esModule: true,
    default: ({
      value,
      testID,
      onValueChange,
    }: {
      value: Date;
      testID: string;
      onValueChange?: (e: unknown, date: Date) => void;
    }) =>
      React.createElement(
        View,
        { testID, onValueChange } as any,
        React.createElement(Text, null, value ? value.toISOString() : ""),
        React.createElement(
          Pressable,
          {
            testID: `${testID}-pick-earlier`,
            onPress: () => onValueChange?.({}, new Date(2026, 5, 1, 12, 0)),
          },
          React.createElement(Text, null, "pick-earlier"),
        ),
        React.createElement(
          Pressable,
          {
            testID: `${testID}-pick-later`,
            onPress: () => onValueChange?.({}, new Date(2026, 7, 20, 12, 0)),
          },
          React.createElement(Text, null, "pick-later"),
        ),
      ),
  };
});

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
  mockRunExport.mockReset().mockResolvedValue("file:///cache/out.xlsx");
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

/** Injected "now" = 2026-07-10 noon → last10Days = Jul 1–10; lastMonth = June 2026. */
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

async function pickPreset(
  view: RenderWithProvidersResult["view"],
  testID: string,
) {
  await fireEvent.press(view.getByTestId("range-preset-trigger"));
  await flushPending();
  await fireEvent.press(view.getByTestId(testID));
  await flushPending();
}

function boundLabel(view: RenderWithProvidersResult["view"], testID: string): string {
  const el = within(view.getByTestId(testID)).getByText(/\d{4}\/\d{2}\/\d{2}/);
  const c = el.props.children;
  return Array.isArray(c) ? c.join("") : String(c ?? "");
}

describe("SummaryTab — toolbar first + default 近10天 (summary-range-export #01)", () => {
  it("puts range-toolbar above inventory and defaults to last 10 days", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("range-toolbar"));

    const headerKids = (
      view.getByTestId("summary-header").props.children as Array<{
        props?: { testID?: string };
      } | false | null | undefined>
    ).filter(Boolean) as Array<{ props?: { testID?: string } }>;
    const ids = headerKids.map((c) => c?.props?.testID).filter(Boolean);
    expect(ids[0]).toBe("range-toolbar");
    expect(ids).toContain("inventory-toggle");
    expect(view.getByTestId("summary-list").props.style).toEqual(
      expect.objectContaining({ backgroundColor: "#ffffff", flex: 1 }),
    );
    expect(boundLabel(view, "range-from")).toBe("2026/07/01");
    expect(boundLabel(view, "range-to")).toBe("2026/07/10");
    expect(view.getByTestId("range-preset-label").props.children).toBe("近10天");
    await waitForSync(() => view.getByTestId("flow-summary"));
    expect(money(view.getByTestId("flow-out-total"))).toMatch(/3\.00/);
  });
});

describe("SummaryTab — 时间段 selector + flow refilter (spec #05 AC1 / #01)", () => {
  it("defaults to 近10天 with the range's flow totals, and switching the preset refilters the flow", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 4 }, { product_id: waterId, qty: 3 }],
    });
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("flow-summary"));

    expect(money(view.getByTestId("flow-out-total"))).toMatch(/3\.00/);

    await pickPreset(view, "range-lastMonth");
    await waitForSync(() => expect(money(view.getByTestId("flow-out-total"))).toMatch(/0\.00/));
    expect(view.queryAllByTestId(/^day-/)).toHaveLength(0);
  });
});

describe("SummaryTab — 库存卡: as-of-now total, expandable, range-independent (spec #05 AC2)", () => {
  it("shows the as-of-now inventory total, expands per-product on tap, and ignores the range", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 4 }, { product_id: waterId, qty: 3 }],
    });
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("inventory-total"));

    // as-of-now global stock: cola net 3 × 300¢ + water net 3 × 500¢ = 2400¢ = ¥24.00
    expect(money(view.getByTestId("inventory-total"))).toMatch(/24\.00/);
    // collapsed by default → product rows hidden.
    expect(() => view.getByTestId(`inventory-product-${colaId}`)).toThrow();

    // expand → per-product rows (title / qty / cost).
    await fireEvent.press(view.getByTestId("inventory-toggle"));
    await flushPending();
    expect(view.getByTestId(`inventory-product-${colaId}`)).toBeTruthy();
    expect(view.getByTestId(`inventory-product-${waterId}`)).toBeTruthy();

    // switching the range does NOT change the as-of-now total (different caliber).
    await pickPreset(view, "range-lastMonth");
    expect(money(view.getByTestId("inventory-total"))).toMatch(/24\.00/);
  });
});

describe("SummaryTab — day pick swap + custom preset label (#01)", () => {
  it("swaps when from > to and shows 自定义 when the window matches no preset", async () => {
    const { repos } = await setup();
    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("range-toolbar"));

    // Move "from" to Aug 20 (after current to Jul 10) → normalize swaps.
    await fireEvent.press(view.getByTestId("range-from"));
    await flushPending();
    await fireEvent.press(view.getByTestId("range-from-picker-pick-later"));
    await flushPending();

    expect(boundLabel(view, "range-from")).toBe("2026/07/10");
    expect(boundLabel(view, "range-to")).toBe("2026/08/20");
    expect(view.getByTestId("range-preset-label").props.children).toBe("自定义");
  });
});

describe("SummaryTab — flow grouped by day × staff, newest first (spec #05 AC4)", () => {
  it("groups flow under per-day separators (newest day first) with a per-staff row carrying in/out", async () => {
    const { repos, staffId, colaId } = await setup();
    // July 8 (older): member out cola×2 = ¥6.00; July 9 (newer): member out cola×1 = ¥3.00
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(8, 10), items: [{ product_id: colaId, qty: 2 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 14), items: [{ product_id: colaId, qty: 1 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));

    // two per-day separators, newest (07/09) before older (07/08).
    const allDays = view.getAllByTestId(/^day-/);
    expect(allDays.indexOf(view.getByTestId("day-2026/07/09"))).toBeLessThan(allDays.indexOf(view.getByTestId("day-2026/07/08")));

    // day sections are collapsed by default (day-collapse spec) → expand July 8 to reach its staff row.
    await fireEvent.press(view.getByTestId("day-2026/07/08"));
    await flushPending();

    // a per-staff row on July 8 carries its out amount (cola×2 × 300¢ = ¥6.00).
    expect(view.getByTestId(`staff-row-2026-07-08-${staffId}`)).toBeTruthy();
    expect(money(view.getByTestId(`flow-staff-2026-07-08-${staffId}-out-total`))).toMatch(/6\.00/);
  });
});

describe("SummaryTab — day header uses FlowSummary (per-day bundles/retail)", () => {
  it("each day card header shows that day's flow via FlowSummary (out/bundles/retail from the day's out records)", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.config.setUnitPrice(cents(500)); // ¥5.00/unit — frozen on each checkout
    // July 9: member out cola×7 = 2100¢ (4 bundles + 100 retail), cola×1 = 300¢ (0 + 300)
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 10), items: [{ product_id: colaId, qty: 7 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 14), items: [{ product_id: colaId, qty: 1 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("flow-day-2026-07-09"));

    // that day: out ¥24 (2400¢), 4 bundles, retail ¥4.00 (400¢); topup ¥0
    expect(money(view.getByTestId("flow-day-2026-07-09-out-total"))).toMatch(/24\.00/);
    expect(view.getByTestId("flow-day-2026-07-09-bundle-count").props.children).toEqual(
      expect.arrayContaining([4, " 单"]),
    );
    expect(money(view.getByTestId("flow-day-2026-07-09-retail"))).toMatch(/4\.00/);
  });
});

describe("SummaryTab — staff row shows member level via MemberName", () => {
  it("renders the 星站 badge next to a gold member's name in the day's staff row", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const gold = await repos.staff.create({ name: "金客", phone: "", notes: "", level: "gold" });
    const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
    await repos.stockRecords.create({ staff_id: gold.id, direction: "out", timestamp: DAY(9, 10), items: [{ product_id: cola.id, qty: 1 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));
    await fireEvent.press(view.getByTestId("day-2026/07/09")); // expand → staff row renders
    await flushPending();

    expect(view.getByText("金客")).toBeTruthy();
    expect(view.getByTestId("level-badge")).toBeTruthy();
    expect(view.getByText("星站")).toBeTruthy();
  });
});

describe("SummaryTab — staff row uses FlowSummary (per-member-per-day bundles/retail)", () => {
  it("a day's staff row shows that member's flow that day via FlowSummary (out/bundles/retail)", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.config.setUnitPrice(cents(500)); // ¥5.00/unit
    // July 8: member out cola×2 = 600¢ → 1 bundle + 100 retail
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(8, 10), items: [{ product_id: colaId, qty: 2 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/08"));
    await fireEvent.press(view.getByTestId("day-2026/07/08")); // expand the day → staff row renders
    await flushPending();

    // that member on July 8: out ¥6.00 (600¢), 1 bundle, retail ¥1.00 (100¢)
    expect(money(view.getByTestId(`flow-staff-2026-07-08-${staffId}-out-total`))).toMatch(/6\.00/);
    expect(view.getByTestId(`flow-staff-2026-07-08-${staffId}-bundle-count`).props.children).toEqual(
      expect.arrayContaining([1, " 单"]),
    );
    expect(money(view.getByTestId(`flow-staff-2026-07-08-${staffId}-retail`))).toMatch(/1\.00/);
  });
});

describe("SummaryTab — day section collapsible: default collapsed, tap to toggle (day-collapse AC1–AC3)", () => {
  it("hides a day's staff rows by default, reveals them on tap, hides again on second tap", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 10),
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
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(8, 10), items: [{ product_id: colaId, qty: 1 }] });
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 10), items: [{ product_id: colaId, qty: 1 }] });

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

describe("SummaryTab — 自用 checkout row (checkout-self-use)", () => {
  it("self_use out row shows 自用 and amount; hides bundles/retail", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.config.setUnitPrice(cents(500));
    const { record } = await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      self_use: true,
      timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 7 }],
    });

    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} onOpenRecord={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("day-2026/07/09"));
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();
    await fireEvent.press(view.getByTestId(`staff-row-2026-07-09-${staffId}`));
    await flushPending();

    expect(view.getByTestId(`flow-record-${record.id}-self-use`).props.children).toBe("自用");
    expect(money(view.getByTestId(`flow-record-${record.id}-amount`))).toBe("¥21.00");
    expect(view.queryByTestId(`flow-record-${record.id}-bundle-count`)).toBeNull();
    expect(view.queryByTestId(`flow-record-${record.id}-retail`)).toBeNull();
  });
});

describe("SummaryTab — staff-row expand → records → record detail (spec #05 AC5)", () => {
  it("expanding a staff row lists that day's records and opens one on tap", async () => {
    const { repos, staffId, colaId } = await setup();
    const rec = await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 10), items: [{ product_id: colaId, qty: 2 }] });

    const onOpenRecord = jest.fn();
    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} onOpenRecord={onOpenRecord} />, { repos });
    await waitForSync(() => view.getByTestId("day-2026/07/09"));

    // day collapsed by default (day-collapse spec) → expand July 9 to reach its staff row.
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();

    // staff row collapsed by default → the record row isn't rendered yet.
    expect(() => view.getByTestId(`flow-record-${rec.record.id}`)).toThrow();

    // expand the staff row → the record row appears with second-precision time.
    await fireEvent.press(view.getByTestId(`staff-row-2026-07-09-${staffId}`));
    await flushPending();
    expect(view.getByTestId(`flow-record-${rec.record.id}`)).toBeTruthy();
    expect(view.getByTestId(`flow-record-${rec.record.id}-time`).props.children).toBe("10:00:00");
    expect(view.queryByText(/可乐 ×2/)).toBeNull();

    // tapping the record row opens record detail.
    await fireEvent.press(view.getByTestId(`flow-record-${rec.record.id}`));
    expect(onOpenRecord).toHaveBeenCalledWith(rec.record.id);
  });

  it("expanding a staff row lists topup events and opens one on tap", async () => {
    const { repos, staffId } = await setup();
    const topup = await repos.topups.create({
      staff_id: staffId,
      amount: cents(5000),
      timestamp: DAY(9, 11, 30),
    });

    const onOpenTopup = jest.fn();
    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} onOpenTopup={onOpenTopup} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("day-2026/07/09"));
    await fireEvent.press(view.getByTestId("day-2026/07/09"));
    await flushPending();
    await fireEvent.press(view.getByTestId(`staff-row-2026-07-09-${staffId}`));
    await flushPending();

    expect(view.getByTestId(`flow-topup-${topup.id}`)).toBeTruthy();
    await fireEvent.press(view.getByTestId(`flow-topup-${topup.id}`));
    expect(onOpenTopup).toHaveBeenCalledWith(topup.id);
  });
});

describe("SummaryTab — day-batched rendering (spec #05 AC6, ADR-0007)", () => {
  it("renders the first days, holds the rest back, and reveals them whole (batch = whole days)", async () => {
    const { repos, staffId, colaId } = await setup();
    // Seven records, one per distinct local day (July 1–7 2026, all in 本月).
    for (let d = 1; d <= 7; d++) {
      await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(d, 9), items: [{ product_id: colaId, qty: 1 }] });
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

/** Test-only writer: posts a restock (`in` via admin -1) through the real mutation,
 *  so the suite can prove a write ELSEWHERE refreshes the open 汇总 view (AC7) — no manual refetch. */
function Poster({ productId }: { productId: string }) {
  const create = useCreateStockRecord();
  return (
    <Pressable
      testID="poster"
      onPress={() => create.mutate({ staff_id: ADMIN_STAFF_ID, direction: "in", items: [{ product_id: productId, qty: 1 }] })}>
      <Text>post</Text>
    </Pressable>
  );
}

describe("SummaryTab — 会员流水（出库/充值）+ 单数零售聚合；补货不进汇总 (restock-excluded)", () => {
  it("summary header shows 出库/充值 only (no 补货); restock (-1) is excluded from the day drill-down", async () => {
    const { repos, staffId, colaId } = await setup();
    const day = DAY(9, 10);
    await repos.config.setUnitPrice(cents(2400)); // ¥24/unit (for the bundle aggregate below)
    // restock (-1) + member out + member topup, all on July 9 (thisMonth)
    await repos.stockRecords.create({ staff_id: ADMIN_STAFF_ID, direction: "in", timestamp: day, items: [{ product_id: colaId, qty: 10 }] }); // 补货 ¥30
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 14), items: [{ product_id: colaId, qty: 7 }] }); // 出库 line_amount 7×300=2100¢
    await repos.topups.create({ staff_id: staffId, amount: cents(10000), timestamp: day }); // 充值 ¥100

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("flow-summary"));

    // range totals in the header: 出库 2100¢ (¥21) / 充值 10000¢ (¥100). 补货 is
    // intentionally absent from the summary — restock is an inventory op that
    // surfaces in the 库存卡 (as-of-now stock), not in this member-flow view.
    expect(money(view.getByTestId("flow-out-total"))).toMatch(/21\.00/);
    expect(money(view.getByTestId("flow-topup-total"))).toMatch(/100\.00/);
    expect(view.queryByTestId("flow-in-total")).toBeNull();
    // no 补货 label anywhere in the summary (neither header nor drill-down).
    expect(view.queryByText("补货")).toBeNull();

    // expand the day → only the member row shows; the -1 restock row is excluded.
    await waitForSync(() => view.getByTestId(`day-2026/07/09`));
    await fireEvent.press(view.getByTestId(`day-2026/07/09`));
    await flushPending();
    expect(view.queryByTestId(`staff-row-2026-07-09-${ADMIN_STAFF_ID}`)).toBeNull();
    expect(view.getByText("张三")).toBeTruthy();
  });

  it("出库聚合: each out record split via its OWN snapshot, then Σ bundles / Σ retail", async () => {
    const { repos, staffId, colaId } = await setup();
    await repos.config.setUnitPrice(cents(2400)); // ¥24.00/unit — frozen on the checkout
    // one out: line_amount 7 × 300¢ = 2100¢ → splitBundleRetail(2100, 2400) = {0 bundles, 2100 retail}
    await repos.stockRecords.create({ staff_id: staffId, direction: "out", timestamp: DAY(9, 14), items: [{ product_id: colaId, qty: 7 }] });

    const { view } = await renderTab(<SummaryTab now={NOW} onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("flow-summary"));
    expect(view.getByTestId("bundle-aggregate-count").props.children).toEqual(expect.arrayContaining([0, " 单"]));
    expect(money(view.getByTestId("bundle-aggregate-retail"))).toMatch(/21\.00/); // 2100¢ retail
  });
});

describe("SummaryTab — cross-view refresh (spec #05 AC7)", () => {
  it("a post elsewhere refreshes the open 汇总 view without manual refetch", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID, direction: "in", timestamp: DAY(9, 10),
      items: [{ product_id: colaId, qty: 4 }, { product_id: waterId, qty: 3 }],
    });
    await repos.stockRecords.create({
      staff_id: staffId, direction: "out", timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(
      <View>
        <SummaryTab now={NOW} onOpenStaff={jest.fn()} />
        <Poster productId={colaId} />
      </View>,
      { repos },
    );
    await waitForSync(() => view.getByTestId("inventory-total"));
    // as-of-now global stock: cola net 3 + water net 3 = ¥24.00
    expect(money(view.getByTestId("inventory-total"))).toMatch(/24\.00/);

    // restock another cola×1 elsewhere — useCreateStockRecord invalidates qk.inventory
    fireEvent.press(view.getByTestId("poster"));

    // inventory revalues live: cola net 4 × 300¢ + water 1500¢ = 2700¢ = ¥27.00
    await waitForSync(() => expect(money(view.getByTestId("inventory-total"))).toMatch(/27\.00/));
  });
});

describe("SummaryTab — export config + inventory sheet (summary-range-export #02)", () => {
  it("exports 汇总-YYYYMMDD-YYYYMMDD.xlsx with 库存 sheet matching aggregate", async () => {
    const { repos, staffId, colaId, waterId } = await setup();
    await repos.stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: DAY(9, 10),
      items: [
        { product_id: colaId, qty: 4 },
        { product_id: waterId, qty: 3 },
      ],
    });
    await repos.stockRecords.create({
      staff_id: staffId,
      direction: "out",
      timestamp: DAY(9, 14),
      items: [{ product_id: colaId, qty: 1 }],
    });
    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("summary-export"));

    await fireEvent.press(view.getByTestId("summary-export"));
    await waitForSync(() => expect(mockRunExport).toHaveBeenCalled());
    const job = mockRunExport.mock.calls[0]![0]!;
    expect(job.filename).toBe(
      summaryExportFilename(
        new Date(2026, 6, 1, 0, 0, 0, 0).getTime(),
        new Date(2026, 6, 10, 23, 59, 59, 999).getTime(),
      ),
    );
    const wb = XLSX.read(await job.build(), { type: "base64" });
    expect(wb.SheetNames).toEqual(
      expect.arrayContaining(["库存", "入库明细"]),
    );
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["库存"]!, {
      header: 1,
    });
    expect(rows[0]).toEqual(["商品", "件数", "金额"]);
    expect(rows).toEqual(
      expect.arrayContaining([
        ["可乐", 3, "9.00"],
        ["矿泉水", 3, "15.00"],
        ["合计", 6, "24.00"],
      ]),
    );
    const inbound = XLSX.utils.sheet_to_json<unknown[]>(
      wb.Sheets["入库明细"]!,
      { header: 1 },
    );
    // Historical balance empty (no moves before last10Days from); restock on day 9.
    expect(inbound[0]).toEqual(["时间", "商品", "金额", "备注"]);
    expect(inbound[1]).toEqual([
      "",
      "",
      "0.00",
      expect.stringMatching(/^截至 .+ 00:00 的历史结余$/),
    ]);
    expect(inbound).toEqual(
      expect.arrayContaining([[expect.any(String), "可乐×4、矿泉水×3", "27.00", ""]]),
    );
  });

  it("persists sheet toggles immediately; disables export when none selected", async () => {
    const { repos } = await setup();
    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("summary-export-config"));

    await fireEvent.press(view.getByTestId("summary-export-config"));
    await waitForSync(() => view.getByTestId("export-config-modal"));
    expect(view.getByTestId("export-sheet-inventory").props.value).toBe(true);

    await fireEvent(
      view.getByTestId("export-sheet-inventory"),
      "valueChange",
      false,
    );
    await fireEvent(
      view.getByTestId("export-sheet-inbound"),
      "valueChange",
      false,
    );
    await fireEvent(
      view.getByTestId("export-sheet-topupCheckout"),
      "valueChange",
      false,
    );
    await fireEvent(
      view.getByTestId("export-sheet-topupCheckoutDetail"),
      "valueChange",
      false,
    );
    await flushPending();
    await waitForSync(() =>
      expect(
        view.getByTestId("summary-export").props.accessibilityState?.disabled,
      ).toBe(true),
    );

    expect(await repos.config.getSummaryExportSheets()).toEqual({
      inventory: false,
      inbound: false,
      topupCheckout: false,
      topupCheckoutDetail: false,
    });

    await fireEvent(
      view.getByTestId("export-sheet-inventory"),
      "valueChange",
      true,
    );
    await flushPending();
    await waitForSync(() =>
      expect(
        view.getByTestId("summary-export").props.accessibilityState?.disabled,
      ).toBe(false),
    );
  });

  it("disables 导出 while pending; toast.error on failure; cancel does not toast", async () => {
    const { repos } = await setup();
    const { view } = await renderTab(
      <SummaryTab now={NOW} onOpenStaff={jest.fn()} />,
      { repos },
    );
    await waitForSync(() => view.getByTestId("summary-export"));

    let resolveExport!: (uri: string) => void;
    mockRunExport.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveExport = resolve;
        }),
    );

    await fireEvent.press(view.getByTestId("summary-export"));
    await waitForSync(() => {
      expect(
        view.getByTestId("summary-export").props.accessibilityState?.disabled,
      ).toBe(true);
    });

    resolveExport("file:///cache/out.xlsx");
    await waitForSync(() => {
      expect(
        view.getByTestId("summary-export").props.accessibilityState?.disabled,
      ).toBe(false);
    });
    expect(view.queryByTestId("toast")).toBeNull();

    mockRunExport.mockRejectedValueOnce(new Error("boom"));
    await fireEvent.press(view.getByTestId("summary-export"));
    await waitForSync(() => expect(view.getByTestId("toast")).toBeTruthy());
  });
});
