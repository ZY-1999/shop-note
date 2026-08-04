import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import { parseProductImportWorkbook } from "@/import/parse-product-import-workbook";

function workbookBase64(rows: string[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "商品");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

describe("parseProductImportWorkbook (manage-import #02)", () => {
  it("maps header columns and skips blank data rows", () => {
    const base64 = workbookBase64([
      ["名称", "单价"],
      ["可乐", "3.00"],
      ["", ""],
      ["雪碧", "2.5"],
    ]);
    expect(parseProductImportWorkbook(base64)).toEqual([
      { row: 2, title: "可乐", price: "3.00" },
      { row: 4, title: "雪碧", price: "2.5" },
    ]);
  });

  it("throws when 名称 column is missing", () => {
    const base64 = workbookBase64([["单价"], ["3.00"]]);
    expect(() => parseProductImportWorkbook(base64)).toThrow(/名称/);
  });
});
