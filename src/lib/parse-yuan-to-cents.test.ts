import { describe, expect, it } from "@jest/globals";

import { cents } from "@/data/primitives";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";
import { parseYuanToCents } from "@/lib/parse-yuan-to-cents";

describe("parseYuanToCents (manage-import #02)", () => {
  it("parses valid 元 strings to integer 分", () => {
    expect(parseYuanToCents("123.45")).toEqual({ ok: true, cents: cents(12345) });
    expect(parseYuanToCents("1.00")).toEqual({ ok: true, cents: cents(100) });
    expect(parseYuanToCents("0.05")).toEqual({ ok: true, cents: cents(5) });
    expect(parseYuanToCents(" 2.5 ")).toEqual({ ok: true, cents: cents(250) });
  });

  it("is symmetric with formatCentsAsYuan for positive amounts", () => {
    for (const c of [5, 100, 250, 12345, 1]) {
      const yuan = formatCentsAsYuan(c);
      expect(parseYuanToCents(yuan)).toEqual({ ok: true, cents: cents(c) });
    }
  });

  it("rejects empty, zero, negative, and non-numeric", () => {
    expect(parseYuanToCents("")).toEqual({ ok: false, reason: "缺少单价" });
    expect(parseYuanToCents("   ")).toEqual({ ok: false, reason: "缺少单价" });
    expect(parseYuanToCents("0")).toEqual({ ok: false, reason: "单价非法" });
    expect(parseYuanToCents("0.00")).toEqual({ ok: false, reason: "单价非法" });
    expect(parseYuanToCents("-1")).toEqual({ ok: false, reason: "单价非法" });
    expect(parseYuanToCents("abc")).toEqual({ ok: false, reason: "单价非法" });
  });
});
