import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import { parseRestockImportWorkbook } from "@/import/parse-restock-import-workbook";

function workbookBase64(rows: string[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "补货");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

describe("parseRestockImportWorkbook (manage-import #03)", () => {
  it("maps 商品名称/数量 by header; skips blank rows; 1-based row numbers", () => {
    const base64 = workbookBase64([
      ["商品名称", "数量"],
      ["可乐", "10"],
      ["", ""],
      ["薯片", "2"],
    ]);
    expect(parseRestockImportWorkbook(base64)).toEqual([
      { row: 2, title: "可乐", qty: "10" },
      { row: 4, title: "薯片", qty: "2" },
    ]);
  });

  it("throws when 商品名称 column is missing", () => {
    const base64 = workbookBase64([["名称", "数量"], ["可乐", "1"]]);
    expect(() => parseRestockImportWorkbook(base64)).toThrow("缺少「商品名称」列");
  });
});
