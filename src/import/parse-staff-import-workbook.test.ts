import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import { parseStaffImportWorkbook } from "@/import/parse-staff-import-workbook";

function workbookBase64(rows: string[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "会员");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

describe("parseStaffImportWorkbook (manage-import #01)", () => {
  it("maps header columns and skips blank data rows", () => {
    const base64 = workbookBase64([
      ["姓名", "电话", "备注", "等级"],
      ["张三", "138", "熟客", "星站"],
      ["", "", "", ""],
      ["李四", "", "", ""],
    ]);
    expect(parseStaffImportWorkbook(base64)).toEqual([
      { row: 2, name: "张三", phone: "138", notes: "熟客", level: "星站" },
      { row: 4, name: "李四", phone: "", notes: "", level: "" },
    ]);
  });

  it("throws when 姓名 column is missing", () => {
    const base64 = workbookBase64([["电话", "备注"], ["138", "x"]]);
    expect(() => parseStaffImportWorkbook(base64)).toThrow(/姓名/);
  });
});
