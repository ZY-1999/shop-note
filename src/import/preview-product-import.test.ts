import { describe, expect, it } from "@jest/globals";

import type { Product } from "@/data/product";
import { cents } from "@/data/primitives";
import {
  previewProductImport,
  type ProductImportSheetRow,
} from "@/import/preview-product-import";

function sheetRow(
  overrides: Partial<ProductImportSheetRow> &
    Pick<ProductImportSheetRow, "row" | "title">,
): ProductImportSheetRow {
  return {
    price: "3.00",
    ...overrides,
  };
}

function existing(
  overrides: Partial<Product> & Pick<Product, "title">,
): Product {
  return {
    id: overrides.id ?? "p1",
    title: overrides.title,
    purchase_price: overrides.purchase_price ?? cents(100),
    code: overrides.code ?? null,
    category: overrides.category ?? null,
    voided_at: overrides.voided_at ?? null,
    created_at: overrides.created_at ?? 1,
    updated_at: overrides.updated_at ?? 1,
  };
}

describe("previewProductImport — happy path (manage-import #02 tracer)", () => {
  it("accepts valid rows: trim title, yuan→cents via parseYuanToCents", () => {
    const result = previewProductImport(
      [
        sheetRow({ row: 2, title: " 可乐 ", price: "3.00" }),
        sheetRow({ row: 3, title: "雪碧", price: "2.5" }),
      ],
      [],
    );

    expect(result.fail).toEqual([]);
    expect(result.ok).toEqual([
      { row: 2, title: "可乐", purchase_price: cents(300) },
      { row: 3, title: "雪碧", purchase_price: cents(250) },
    ]);
  });
});

describe("previewProductImport — validation failures (manage-import #02)", () => {
  it("fails missing title/price and illegal price", () => {
    const result = previewProductImport(
      [
        sheetRow({ row: 2, title: "  ", price: "1.00" }),
        sheetRow({ row: 3, title: "好品", price: "" }),
        sheetRow({ row: 4, title: "坏价", price: "abc" }),
        sheetRow({ row: 5, title: "零价", price: "0" }),
      ],
      [],
    );
    expect(result.ok).toEqual([]);
    expect(result.fail).toEqual([
      { row: 2, reason: "缺少名称" },
      { row: 3, reason: "缺少单价" },
      { row: 4, reason: "单价非法" },
      { row: 5, reason: "单价非法" },
    ]);
  });

  it("distinguishes active vs voided title clashes; in-file duplicate fails later row", () => {
    const result = previewProductImport(
      [
        sheetRow({ row: 2, title: "可乐" }),
        sheetRow({ row: 3, title: "已删品" }),
        sheetRow({ row: 4, title: "新品" }),
        sheetRow({ row: 5, title: " 新品 " }),
      ],
      [
        existing({ title: "可乐", voided_at: null }),
        existing({ id: "p2", title: "已删品", voided_at: 99 }),
      ],
    );
    expect(result.ok).toEqual([
      { row: 4, title: "新品", purchase_price: cents(300) },
    ]);
    expect(result.fail).toEqual([
      { row: 2, reason: "已存在" },
      { row: 3, reason: "已存在（已删除）" },
      { row: 5, reason: "文件内重复" },
    ]);
  });
});
