import { describe, expect, it } from "@jest/globals";

import { formatProductQtyList } from "@/export/format-product-qty-list";

describe("formatProductQtyList — summary-range-export #02", () => {
  it("merges same title qtys and joins with顿号", () => {
    expect(
      formatProductQtyList([
        { title: "可乐", qty: 2 },
        { title: "水", qty: 1 },
        { title: "可乐", qty: 1 },
      ]),
    ).toBe("可乐×3、水×1");
  });

  it("returns empty string for empty input", () => {
    expect(formatProductQtyList([])).toBe("");
  });
});
