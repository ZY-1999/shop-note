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
 * Spec #07 (staff-detail-record-edit-void) — the look-back entry points, through
 * the real data stack (ADR-0006: InMemoryAdapter, no mocked Repos). No nav or
 * native deps are touched by StaffDetail itself, so nothing is mocked here.
 *
 * Async mechanics (waitForSync / flushPending / QueryClient clear) live in
 * [testing/async.ts](../testing/async.ts) — see its header for the RNTL v14 + React 19
 * rationale first won in #06.
 */

/** The QueryClient backing the current render — cleared after each test for isolation. */
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

/** Seed one staff + one product + one 'in' record (qty 4 @ 300¢ → ¥12.00). */
async function seed() {
  const repos = setupRepos(new InMemoryAdapter());
  const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
  const product = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
  const { record } = await repos.stockRecords.create({
    staff_id: staff.id,
    direction: "in",
    items: [{ product_id: product.id, qty: 4 }],
  });
  return { repos, staffId: staff.id, productId: product.id, recordId: record.id };
}

describe("StaffDetail — holdings + history (spec #07 AC1)", () => {
  it("shows the staff's per-product holdings and movement history", async () => {
    const { repos, staffId, productId, recordId } = await seed();
    const onOpenRecord = jest.fn();
    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={onOpenRecord} />,
      { repos },
    );

    expect(await waitForSync(() => view.getByText("张三"))).toBeTruthy(); // staff name header
    expect(view.getByTestId(`holding-${productId}`)).toBeTruthy(); // holdings section renders the balance
    expect(view.getByText("¥12.00")).toBeTruthy(); // holding amount = 300¢ × 4
    expect(view.getByTestId(`history-${recordId}`)).toBeTruthy(); // history section renders the record
    expect(view.getByText("入库")).toBeTruthy(); // history shows the direction
  });

  it("lists history newest-first", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const staff = await repos.staff.create({ name: "张三", phone: "", notes: "" });
    const product = await repos.products.create({ title: "可乐", purchase_price: cents(100), category: "" });
    const older = await repos.stockRecords.create({
      staff_id: staff.id,
      direction: "in",
      timestamp: 1_000,
      items: [{ product_id: product.id, qty: 1 }],
    });
    const newer = await repos.stockRecords.create({
      staff_id: staff.id,
      direction: "out",
      timestamp: 5_000,
      items: [{ product_id: product.id, qty: 1 }],
    });

    const { view } = await renderDetail(
      <StaffDetail staffId={staff.id} onOpenRecord={jest.fn()} />,
      { repos },
    );

    // Both rows present, then assert the newer (out) row comes before the older (in) row.
    const newerRow = await waitForSync(() => view.getByTestId(`history-${newer.record.id}`));
    const olderRow = view.getByTestId(`history-${older.record.id}`);
    const rows = view.getAllByTestId(/history-/);
    expect(rows.indexOf(newerRow)).toBeLessThan(rows.indexOf(olderRow));
  });

  it("opens the record detail when a history row is tapped", async () => {
    const { repos, staffId, recordId } = await seed();
    const onOpenRecord = jest.fn();
    const { view } = await renderDetail(
      <StaffDetail staffId={staffId} onOpenRecord={onOpenRecord} />,
      { repos },
    );

    fireEvent.press(await waitForSync(() => view.getByTestId(`history-${recordId}`)));
    expect(onOpenRecord).toHaveBeenCalledWith(recordId);
  });
});
