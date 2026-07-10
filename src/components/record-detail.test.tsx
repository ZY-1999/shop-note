import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import { View } from "react-native";

import { RecordDetail } from "@/components/record-detail";
import { StaffDetail } from "@/components/staff-detail";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos, type Repos } from "@/data/composition";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * Spec #07 (staff-detail-record-edit-void) — the record detail / edit / void
 * flow, through the real data stack (ADR-0006: InMemoryAdapter, no mocked Repos).
 * `expo-router` is mocked (router.back on save/void); `@expo/ui`'s DateTimePicker
 * is mocked the same way as #06 (a stub exposing a backdate tap) because edit
 * mode reuses #06's RecordForm.
 *
 * Async mechanics (waitForSync / flushPending / QueryClient clear) live in
 * [testing/async.ts](../testing/async.ts) — see its header for the RNTL v14 + React 19
 * rationale first won in #06.
 */

const mockBack = jest.fn<() => void>();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

const mockBackdateMs = new Date("2020-01-01T00:00:00Z").getTime();
jest.mock("@expo/ui/community/datetime-picker", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Text, Pressable } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    __esModule: true,
    default: ({ value, testID, onValueChange }: { value: Date; testID: string; onValueChange?: (e: unknown, date: Date) => void }) =>
      React.createElement(
        View,
        { testID },
        React.createElement(Text, null, value ? new Date(value).toISOString() : ""),
        React.createElement(
          Pressable,
          { testID: `${testID}-backdate`, onPress: () => onValueChange?.({}, new Date(mockBackdateMs)) },
          React.createElement(Text, null, "backdate"),
        ),
      ),
  };
});

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = null;
});

beforeEach(() => {
  mockBack.mockClear();
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

/** Join MoneyText's two-children output (`["¥","12.00"]`) into one matchable string. */
function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
}

/**
 * Seed one member + one product + one record (default restock 'in' via admin -1,
 * qty 4 @ 300¢ → line ¥12.00), with a known timestamp + note so the header
 * assertions are deterministic. 'in' is owned by the admin `-1` (restock); 'out'
 * by the member — seedRecord routes the staff_id by direction so the new guard
 * holds without each caller repeating the rule.
 */
async function seedRecord(opts?: { qty?: number; price?: number; direction?: "in" | "out"; note?: string }) {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const product = await repos.products.create({
    title: "可乐",
    purchase_price: cents(opts?.price ?? 300),
    category: "饮料",
  });
  const direction = opts?.direction ?? "in";
  const { record, items } = await repos.stockRecords.create({
    staff_id: direction === "in" ? ADMIN_STAFF_ID : staff.id,
    direction,
    timestamp: 1_700_000_000_000,
    note: opts?.note ?? "单号A1",
    items: [{ product_id: product.id, qty: opts?.qty ?? 4 }],
  });
  return { repos, staffId: staff.id, productId: product.id, recordId: record.id, itemId: items[0].id };
}

describe("RecordDetail — frozen snapshot + header (spec #07 AC2)", () => {
  it("renders each line's frozen snapshot (title/unit_price/qty/line_amount) + the header", async () => {
    const { repos, recordId, itemId } = await seedRecord();
    const { view } = await renderDetail(<RecordDetail recordId={recordId} />, { repos });

    const line = await waitForSync(() => view.getByTestId(`line-${itemId}`));
    expect(line.props.children).toEqual(expect.objectContaining({})); // mounted
    // frozen per-line snapshot
    expect(view.getByText("可乐")).toBeTruthy(); // title
    expect(view.getByTestId(`unit-price-${itemId}`)).toBeTruthy();
    expect(money(view.getByTestId(`unit-price-${itemId}`))).toMatch(/3\.00/); // 300¢ unit price
    expect(view.getByText("4件")).toBeTruthy(); // qty
    expect(money(view.getByTestId(`line-amount-${itemId}`))).toMatch(/12\.00/); // 1200¢ line amount
    // header
    expect(view.getByText("入库")).toBeTruthy(); // direction
    expect(view.getByText("单号A1")).toBeTruthy(); // note
  });

  it("keeps the frozen snapshot after the product's price/title later change", async () => {
    const { repos, recordId, itemId } = await seedRecord();
    // a later product edit must NOT distort history — the snapshot is the source of truth here
    await repos.products.update(/* productId */ (await repos.products.list())[0].id, {
      title: "新名称",
      purchase_price: cents(999),
    });

    const { view } = await renderDetail(<RecordDetail recordId={recordId} />, { repos });
    await waitForSync(() => view.getByTestId(`line-${itemId}`));
    expect(view.getByText("可乐")).toBeTruthy(); // FROZEN title, not "新名称"
    expect(money(view.getByTestId(`unit-price-${itemId}`))).toMatch(/3\.00/); // FROZEN 300¢, not 999¢
    expect(money(view.getByTestId(`line-amount-${itemId}`))).toMatch(/12\.00/); // FROZEN 1200¢
  });
});

describe("RecordDetail — void (spec #07 AC4)", () => {
  it("confirms then voids; record stays viewable, drops from the balance, and is audited", async () => {
    const { repos, staffId, recordId } = await seedRecord();
    const { view } = await renderDetail(<RecordDetail recordId={recordId} />, { repos });

    fireEvent.press(await waitForSync(() => view.getByTestId("void"))); // ask to void → confirm step
    fireEvent.press(await waitForSync(() => view.getByTestId("void-confirm"))); // confirm

    await waitForSync(() => expect(view.getByText("已作废")).toBeTruthy()); // still viewable + flagged

    const detail = await repos.stockRecords.getById(recordId);
    expect(detail?.record.voided_at).not.toBeNull(); // soft-deleted, data preserved

    const agg = await repos.inventory.shopAggregate();
    expect(agg).toEqual([]); // voided record excluded → global stock empty

    const voids = await repos.audit.queryTimeline({ entity_type: "stock_record", action: "void" });
    expect(voids.some((e) => e.entity_id === recordId)).toBe(true); // void landed in the audit log
  });

  it("cancel at the confirm step does not void", async () => {
    const { repos, recordId } = await seedRecord();
    const { view } = await renderDetail(<RecordDetail recordId={recordId} />, { repos });

    fireEvent.press(await waitForSync(() => view.getByTestId("void")));
    fireEvent.press(await waitForSync(() => view.getByTestId("void-cancel")));

    const detail = await repos.stockRecords.getById(recordId);
    expect(detail?.record.voided_at).toBeNull(); // not voided
  });
});

describe("RecordDetail — edit resnapshot-merge (spec #07 AC3)", () => {
  it("resnapshots touched lines at the current price; untouched lines keep their frozen snapshot", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const staff = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "" });
    const water = await repos.products.create({ title: "矿泉水", purchase_price: cents(500), category: "" });
    // post: member out cola ×2 (snapshot 300¢/600¢), water ×3 (snapshot 500¢/1500¢)
    const { record, items } = await repos.stockRecords.create({
      staff_id: staff.id,
      direction: "out",
      timestamp: 1_700_000_000_000,
      note: "原单",
      items: [
        { product_id: cola.id, qty: 2 },
        { product_id: water.id, qty: 3 },
      ],
    });
    const colaItem = items.find((i) => i.product_id === cola.id)!;
    const waterItem = items.find((i) => i.product_id === water.id)!;
    // later, cola's price changes — a TOUCHED cola line must resnapshot at THIS price
    await repos.products.update(cola.id, { purchase_price: cents(700) });

    const { view } = await renderDetail(<RecordDetail recordId={record.id} />, { repos });

    // enter edit mode (reuses #06's form, preloaded with the record's lines + ids)
    fireEvent.press(await waitForSync(() => view.getByTestId("edit")));
    // change ONLY cola's qty (2 → 5); leave the water line untouched
    const colaLine = await waitForSync(() => view.getByText("可乐")); // form preloaded the line
    expect(colaLine).toBeTruthy();
    fireEvent.changeText(view.getByTestId("qty-0"), "5"); // cola is the first preloaded line
    await flushPending(); // let setQty commit before submit reads it (same stale-closure guard as #06)
    fireEvent.press(view.getByTestId("submit"));

    // after save the detail flips back to view → refetch → new snapshots rendered
    await waitForSync(() => view.getByTestId(`line-${colaItem.id}`));

    const updated = await repos.stockRecords.getById(record.id);
    const newCola = updated!.items.find((i) => i.product_id === cola.id)!;
    const newWater = updated!.items.find((i) => i.product_id === water.id)!;
    // touched: cola resnapshotted at the CURRENT price 700¢, qty 5 → 3500¢; id preserved
    expect(newCola.id).toBe(colaItem.id);
    expect(newCola.unit_price).toBe(cents(700));
    expect(newCola.qty).toBe(5);
    expect(newCola.line_amount).toBe(cents(3500));
    // untouched: water KEEPS its original posting-time snapshot (500¢ × 3 = 1500¢)
    expect(newWater.id).toBe(waterItem.id);
    expect(newWater.unit_price).toBe(cents(500));
    expect(newWater.qty).toBe(3);
    expect(newWater.line_amount).toBe(cents(1500));

    // a field-level diff landed in the audit timeline
    const updates = await repos.audit.queryTimeline({ entity_type: "stock_record", action: "update" });
    expect(updates.some((e) => e.entity_id === record.id)).toBe(true);
  });
});

describe("RecordDetail — cross-view refresh (spec #07 AC5)", () => {
  it("a void refreshes other open views through React Query (no manual refetch)", async () => {
    const { repos, staffId, recordId } = await seedRecord({ direction: "out" });
    // Mount BOTH the staff detail (subscribes to records) and the record detail
    // (hosts the void) under one providers/queryClient tree — proving the
    // mutation's onSuccess invalidation flows through React Query to the other
    // subscriber. (edit shares the identical invalidation keys, so void covers it.)
    const { view } = await renderDetail(
      <View>
        <StaffDetail staffId={staffId} onOpenRecord={jest.fn()} />
        <RecordDetail recordId={recordId} />
      </View>,
      { repos },
    );

    // Staff detail's day sections are collapsed-by-default — expand the day
    // holding this member's 'out' record to surface its history row.
    await waitForSync(() => view.getAllByTestId(/^day-/)[0]);
    await fireEvent.press(view.getAllByTestId(/^day-/)[0]);
    await flushPending();
    expect(view.getByTestId(`history-${recordId}`)).toBeTruthy();

    // void via the record detail
    fireEvent.press(await waitForSync(() => view.getByTestId("void")));
    fireEvent.press(await waitForSync(() => view.getByTestId("void-confirm")));

    // the history row disappears, refetched live via the shared queryClient's
    // invalidation (voided records excluded from the member's history on re-read).
    await waitForSync(() => expect(() => view.getByTestId(`history-${recordId}`)).toThrow());
  });
});


