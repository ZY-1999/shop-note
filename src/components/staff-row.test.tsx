import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

import { StaffRow } from "@/components/staff-row";
import type { Staff } from "@/data/staff";

/**
 * Spec #02 (page-refactor) — StaffRow's merged inventory line (AC1:
 * `库存：m件/n种 金额` on one line, replacing the old two-line variety/qty +
 * amount layout), the 出单 out-action label (AC2), and 欠货 surfacing + that
 * 入库/出单/row taps still carry the staff id (AC5 — no regression). The row
 * stays a pure, RNTL-testable presentational piece; the screen wires the
 * callbacks to the router.
 *
 * No-summary renders zeros because the list-level filter (AC3) only hides
 * zero-inventory staff in the *default* view — search (AC4) still reveals them,
 * so the row must handle `summary === undefined`.
 */
const staff: Staff = {
  id: "s1", name: "张三", phone: "1", notes: "", level: "normal", voided_at: null, created_at: 0, updated_at: 0,
};

describe("StaffRow — merged inventory line (spec #02 AC1)", () => {
  it("shows 库存：{qty}件/{variety}种 + the amount on one line when a summary is present", async () => {
    const view = await render(
      <StaffRow
        staff={staff}
        summary={{ staff_id: "s1", variety: 3, total_qty: 12, total_amount: 1200, has_negative: false }}
        onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()}
      />,
    );
    expect(view.getByText("张三")).toBeTruthy();
    expect(view.getByText("库存：12件/3种")).toBeTruthy();
    expect(view.getByText("¥12.00")).toBeTruthy(); // 1200¢ inline via MoneyText
    expect(view.queryByText("欠货")).toBeNull(); // no badge when not negative
  });

  it("shows 库存：0件/0种 ¥0.00 when there is no summary (no movements)", async () => {
    const view = await render(
      <StaffRow staff={staff} onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(view.getByText("库存：0件/0种")).toBeTruthy();
    expect(view.getByText("¥0.00")).toBeTruthy();
  });
});

describe("StaffRow — 出单 label + 欠货 surfacing (spec #02 AC2/AC5)", () => {
  it("renders the out-action as 出单 (not 出库)", async () => {
    const view = await render(
      <StaffRow staff={staff} onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(view.getByText("出单")).toBeTruthy();
    expect(view.queryByText("出库")).toBeNull();
  });

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

describe("StaffRow — action callbacks carry the staff id (spec #02 AC5)", () => {
  it("入库 / 出单 / row each call back with the staff id", async () => {
    const onIn = jest.fn();
    const onOut = jest.fn();
    const onOpen = jest.fn();
    const view = await render(
      <StaffRow staff={staff} onIn={onIn} onOut={onOut} onOpen={onOpen} />,
    );
    await fireEvent.press(view.getByTestId("in-s1"));
    expect(onIn).toHaveBeenCalledWith("s1");
    await fireEvent.press(view.getByTestId("out-s1"));
    expect(onOut).toHaveBeenCalledWith("s1");
    await fireEvent.press(view.getByTestId("row-s1"));
    expect(onOpen).toHaveBeenCalledWith("s1");
  });
});

describe("StaffRow — member level badge (member-rename-level #03)", () => {
  it("shows the 金站 badge for a gold member; no badge for a 普站 member", async () => {
    const gold: Staff = { ...staff, id: "s-gold", level: "gold" };
    const goldView = await render(
      <StaffRow staff={gold} onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(goldView.getByText("金站")).toBeTruthy();

    const normalView = await render(
      <StaffRow staff={staff} onIn={jest.fn()} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(normalView.queryByText("金站")).toBeNull();
  });
});
