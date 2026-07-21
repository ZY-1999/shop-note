import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react-native";
import type { ReactElement } from "react";

import BookkeepingTab from "@/app/(tabs)/bookkeeping/index";
import { flushPending, waitForSync } from "@/testing/async";
import {
  renderWithProviders,
  type RenderWithProvidersResult,
} from "@/testing/render";

/**
 * 记账 screen through the real data stack (ADR-0006: InMemoryAdapter, no mocked
 * Repos). Async mechanics (waitForSync / flushPending / QueryClient clear) live
 * in [testing/async.ts](../testing/async.ts). `expo-router` is mocked — push
 * targets are navigation contracts.
 *
 * Current surface: searchable active-member list (zero-record included);
 * per-row [充值] → `/topup-form`, [出库] → `/record-form`, row tap → `/staff/[id]`.
 * No 入库 affordance / per-staff 库存 line (stock-balance-refactor).
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

describe("记账 screen — member list + search", () => {
  it("lists every active member, including zero-record members", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.staff.create({ name: "李四", phone: "139", notes: "" }); // no records at all
      },
    });
    await waitForSync(() => view.getByText("张三"));
    expect(view.getByText("李四")).toBeTruthy();
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

  it("uses the 会员 search placeholder", async () => {
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
      },
    });
    await waitForSync(() => view.getByTestId("staff-search"));
    expect(view.getByPlaceholderText("搜索会员姓名或电话")).toBeTruthy();
  });
});

describe("记账 screen — row navigation", () => {
  async function seedOneMember() {
    let staffId = "";
    const { view } = await renderBook(<BookkeepingTab />, {
      seed: async (repos) => {
        const s = await repos.staff.create({
          name: "张三",
          phone: "138",
          notes: "",
        });
        staffId = s.id;
      },
    });
    await waitForSync(() => view.getByText("张三"));
    return { view, staffId };
  }

  it("出库 carries staff_id + direction out; no 入库 button or 库存 line", async () => {
    const { view, staffId } = await seedOneMember();

    expect(view.queryByTestId(`in-${staffId}`)).toBeNull();
    expect(view.queryByText(/库存：/)).toBeNull();

    await fireEvent.press(view.getByTestId(`out-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/record-form",
      params: { staff_id: staffId, direction: "out" },
    });
  });

  it("充值 navigates to /topup-form with staff_id", async () => {
    const { view, staffId } = await seedOneMember();

    await fireEvent.press(view.getByTestId(`topup-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/topup-form",
      params: { staff_id: staffId },
    });
  });

  it("row tap opens member detail at /staff/[id]", async () => {
    const { view, staffId } = await seedOneMember();

    await fireEvent.press(view.getByTestId(`row-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/[id]",
      params: { id: staffId },
    });
  });
});
