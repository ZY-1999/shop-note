import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import { cents } from "@/data/primitives";
import type { Product } from "@/data/product";
import {
  buildProductWorkbook,
  productExportFilename,
} from "@/export/build-product-workbook";

function product(
  overrides: Partial<Product> & Pick<Product, "title">,
): Product {
  return {
    id: overrides.id ?? "p1",
    title: overrides.title,
    purchase_price: overrides.purchase_price ?? cents(300),
    code: overrides.code ?? null,
    category: overrides.category ?? null,
    voided_at: overrides.voided_at ?? null,
    created_at: overrides.created_at ?? 1,
    updated_at: overrides.updated_at ?? 1,
  };
}

/** Decode a base64 workbook into row arrays (header + data). */
function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildProductWorkbook", () => {
  it("emits 名称/单价 columns without status when includeVoided is false", () => {
    const base64 = buildProductWorkbook(
      [product({ title: "可乐", purchase_price: cents(300) })],
      { includeVoided: false },
    );

    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(sheetRows(base64)).toEqual([
      ["名称", "单价"],
      ["可乐", "3.00"],
    ]);
  });

  it("appends 状态 (有效/已删除) only when includeVoided is true", () => {
    const base64 = buildProductWorkbook(
      [
        product({ title: "有效品", purchase_price: cents(100) }),
        product({
          id: "p2",
          title: "已删品",
          purchase_price: cents(250),
          voided_at: 99,
        }),
      ],
      { includeVoided: true },
    );

    expect(sheetRows(base64)).toEqual([
      ["名称", "单价", "状态"],
      ["有效品", "1.00", "有效"],
      ["已删品", "2.50", "已删除"],
    ]);
  });

  it("never emits 编码/分类/id or timestamps", () => {
    const base64 = buildProductWorkbook(
      [
        product({
          id: "secret-id",
          title: "雪碧",
          purchase_price: cents(350),
          code: "C002",
          category: "饮料",
          created_at: 111,
          updated_at: 222,
        }),
      ],
      { includeVoided: false },
    );

    const rows = sheetRows(base64);
    expect(rows).toEqual([
      ["名称", "单价"],
      ["雪碧", "3.50"],
    ]);
    const flat = rows.flat().map(String);
    expect(flat).not.toContain("secret-id");
    expect(flat).not.toContain("C002");
    expect(flat).not.toContain("饮料");
    expect(flat).not.toContain("编码");
    expect(flat).not.toContain("分类");
    expect(flat).not.toContain("111");
    expect(flat).not.toContain("222");
  });

  it("names the file 商品-YYYYMMDD.xlsx from the local device day", () => {
    expect(productExportFilename(new Date(2026, 7, 4, 15, 30).getTime())).toBe(
      "商品-20260804.xlsx",
    );
    expect(productExportFilename(new Date(2026, 0, 9, 0, 0).getTime())).toBe(
      "商品-20260109.xlsx",
    );
  });
});
