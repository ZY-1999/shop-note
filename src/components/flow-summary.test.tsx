import { describe, expect, it } from "@jest/globals";
import { within } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { FlowSummary } from "@/components/flow-summary";
import { renderWithProviders } from "@/testing/render";

/**
 * FlowSummary — member-facing totals in two lines:
 *   line 1: 充值 ¥xx  出库 ¥xx
 *   line 2: 出库计 N 单  零售 ¥xx
 * 补货 (restock) is intentionally absent — inventory op, not member flow.
 */

/** Join MoneyText children (`["¥","9.00"]` or `"¥9.00"`) into one matchable string. */
function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
}

async function render(ui: ReactElement) {
  return renderWithProviders(ui);
}

describe("FlowSummary — two-line layout, 补货 absent", () => {
  it("puts 充值/出库 amounts on line 1 and 出库计/零售 on line 2, with no 补货", async () => {
    const { view } = await render(
      <FlowSummary topup={10000} out={2100} bundles={3} retail={2100} />,
    );

    const amountRow = view.getByTestId("flow-summary-line-topup");
    expect(within(amountRow).getByText("充值")).toBeTruthy();
    expect(within(amountRow).getByText("出库")).toBeTruthy();
    expect(within(amountRow).queryByText("零售")).toBeNull();
    expect(money(view.getByTestId("flow-topup-total"))).toMatch(/100\.00/);
    expect(money(view.getByTestId("flow-out-total"))).toMatch(/21\.00/);

    expect(view.getByTestId("bundle-aggregate-count").props.children).toEqual(
      expect.arrayContaining(["出库计 ", 3, " 单"]),
    );
    expect(view.getByText("零售")).toBeTruthy();
    expect(money(view.getByTestId("bundle-aggregate-retail"))).toMatch(
      /21\.00/,
    );

    expect(view.queryByTestId("flow-in-total")).toBeNull();
    expect(view.queryByText("补货")).toBeNull();
  });
});

describe("FlowSummary — per-instance testID prefix (multi-instance screens)", () => {
  it("prefixes root + every inner testID when `testID` is given", async () => {
    const { view } = await render(
      <FlowSummary
        testID="day-flow-2026-07-09"
        topup={10000}
        out={2100}
        bundles={3}
        retail={2100}
      />,
    );

    expect(view.getByTestId("day-flow-2026-07-09")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-topup-total")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-out-total")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-bundle-count")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-retail")).toBeTruthy();

    expect(view.queryByTestId("flow-summary")).toBeNull();
    expect(view.queryByTestId("flow-topup-total")).toBeNull();
  });
});
