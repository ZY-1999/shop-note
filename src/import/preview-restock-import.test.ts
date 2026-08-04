import { describe, expect, it } from "@jest/globals";

import type { Product } from "@/data/product";
import { cents } from "@/data/primitives";
import {
  previewRestockImport,
  type RestockImportSheetRow,
} from "@/import/preview-restock-import";

function sheetRow(
  overrides: Partial<RestockImportSheetRow> &
    Pick<RestockImportSheetRow, "row" | "title" | "qty">,
): RestockImportSheetRow {
  return { ...overrides };
}

function product(
  overrides: Partial<Product> & Pick<Product, "id" | "title">,
): Product {
  return {
    purchase_price: overrides.purchase_price ?? cents(300),
    voided_at: overrides.voided_at ?? null,
    created_at: overrides.created_at ?? 1,
    updated_at: overrides.updated_at ?? 1,
    ...overrides,
  };
}

describe("previewRestockImport — happy path (manage-import #03 tracer)", () => {
  it("matches trim title to active products; emits product_id + positive int qty", () => {
    const result = previewRestockImport(
      [
        sheetRow({ row: 2, title: " 可乐 ", qty: "10" }),
        sheetRow({ row: 3, title: "薯片", qty: "2" }),
      ],
      [
        product({ id: "p-cola", title: "可乐" }),
        product({ id: "p-chips", title: "薯片" }),
      ],
    );

    expect(result.fail).toEqual([]);
    expect(result.ok).toEqual([
      { row: 2, title: "可乐", product_id: "p-cola", qty: 10 },
      { row: 3, title: "薯片", product_id: "p-chips", qty: 2 },
    ]);
  });
});

describe("previewRestockImport — validation failures (manage-import #03)", () => {
  it("fails missing title, missing/voided product, bad qty, in-file duplicate", () => {
    const result = previewRestockImport(
      [
        sheetRow({ row: 2, title: "  ", qty: "1" }),
        sheetRow({ row: 3, title: "幽灵", qty: "1" }),
        sheetRow({ row: 4, title: "已删货", qty: "1" }),
        sheetRow({ row: 5, title: "可乐", qty: "1.5" }),
        sheetRow({ row: 6, title: "薯片", qty: "0" }),
        sheetRow({ row: 7, title: "面包", qty: "abc" }),
        sheetRow({ row: 8, title: "牛奶", qty: "2" }),
        sheetRow({ row: 9, title: " 牛奶 ", qty: "3" }),
      ],
      [
        product({ id: "p-cola", title: "可乐" }),
        product({ id: "p-chips", title: "薯片" }),
        product({ id: "p-bread", title: "面包" }),
        product({ id: "p-milk", title: "牛奶" }),
        product({ id: "p-gone", title: "已删货", voided_at: 99 }),
      ],
    );

    expect(result.ok).toEqual([
      { row: 8, title: "牛奶", product_id: "p-milk", qty: 2 },
    ]);
    expect(result.fail).toEqual([
      { row: 2, reason: "缺少商品名称" },
      { row: 3, reason: "商品不存在" },
      { row: 4, reason: "商品已删除" },
      { row: 5, reason: "数量必须是正整数" },
      { row: 6, reason: "数量必须是正整数" },
      { row: 7, reason: "数量必须是正整数" },
      { row: 9, reason: "文件内重复" },
    ]);
  });
});
