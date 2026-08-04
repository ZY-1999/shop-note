import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildRestockImportTemplate,
  RESTOCK_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-restock-import-template";
import { parseRestockImportWorkbook } from "@/import/parse-restock-import-workbook";

function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildRestockImportTemplate (manage-import #05)", () => {
  it("emits 补货导入模板.xlsx with header + exactly one 示例 row", () => {
    const base64 = buildRestockImportTemplate();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(RESTOCK_IMPORT_TEMPLATE_FILENAME).toBe("补货导入模板.xlsx");

    const rows = sheetRows(base64);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["商品名称", "数量"]);

    const parsed = parseRestockImportWorkbook(base64);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toMatch(/示例/);
    expect(parsed[0]!.qty.length).toBeGreaterThan(0);
  });
});
