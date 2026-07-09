import { describe, expect, it } from "@jest/globals";
import { render } from "@testing-library/react-native";

import { MoneyText } from "@/components/money-text";
import { cents } from "@/data/primitives";

/**
 * Spec #05 — MoneyText, the one money-formatting primitive. Asserts the text
 * format + sign handling (color is theme-driven and verified on device). The
 * `欠货` form shows the debt magnitude as a positive ¥ figure — the danger color
 * + prefix carry the sign.
 */
describe("MoneyText (spec #05)", () => {
  it("formats Cents(12345) → ¥123.45", async () => {
    const view = await render(<MoneyText cents={cents(12345)} />);
    expect(view.getByText("¥123.45")).toBeTruthy();
  });

  it("a negative amount → 欠货 ¥X.XX (absolute magnitude)", async () => {
    const view = await render(<MoneyText cents={cents(-500)} />);
    expect(view.getByText("欠货 ¥5.00")).toBeTruthy();
  });

  it("zero → ¥0.00", async () => {
    const view = await render(<MoneyText cents={cents(0)} />);
    expect(view.getByText("¥0.00")).toBeTruthy();
  });
});
