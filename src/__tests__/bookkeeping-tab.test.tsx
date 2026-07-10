import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";

import BookkeepingTab from "@/app/bookkeeping/index";
import { renderWithProviders, type RenderWithProvidersResult } from "@/testing/render";
import { flushPending, waitForSync } from "@/testing/async";

/**
 * 记账 screen through the real data stack (ADR-0006: InMemoryAdapter, no mocked
 * Repos). Async mechanics (waitForSync / flushPending / QueryClient clear) live
 * in [testing/async.ts](../testing/async.ts). `expo-router` is mocked — the push
 * is a navigation concern.
 *
 * stock-balance-refactor placeholder skeleton: members no longer hold stock, so
 * the row lost its per-staff 「库存：m件/n种 金额」 line and its 入库 affordance.
 * The 余额 display + 充值 affordance land in spec 03; spec 02 only proves the
 * skeleton — search, the member list (all active members, zero-record included),
 * and the 出库 action that carries the staff id.
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

describe("记账 screen — skeleton (stock-balance-refactor)", () => {
  it("lists every active member, including zero-record members", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.staff.create({ name: "李四", phone: "139", notes: "" }); // no records at all
      },
    });
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("李四")).toBeTruthy(); // zero-record still shown
  });

  it("search narrows active members by name", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.staff.create({ name: "李四", phone: "139", notes: "" });
      },
    });
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("李四")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitForSync(() => view.getByText("张三"));
    await waitForSync(() => expect(() => view.getByText("李四")).toThrow());
  });

  it("uses the 会员 search placeholder (员工→会员 display rename)", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
      },
    });
    await waitForSync(() => view.getByTestId("staff-search"));
    expect(view.getByPlaceholderText("搜索会员姓名或电话")).toBeTruthy();
  });

  it("出库 carries the staff_id + direction out; no 入库 button or 库存 line", async () => {
    let staffId = "";
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const s = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        staffId = s.id;
      },
    });
    await waitForSync(() => view.getByText("张三"));

    // the 入库 affordance + per-staff 库存 line are gone (spec 03 owns 余额).
    expect(view.queryByTestId(`in-${staffId}`)).toBeNull();
    expect(view.queryByText(/库存：/)).toBeNull();

    await fireEvent.press(view.getByTestId(`out-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/bookkeeping/record-form",
      params: { staff_id: staffId, direction: "out" },
    });
  });
});
