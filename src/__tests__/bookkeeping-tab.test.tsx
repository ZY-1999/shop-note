import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";

import BookkeepingTab from "@/app/bookkeeping/index";
import { cents } from "@/data/primitives";
import { renderWithProviders } from "@/testing/render";

/**
 * Spec #05 (bookkeeping-staff-list) — the 记账 screen through the real data stack
 * (ADR-0006: InMemoryAdapter, no mocked Repos). `expo-router` is the one thing
 * mocked — the push is a navigation concern, asserted here; the targets (#6 form,
 * #7 staff detail) are built later.
 *
 * The mock-router factory below is shared across every test in this file; tests
 * that don't press nav buttons simply never assert on it.
 */
const mockPush = jest.fn<(href: unknown) => void>();
jest.mock("expo-router", () => ({
  router: { push: (href: unknown) => mockPush(href) },
}));

beforeEach(() => {
  mockPush.mockClear();
});

describe("记账 screen — search narrows the list (spec #05 AC1)", () => {
  it("shows all active staff, then narrows by name as the operator types", async () => {
    const { view } = await renderWithProviders(<BookkeepingTab />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.staff.create({ name: "李四", phone: "139", notes: "" });
      },
    });
    // On load both active staff show (useStaff → list).
    expect(await view.findByText("张三")).toBeTruthy();
    expect(await view.findByText("李四")).toBeTruthy();

    // Typing a search swaps to useStaff({ search }) → 李四 drops out.
    fireEvent.changeText(view.getByTestId("staff-search"), "张");
    await waitFor(() => expect(view.queryByText("李四")).toBeNull());
    expect(view.getByText("张三")).toBeTruthy();
  });
});

describe("记账 screen — per-staff summary from the one-pass rollup (spec #05 AC2)", () => {
  it("renders a seeded record's variety / qty / amount on the row", async () => {
    const { view } = await renderWithProviders(<BookkeepingTab />, {
      seed: async (repos) => {
        const product = await repos.products.create({
          title: "可乐",
          purchase_price: cents(300),
          category: "饮料",
        });
        const staff = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        await repos.stockRecords.create({
          staff_id: staff.id,
          direction: "in",
          items: [{ product_id: product.id, qty: 4 }],
        });
      },
    });
    expect(await view.findByText("张三")).toBeTruthy();
    // staffSummaries() one-pass rollup: 1 variety / 4 qty / 300¢×4 = 1200¢ = ¥12.00
    expect(await view.findByText("1种 / 4件")).toBeTruthy();
    expect(view.getByText("¥12.00")).toBeTruthy();
  });
});

describe("记账 screen — 入库/出库 carry staff_id + direction (spec #05 AC5)", () => {
  it("pushes the record form prefilled with the staff + direction", async () => {
    let staffId = "";
    const { view } = await renderWithProviders(<BookkeepingTab />, {
      seed: async (repos) => {
        const s = await repos.staff.create({ name: "张三", phone: "138", notes: "" });
        staffId = s.id;
      },
    });
    await view.findByText("张三");

    fireEvent.press(view.getByTestId(`in-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/bookkeeping/record-form",
      params: { staff_id: staffId, direction: "in" },
    });

    fireEvent.press(view.getByTestId(`out-${staffId}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/bookkeeping/record-form",
      params: { staff_id: staffId, direction: "out" },
    });
  });
});
