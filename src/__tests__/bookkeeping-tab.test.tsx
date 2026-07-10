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
 * Revised (2026-07-10, post-Stage-3): the default list now shows ALL active staff
 * — including zero-record / zero-inventory staff — so a brand-new employee is
 * visible without searching. This reverses the original AC3 ("hide zero-inventory
 * in the default view"); AC4's "first 入库 is reachable" guarantee now holds in
 * the default list directly. Search still narrows by name; each row is the merged
 * `库存：m件/n种 金额` line (AC1); the out-action is 出单 (AC2/AC5). The one-pass
 * `staffSummaries()` rollup is consumed unchanged; StaffRow renders
 * `库存：0件/0种 ¥0.00` when there is no summary.
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

describe("记账 screen — default list shows ALL active staff, including zero-record (spec #02 AC3, revised)", () => {
  it("shows a no-record staff in the default (no-search) view with zeros, not hidden", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const zhang = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.staff.create({ name: "李四", phone: "139", notes: "" }); // no records at all
        await repos.stockRecords.create({ staff_id: zhang.id, direction: "in", items: [{ product_id: pid, qty: 2 }] });
      },
    });
    await waitForSync(() => view.getByText("张三")); // has inventory → present
    await waitForSync(() => view.getByText("李四")); // no records → still present (revised: no longer hidden)
    expect(view.getByText("库存：0件/0种")).toBeTruthy(); // renders zeros, not filtered out
  });

  it("also shows a staff whose balance nets to zero (records exist but qty nets to 0)", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const pid = await seedProduct(repos);
        const wang = await repos.staff.create({ name: "王五", phone: "137", notes: "" });
        // 王五 in 3 / out 3 → net zero (staffSummaries still returns a zero-qty row).
        await repos.stockRecords.create({ staff_id: wang.id, direction: "in", items: [{ product_id: pid, qty: 3 }] });
        await repos.stockRecords.create({ staff_id: wang.id, direction: "out", items: [{ product_id: pid, qty: 3 }] });
      },
    });
    await waitForSync(() => view.getByText("王五")); // net-zero balance → still shown (revised)
  });
});

describe("记账 screen — zero-record staff's 入库 is reachable in the default list (spec #02 AC4, revised)", () => {
  it("shows a no-record staff by default and exposes their 入库 button (no search needed)", async () => {
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
    // Default view (no search): 张三 shows with zeros and a reachable 入库 button.
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("库存：0件/0种")).toBeTruthy();
    expect(view.getByText("¥0.00")).toBeTruthy();
    expect(view.getByTestId(`in-${zhangId}`)).toBeTruthy(); // first 入库 reachable without searching
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

describe("记账 screen — member rename (member-rename-level #02)", () => {
  it("uses the 会员 search placeholder (员工→会员 display rename)", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
      },
    });
    await waitForSync(() => view.getByTestId("staff-search"));
    expect(view.getByPlaceholderText("搜索会员姓名或电话")).toBeTruthy();
    expect(view.queryByPlaceholderText("搜索员工姓名或电话")).toBeNull();
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
