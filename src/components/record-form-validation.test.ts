import { describe, expect, it } from "@jest/globals";

import { validateRecordForm } from "@/components/record-form-validation";

/**
 * Spec #06 AC3 — pre-submit validation rules. Pure predicate, exercised in the
 * node env. Each rule returns its message; a submittable draft returns null.
 * Mirrors the repo's integer-qty guard so the operator is told before the throw.
 */
describe("validateRecordForm — spec #06 AC3", () => {
  it("flags a missing staff", () => {
    expect(validateRecordForm("", [{ productId: "p1", qty: "3" }])).toBe("请选择会员");
  });

  it("flags zero items", () => {
    expect(validateRecordForm("s1", [])).toBe("至少添加一项商品");
  });

  it("flags a line with no product selected", () => {
    expect(validateRecordForm("s1", [{ productId: "", qty: "3" }])).toBe("每项都需要选择商品");
  });

  it("flags a non-integer qty", () => {
    expect(validateRecordForm("s1", [{ productId: "p1", qty: "1.5" }])).toBe("数量必须是正整数");
  });

  it("flags a non-positive qty", () => {
    expect(validateRecordForm("s1", [{ productId: "p1", qty: "0" }])).toBe("数量必须是正整数");
    expect(validateRecordForm("s1", [{ productId: "p1", qty: "-2" }])).toBe("数量必须是正整数");
  });

  it("flags a non-numeric qty", () => {
    expect(validateRecordForm("s1", [{ productId: "p1", qty: "abc" }])).toBe("数量必须是正整数");
  });

  it("returns null for a submittable draft (one valid line)", () => {
    expect(validateRecordForm("s1", [{ productId: "p1", qty: "3" }])).toBeNull();
  });

  it("returns null for a multi-line draft once every line is valid", () => {
    expect(
      validateRecordForm("s1", [
        { productId: "p1", qty: "3" },
        { productId: "p2", qty: "10" },
      ]),
    ).toBeNull();
  });

  it("reports the first failing line in order", () => {
    // line 0 valid, line 1 missing product → first failure is line 1's product.
    expect(
      validateRecordForm("s1", [
        { productId: "p1", qty: "3" },
        { productId: "", qty: "2" },
      ]),
    ).toBe("每项都需要选择商品");
  });
});
