import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

import { StaffRow } from "@/components/staff-row";
import type { Staff } from "@/data/staff";

/**
 * Spec #05 — StaffRow, the 记账 list row. Asserts the summary display (AC2), the
 * 欠货 badge + MoneyText on negative (AC3/AC4), and that 入库/出库/row taps carry
 * the staff id to their callbacks (AC5 — the screen wires these to the router).
 */
const staff: Staff = {
  id: "s1", name: "张三", phone: "1", notes: "", voided_at: null, created_at: 0, updated_at: 0,
};

describe("StaffRow — summary display (spec #05 AC2)", () => {
  it("shows variety / total_qty / total_amount when a summary is present", async () => {
    const view = await render(
      <StaffRow
        staff={staff}
        summary={{ staff_id: "s1", variety: 3, total_qty: 12, total_amount: 1200, has_negative: false }}
        onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()}
      />,
    );
    expect(view.getByText("张三")).toBeTruthy();
    expect(view.getByText("3种 / 12件")).toBeTruthy();
    expect(view.getByText("¥12.00")).toBeTruthy(); // 1200¢ = ¥12.00
    expect(view.queryByText("欠货")).toBeNull(); // no badge when not negative
  });

  it("shows '无记录' when there is no summary (no movements)", async () => {
    const view = await render(
      <StaffRow staff={staff} onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(view.getByText("无记录")).toBeTruthy();
  });
});

describe("StaffRow — 欠货 surfacing (spec #05 AC3)", () => {
  it("shows a 欠货 badge + danger MoneyText when has_negative", async () => {
    const view = await render(
      <StaffRow
        staff={staff}
        summary={{ staff_id: "s1", variety: 1, total_qty: -5, total_amount: -500, has_negative: true }}
        onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()}
      />,
    );
    expect(view.getByText("欠货")).toBeTruthy(); // badge
    expect(view.getByText("欠货 ¥5.00")).toBeTruthy(); // MoneyText negative
  });
});

describe("StaffRow — action callbacks carry the staff id (spec #05 AC5)", () => {
  it("入库 / 出库 / row each call back with the staff id", async () => {
    const onIn = jest.fn();
    const onOut = jest.fn();
    const onOpen = jest.fn();
    const view = await render(
      <StaffRow staff={staff} onIn={onIn} onOut={onOut} onOpen={onOpen} />,
    );
    fireEvent.press(view.getByTestId("in-s1"));
    expect(onIn).toHaveBeenCalledWith("s1");
    fireEvent.press(view.getByTestId("out-s1"));
    expect(onOut).toHaveBeenCalledWith("s1");
    fireEvent.press(view.getByTestId("row-s1"));
    expect(onOpen).toHaveBeenCalledWith("s1");
  });
});
