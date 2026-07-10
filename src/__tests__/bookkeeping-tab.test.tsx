import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";

import BookkeepingTab from "@/app/bookkeeping/index";
import type { Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * Spec #02 (page-refactor) — the 记账 screen through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). Async mechanics (waitForSync /
 * flushPending / QueryClient clear) live in [testing/async.ts](../testing/async.ts).
 * `expo-router` is the one thing mocked — the push is a navigation concern.
 *
 * New in #02: the default list shows only staff with non-zero inventory (AC3);
 * search still reveals zero-inventory staff so an operator can give them a first
 * 入库 (AC4); each row is the merged `库存：m件/n种 金额` line (AC1); the out-action
 * is 出单 (AC2/AC5). The one-pass `staffSummaries()` rollup is consumed unchanged.
 */
const mockPush = jest.fn<(href: unknown) => void>();
jest.mock("expo-router", () => ({
  router: { push: (href: unknown) => mockPush(href) },
}));

let activeQueryClient: QueryClient | null = null;

afterEach(() => {
  // Not async — see async.ts header / manage-tab suite for the overlapping-act rationale.
  activeQueryClient?.clear();
  activeQueryClient = null;
});

beforeEach(() => {
  mockPush.mockClear();
});

async function renderBook(
  ui: ReactElement,
  opts?: Parameters<typeof renderWithProviders>[1],
): Promise<RenderWithProvidersResult> {
  const res = await renderWithProviders(ui, opts);
  activeQueryClient = res.queryClient;
  await flushPending();
  return res;
}

/** A seeded ¥1.00 product every test can post against. */
async function seedProduct(repos: Repos): Promise<string> {
  const p = await repos.products.create({ title: "可乐", purchase_price: cents(100), category: "饮料" });
  return p.id;
}

describe("记账 screen — default list shows only staff with inventory (spec #02 AC3)", () => {
  it("hides a no-record staff in the default (no-search) view", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const zhang = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.staff.create({ name: "李四", phone: "139", notes: "" }); // no records
        await repos.stockRecords.create({ staff_id: zhang.id, direction: "in", items: [{ product_id: pid, qty: 2 }] });
      },
    });
    await waitForSync(() => view.getByText("张三")); // 张三 has inventory → present
    await waitForSync(() => expect(() => view.getByText("李四")).toThrow()); // 李四 → hidden
  });

  it("also hides a staff whose balance nets to zero (records exist but variety/qty are 0)", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const wang = await repos.staff.create({ name: "王五", phone: "137", notes: "" });
        const li = await repos.staff.create({ name: "李六", phone: "136", notes: "" });
        // 王五 in 3 / out 3 → net zero (staffSummaries still returns a zero row); 李六 is the inventory anchor.
        await repos.stockRecords.create({ staff_id: wang.id, direction: "in", items: [{ product_id: pid, qty: 3 }] });
        await repos.stockRecords.create({ staff_id: wang.id, direction: "out", items: [{ product_id: pid, qty: 3 }] });
        await repos.stockRecords.create({ staff_id: li.id, direction: "in", items: [{ product_id: pid, qty: 5 }] });
      },
    });
    await waitForSync(() => view.getByText("李六")); // anchor → list rendered & queries resolved
    await waitForSync(() => expect(() => view.getByText("王五")).toThrow()); // zero balance → hidden
  });
});

describe("记账 screen — search reveals zero-inventory staff for a first 入库 (spec #02 AC4)", () => {
  it("reveals a no-movement staff on search and exposes their 入库 button", async () => {
    let zhangId = "";
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const zhang = await repos.staff.create({ name: "张三", phone: "138", notes: "" }); // no records
        const li = await repos.staff.create({ name: "李六", phone: "136", notes: "" }); // inventory anchor
        await repos.stockRecords.create({ staff_id: li.id, direction: "in", items: [{ product_id: pid, qty: 1 }] });
        zhangId = zhang.id;
      },
    });
    // Default view: anchor renders, 张三 (zero inventory) hidden.
    await waitForSync(() => view.getByText("李六"));
    await waitForSync(() => expect(() => view.getByText("张三")).toThrow());

    // Search → useStaff({ search }) result is NOT zero-filtered → 张三 reappears.
    await fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("库存：0件/0种")).toBeTruthy();
    expect(view.getByText("¥0.00")).toBeTruthy();
    expect(view.getByTestId(`in-${zhangId}`)).toBeTruthy(); // first 入库 reachable
  });
});

describe("记账 screen — search narrows active staff by name (spec #02, no regression)", () => {
  it("shows every inventory staff, then narrows by name as the operator types", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const a = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        const b = await repos.staff.create({ name: "李四", phone: "139", notes: "" });
        await repos.stockRecords.create({ staff_id: a.id, direction: "in", items: [{ product_id: pid, qty: 1 }] });
        await repos.stockRecords.create({ staff_id: b.id, direction: "in", items: [{ product_id: pid, qty: 1 }] });
      },
    });
    // Both have inventory → both show in the default list.
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("李四")).toBeTruthy();

    // Typing a search narrows to the matching staff.
    await fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitForSync(() => view.getByText("张三")); // search resolved → 张三 present
    await waitForSync(() => expect(() => view.getByText("李四")).toThrow()); // …and 李四 gone
  });
});

describe("记账 screen — merged row from the one-pass rollup (spec #02 AC1)", () => {
  it("renders 库存：{qty}件/{variety}种 + amount on the row", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const p = await repos.products.create({ title: "可乐", purchase_price: cents(300), category: "饮料" });
        const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.stockRecords.create({ staff_id: staff.id, direction: "in", items: [{ product_id: p.id, qty: 4 }] });
      },
    });
    await waitForSync(() => view.getByText("张三"));
    // staffSummary one-pass rollup: 1 variety / 4 qty / 300¢×4 = 1200¢ = ¥12.00
    expect(view.getByText("库存：4件/1种")).toBeTruthy();
    expect(view.getByText("¥12.00")).toBeTruthy();
  });
});

describe("记账 screen — 入库/出单 carry staff_id + direction (spec #02 AC5)", () => {
  it("pushes the record form prefilled with the staff + direction", async () => {
    let staffId = "";
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const s = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        staffId = s.id;
        // Give 张三 stock so the row shows in the default (zero-inventory-filtered) list.
        await repos.stockRecords.create({ staff_id: s.id, direction: "in", items: [{ product_id: pid, qty: 2 }] });
      },
    });
    await waitForSync(() => view.getByText("张三"));

    await fireEvent.press(view.getByTestId(`in-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/bookkeeping/record-form",
      params: { staff_id: staffId, direction: "in" },
    });

    await fireEvent.press(view.getByTestId(`out-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/bookkeeping/record-form",
      params: { staff_id: staffId, direction: "out" },
    });
  });
});
