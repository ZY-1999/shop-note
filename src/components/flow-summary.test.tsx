import { describe, expect, it } from "@jest/globals";
import { within } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { FlowSummary } from "@/components/flow-summary";
import { renderWithProviders } from "@/testing/render";

/**
 * FlowSummary — the 汇总 header's flow summary card, extracted so the layout is
 * reusable and testable in isolation. Two lines: 充值 alone on line 1; 出库 /
 * 计 N 单 / 零售 on line 2. 补货 (restock) is intentionally absent — it is an
 * inventory op, not member flow, and shows in the 库存卡 + per-day drill-down.
 */

/** Join MoneyText's two-children output (`["¥","9.00"]`) into one matchable string. */
function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
}

async function render(ui: ReactElement) {
  return renderWithProviders(ui);
}

describe("FlowSummary — two-line layout, 补货 absent", () => {
  it("renders 充值 on line 1 and 出库/计单/零售 on line 2, with no 补货", async () => {
    const { view } = await render(
      <FlowSummary topup={10000} out={2100} bundles={3} retail={2100} />,
    );

    // 充值 (line 1) — topup amount renders.
    expect(money(view.getByTestId("flow-topup-total"))).toMatch(/100\.00/);
    // 出库 / 计 N 单 / 零售 (line 2) — out amount, bundle count, retail amount render.
    expect(money(view.getByTestId("flow-out-total"))).toMatch(/21\.00/);
    expect(view.getByTestId("bundle-aggregate-count").props.children).toEqual(
      expect.arrayContaining([3, " 单"]),
    );
    expect(money(view.getByTestId("bundle-aggregate-retail"))).toMatch(
      /21\.00/,
    );

    // 补货 is intentionally absent from the summary.
    expect(view.queryByTestId("flow-in-total")).toBeNull();
    expect(view.queryByText("补货")).toBeNull();
  });

  it("充值 sits on its own row, separate from the 出库/零售 row", async () => {
    const { view } = await render(
      <FlowSummary topup={10000} out={2100} bundles={0} retail={0} />,
    );

    // 充值 is alone on line 1 — its row carries 充值 but NOT 出库/零售.
    const topupRow = view.getByTestId("flow-summary-line-topup");
    expect(within(topupRow).getByText("充值")).toBeTruthy();
    expect(within(topupRow).queryByText("出库")).toBeNull();
    expect(within(topupRow).queryByText("零售")).toBeNull();
  });
});

describe("FlowSummary — per-instance testID prefix (multi-instance screens)", () => {
  it("prefixes the root + every inner testID when `testID` is given, so several FlowSummarys on one screen don't collide", async () => {
    const { view } = await render(
      <FlowSummary testID="day-flow-2026-07-09" topup={10000} out={2100} bundles={3} retail={2100} />,
    );

    // root + inner testIDs all carry the prefix — a second FlowSummary with a
    // different prefix (e.g. the range header, or another day) won't collide.
    expect(view.getByTestId("day-flow-2026-07-09")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-topup-total")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-out-total")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-bundle-count")).toBeTruthy();
    expect(view.getByTestId("day-flow-2026-07-09-retail")).toBeTruthy();

    // the unprefixed defaults are NOT rendered when a prefix is given.
    expect(view.queryByTestId("flow-summary")).toBeNull();
    expect(view.queryByTestId("flow-topup-total")).toBeNull();
  });
});
