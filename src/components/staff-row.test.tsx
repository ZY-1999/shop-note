import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";

import { StaffRow } from "@/components/staff-row";
import type { Staff } from "@/data/staff";

/**
 * stock-balance-refactor placeholder skeleton. Members no longer hold stock, so
 * StaffRow lost its per-staff 「库存」 line, the 欠货 badge, the summary prop, and
 * the 入库 affordance. What remains: the member's name + level + an 出库 action.
 * Spec 03 (balance-domain) fills the 余额 / 欠款 display + 充值 affordance back in.
 *
 * These tests pin the skeleton: the 出库 label, the level badge, and that 出库 /
 * row taps still carry the staff id (no regression vs. the old callbacks).
 */
const staff: Staff = {
  id: "s1", name: "张三", phone: "1", notes: "", level: "normal", voided_at: null, created_at: 0, updated_at: 0,
};

describe("StaffRow — placeholder skeleton (stock-balance-refactor)", () => {
  it("renders the member name + level; no per-staff 库存 line or 入库 button", async () => {
    const view = await render(
      <StaffRow staff={staff} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(view.getByText("张三")).toBeTruthy();
    expect(view.getByText("出库")).toBeTruthy();
    // the deprecated per-staff inventory surface is gone (spec 03 owns 余额).
    expect(view.queryByText(/库存：/)).toBeNull();
    expect(view.queryByText("入库")).toBeNull();
    expect(view.queryByText("欠货")).toBeNull();
    expect(view.queryByTestId("in-s1")).toBeNull();
  });

  it("does not render the 出单 label (display word is 出库)", async () => {
    const view = await render(
      <StaffRow staff={staff} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(view.queryByText("出单")).toBeNull();
  });
});

describe("StaffRow — action callbacks carry the staff id", () => {
  it("出库 / row each call back with the staff id", async () => {
    const onOut = jest.fn();
    const onOpen = jest.fn();
    const view = await render(
      <StaffRow staff={staff} onOut={onOut} onOpen={onOpen} />,
    );
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
      <StaffRow staff={gold} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(goldView.getByText("金站")).toBeTruthy();

    const normalView = await render(
      <StaffRow staff={staff} onOut={jest.fn()} onOpen={jest.fn()} />,
    );
    expect(normalView.queryByText("金站")).toBeNull();
  });
});
