import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { FlowEventRow } from "@/components/flow-event-row";
import { renderWithProviders } from "@/testing/render";

/**
 * FlowEventRow — one checkout or top-up in a day drill-down.
 * Checkout summarizes as 「出库 N 单」+ 零售 (no amount); top-up shows 充值 + amount.
 */

function money(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  return Array.isArray(c) ? (c as string[]).join("") : String(c ?? "");
}

async function render(ui: ReactElement) {
  return renderWithProviders(ui);
}

const ts = new Date(2026, 5, 10, 14, 30, 7).getTime();

describe("FlowEventRow — checkout", () => {
  it("shows time, 出库 N 单, and retail — no checkout amount or product names", async () => {
    const { view } = await render(
      <FlowEventRow
        kind="checkout"
        timestamp={ts}
        amountCents={2100}
        bundles={3}
        retailCents={2100}
        onPress={jest.fn()}
      />,
    );

    expect(view.getByTestId("flow-event-time").props.children).toBe("14:30:07");
    expect(view.getByTestId("flow-event-bundle-count").props.children).toEqual(
      expect.arrayContaining(["出库 ", 3, " 单"]),
    );
    expect(view.getByText("零售")).toBeTruthy();
    expect(money(view.getByTestId("flow-event-retail"))).toMatch(/21\.00/);
    expect(view.queryByTestId("flow-event-amount")).toBeNull();
    expect(view.queryByText("可乐")).toBeNull();
  });

  it("invokes onPress when the row is tapped", async () => {
    const onPress = jest.fn();
    const { view } = await render(
      <FlowEventRow
        kind="checkout"
        timestamp={ts}
        amountCents={100}
        bundles={0}
        retailCents={100}
        onPress={onPress}
      />,
    );
    fireEvent.press(view.getByTestId("flow-event-row"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("FlowEventRow — topup", () => {
  it("shows time, 充值, and amount — no bundle/retail", async () => {
    const { view } = await render(
      <FlowEventRow
        kind="topup"
        timestamp={ts}
        amountCents={10000}
        onPress={jest.fn()}
      />,
    );

    expect(view.getByTestId("flow-event-time").props.children).toBe("14:30:07");
    expect(view.getByText("充值")).toBeTruthy();
    expect(money(view.getByTestId("flow-event-amount"))).toMatch(/100\.00/);
    expect(view.queryByTestId("flow-event-bundle-count")).toBeNull();
    expect(view.queryByTestId("flow-event-retail")).toBeNull();
    expect(view.queryByText("零售")).toBeNull();
  });
});

describe("FlowEventRow — testID prefix", () => {
  it("prefixes inner testIDs when testID is supplied", async () => {
    const { view } = await render(
      <FlowEventRow
        kind="checkout"
        testID="history-abc"
        timestamp={ts}
        amountCents={100}
        bundles={1}
        retailCents={0}
        onPress={jest.fn()}
      />,
    );

    expect(view.getByTestId("history-abc")).toBeTruthy();
    expect(view.getByTestId("history-abc-time")).toBeTruthy();
    expect(view.getByTestId("history-abc-bundle-count")).toBeTruthy();
    expect(view.queryByTestId("flow-event-row")).toBeNull();
  });
});
