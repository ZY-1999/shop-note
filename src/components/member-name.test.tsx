import { describe, expect, it } from "@jest/globals";
import { StyleSheet } from "react-native";
import type { ReactElement } from "react";

import { MemberName } from "@/components/member-name";
import { renderWithProviders } from "@/testing/render";

/**
 * MemberName — the shared member-name cell (name + LevelBadge) reused by 记账
 * (via MemberInfoHeader) and 汇总 (the per-day staff row). Pure presentational:
 * name + level in, no data hooks. The name ellipsizes (numberOfLines=1) and the
 * row honors an optional maxWidth so a long name never blows out a tight row.
 */

async function render(ui: ReactElement) {
  return renderWithProviders(ui);
}

describe("MemberName — name + level badge", () => {
  it("renders the member name and the 星站 badge for a gold member", async () => {
    const { view } = await render(<MemberName name="张三" level="gold" />);

    expect(view.getByText("张三")).toBeTruthy();
    expect(view.getByTestId("level-badge")).toBeTruthy();
    expect(view.getByText("星站")).toBeTruthy();
  });

  it("omits the badge for a 普站 (default-level) member", async () => {
    const { view } = await render(<MemberName name="李四" level="normal" />);

    expect(view.getByText("李四")).toBeTruthy();
    expect(view.queryByTestId("level-badge")).toBeNull();
    expect(view.queryByText("星站")).toBeNull();
  });

  it("ellipsizes the name with '…' when it overflows (single line, tail) so a long name never wraps or blows out the row", async () => {
    const { view } = await render(
      <MemberName name="一个名字非常非常长的会员" level="gold" />,
    );

    // numberOfLines=1 + ellipsizeMode 'tail' is what makes RN append '…' at the
    // overflow point under real layout — RNTL has no native text measurement, so
    // the truncation *configuration* is the observable contract here.
    const name = view.getByText("一个名字非常非常长的会员");
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.ellipsizeMode).toBe("tail");
  });

  it("caps the NAME at the configured maxWidth (badge stays visible, name truncates)", async () => {
    const { view } = await render(
      <MemberName name="张三" level="gold" maxWidth={80} />,
    );

    // maxWidth lands on the name text — with numberOfLines=1 + ellipsize 'tail'
    // this is what appends '…' past the bound. The badge renders beside it.
    const name = view.getByText("张三");
    expect(StyleSheet.flatten(name.props.style).maxWidth).toBe(80);
    expect(view.getByTestId("level-badge")).toBeTruthy();
  });

  it("applies nameStyle onto the name text so callers keep typography control (size / weight / color)", async () => {
    const { view } = await render(
      <MemberName
        name="张三"
        level="gold"
        nameStyle={{ fontSize: 20, fontWeight: "700", color: "#ff0000" }}
      />,
    );

    const flat = StyleSheet.flatten(view.getByText("张三").props.style);
    expect(flat.fontSize).toBe(20);
    expect(flat.fontWeight).toBe("700");
    expect(flat.color).toBe("#ff0000");
  });
});
