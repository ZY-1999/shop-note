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
 * Spec #08 (summary-tab) — the 汇总 supervision tab, through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). Pure composition of the derived
 * reads (shopAggregate / staffSummaries / dailyFlow / balance) — no new read API,
 * no writes. Async mechanics (waitForSync / flushPending / QueryClient clear) live
 * in [testing/async.ts](../testing/async.ts) (first won in #06, shared by #07).
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

const T1 = new Date("2026-07-09T10:00:00").getTime();
const T2 = new Date("2026-07-09T14:00:00").getTime();

/**
 * Seed: one staff, two products. An `in` of cola×4 + water×3, then an `out` of
 * cola×1. shopAggregate → cola net 3 (¥9.00), water net 3 (¥15.00), grand ¥24.00.
 * staffSummaries → 张三: 2种 / 6件 / ¥24.00. dailyFlow (same day) → in ¥27.00 / out ¥3.00.
 */
async function seed() {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
  const water = await repos.products.create({ title: "矿泉水", purchase_price: cents(500), category: "饮料" });
  await repos.stockRecords.create({
    staff_id: staff.id,
    direction: "in",
    timestamp: T1,
    items: [
      { product_id: cola.id, qty: 4 },
      { product_id: water.id, qty: 3 },
    ],
  });
  await repos.stockRecords.create({
    staff_id: staff.id,
    direction: "out",
    timestamp: T2,
    items: [{ product_id: cola.id, qty: 1 }],
  });
  return { repos, staffId: staff.id, colaId: cola.id, waterId: water.id };
}

describe("SummaryTab — segmented switcher (spec #08 AC1)", () => {
  it("renders four segments with overview as the default view", async () => {
    const { repos, colaId } = await seed();
    const { view } = await renderTab(<SummaryTab onOpenStaff={jest.fn()} />, { repos });

    expect(view.getByTestId("seg-overview")).toBeTruthy();
    expect(view.getByTestId("seg-dailyFlow")).toBeTruthy();
    expect(view.getByTestId("seg-byStaff")).toBeTruthy();
    expect(view.getByTestId("seg-byProduct")).toBeTruthy();
    // overview is the default → its view (and the seeded product row) render first
    expect(await waitForSync(() => view.getByTestId("view-overview"))).toBeTruthy();
    expect(view.getByTestId(`overview-product-${colaId}`)).toBeTruthy();
  });

  it("switching the segment swaps the active view", async () => {
    const { repos } = await seed();
    const { view } = await renderTab(<SummaryTab onOpenStaff={jest.fn()} />, { repos });
    await waitForSync(() => view.getByTestId("view-overview"));

    fireEvent.press(view.getByTestId("seg-dailyFlow"));
    await waitForSync(() => view.getByTestId("view-dailyFlow"));
    expect(() => view.getByTestId("view-overview")).toThrow(); // overview unmounted
  });
});

describe("SummaryTab — overview: per-product totals + grand total (spec #08 AC2)", () => {
  it("renders each product's total qty + amount and a grand total", async () => {
    const { repos, colaId, waterId } = await seed();
    const { view } = await renderTab(<SummaryTab onOpenStaff={jest.fn()} />, { repos });

    await waitForSync(() => view.getByTestId("view-overview"));
    // cola: net in4-out1 = 3 × 300¢ = ¥9.00; water: in3 × 500¢ = ¥15.00
    expect(money(view.getByTestId(`overview-amount-${colaId}`))).toMatch(/9\.00/);
    expect(view.getByTestId(`overview-qty-${colaId}`).props.children).toContain(3);
    expect(money(view.getByTestId(`overview-amount-${waterId}`))).toMatch(/15\.00/);
    // grand total = 900¢ + 1500¢ = 2400¢ = ¥24.00
    expect(money(view.getByTestId("overview-grand-total"))).toMatch(/24\.00/);
  });
});

describe("SummaryTab — daily flow (spec #08 AC3)", () => {
  it("renders rows of (day × staff) with in/out amounts, newest day first", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const staff = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "" });
    const dayA = new Date("2026-07-01T10:00:00").getTime(); // older
    const dayB = new Date("2026-07-09T10:00:00").getTime(); // newer
    await repos.stockRecords.create({ staff_id: staff.id, direction: "in", timestamp: dayA, items: [{ product_id: cola.id, qty: 2 }] });
    await repos.stockRecords.create({ staff_id: staff.id, direction: "out", timestamp: dayB, items: [{ product_id: cola.id, qty: 1 }] });

    const { view } = await renderTab(<SummaryTab onOpenStaff={jest.fn()} />, { repos });
    fireEvent.press(await waitForSync(() => view.getByTestId("seg-dailyFlow")));

    const newer = await waitForSync(() => view.getByTestId(`flowrow-2026-07-09-${staff.id}`));
    const older = view.getByTestId(`flowrow-2026-07-01-${staff.id}`);
    const rows = view.getAllByTestId(/^flowrow-/);
    expect(rows.indexOf(newer)).toBeLessThan(rows.indexOf(older)); // newest day first
    // amounts: dayA in = cola×2 × 300¢ = ¥6.00; dayB out = cola×1 × 300¢ = ¥3.00
    expect(money(view.getByTestId(`flow-in-2026-07-01-${staff.id}`))).toMatch(/6\.00/);
    expect(money(view.getByTestId(`flow-out-2026-07-09-${staff.id}`))).toMatch(/3\.00/);
  });

  it("amounts are the frozen snapshot — unchanged by a later price edit", async () => {
    const { repos, staffId, colaId } = await seed(); // in: cola×4 + water×3 → in_amount 2700¢ = ¥27.00
    // later, cola's price changes — dailyFlow must NOT revalue (frozen line_amount, not current price)
    await repos.products.update(colaId, { purchase_price: cents(999) });

    const { view } = await renderTab(<SummaryTab onOpenStaff={jest.fn()} />, { repos });
    fireEvent.press(await waitForSync(() => view.getByTestId("seg-dailyFlow")));
    await waitForSync(() => view.getByTestId(`flowrow-2026-07-09-${staffId}`));
    // STILL ¥27.00 (frozen snapshot), not revalued to 999×4 + 500×3
    expect(money(view.getByTestId(`flow-in-2026-07-09-${staffId}`))).toMatch(/27\.00/);
  });
});

describe("SummaryTab — by staff (spec #08 AC4)", () => {
  it("lists each staff's variety/qty/amount and opens their detail on tap", async () => {
    const { repos, staffId } = await seed(); // 张三: 2种 / 6件 / ¥24.00
    const onOpenStaff = jest.fn();
    const { view } = await renderTab(<SummaryTab onOpenStaff={onOpenStaff} />, { repos });

    fireEvent.press(await waitForSync(() => view.getByTestId("seg-byStaff")));
    await waitForSync(() => view.getByTestId(`bystaff-row-${staffId}`));
    // staffSummaries() one-pass rollup: 2 varieties / 6 qty / 2400¢ = ¥24.00
    expect(view.getByText("2种 / 6件")).toBeTruthy();
    expect(view.getByText("¥24.00")).toBeTruthy();

    fireEvent.press(view.getByTestId(`bystaff-row-${staffId}`));
    expect(onOpenStaff).toHaveBeenCalledWith(staffId);
  });
});

describe("SummaryTab — by product (spec #08 AC5)", () => {
  it("lists each product's total qty/amount and drills into a per-staff breakdown on tap", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const alice = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    const bob = await repos.staff.create({ name: "李四", phone: "", notes: "" });
    const cola = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "" });
    await repos.stockRecords.create({ staff_id: alice.id, direction: "in", items: [{ product_id: cola.id, qty: 4 }] });
    await repos.stockRecords.create({ staff_id: bob.id, direction: "in", items: [{ product_id: cola.id, qty: 2 }] });

    const { view } = await renderTab(<SummaryTab onOpenStaff={jest.fn()} />, { repos });
    fireEvent.press(await waitForSync(() => view.getByTestId("seg-byProduct")));
    await waitForSync(() => view.getByTestId(`byproduct-row-${cola.id}`));
    // shopAggregate: cola net 6 × 300¢ = ¥18.00
    expect(money(view.getByTestId(`byproduct-amount-${cola.id}`))).toMatch(/18\.00/);

    // tap → per-staff breakdown (a conditional useBalance per staff row, only rendered when tapped)
    fireEvent.press(view.getByTestId(`byproduct-row-${cola.id}`));
    await waitForSync(() => view.getByTestId(`byproduct-staff-${cola.id}-${alice.id}`));
    // alice: 4 × 300¢ = ¥12.00; bob: 2 × 300¢ = ¥6.00
    expect(money(view.getByTestId(`byproduct-staff-amount-${cola.id}-${alice.id}`))).toMatch(/12\.00/);
    expect(money(view.getByTestId(`byproduct-staff-amount-${cola.id}-${bob.id}`))).toMatch(/6\.00/);
  });
});

/** Test-only writer: posts an `in` record through the real mutation, so the suite
 *  can prove a write ELSEWHERE refreshes the open 汇总 view (AC6) — no manual refetch. */
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

describe("SummaryTab — cross-view refresh (spec #08 AC6)", () => {
  it("a post elsewhere refreshes the open 汇总 view without manual refetch", async () => {
    const { repos, staffId, colaId } = await seed(); // overview grand total ¥24.00 (2400¢)
    const { view } = await renderTab(
      <View>
        <SummaryTab onOpenStaff={jest.fn()} />
        <Poster staffId={staffId} productId={colaId} />
      </View>,
      { repos },
    );
    await waitForSync(() => view.getByTestId("overview-grand-total"));
    expect(money(view.getByTestId("overview-grand-total"))).toMatch(/24\.00/);

    // post another cola×1 elsewhere — useCreateStockRecord invalidates qk.inventory
    fireEvent.press(view.getByTestId("poster"));

    // grand total revalues live: 2400¢ + 300¢ = 2700¢ = ¥27.00
    await waitForSync(() => expect(money(view.getByTestId("overview-grand-total"))).toMatch(/27\.00/));
  });
});




