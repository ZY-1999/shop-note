import { describe, expect, it } from "@jest/globals";

import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";

describe("formatCentsAsYuan", () => {
  it("formats integer 分 as 元 with two decimals", () => {
    expect(formatCentsAsYuan(12345)).toBe("123.45");
    expect(formatCentsAsYuan(0)).toBe("0.00");
    expect(formatCentsAsYuan(100)).toBe("1.00");
    expect(formatCentsAsYuan(5)).toBe("0.05");
  });

  it("formats negative 分 as signed 元 with two decimals", () => {
    expect(formatCentsAsYuan(-500)).toBe("-5.00");
  });
});
