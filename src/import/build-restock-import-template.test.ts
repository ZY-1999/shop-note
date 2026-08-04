import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildRestockImportTemplate,
  RESTOCK_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-restock-import-template";

function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildRestockImportTemplate (manage-import #03)", () => {
  it("emits header-only 补货导入模板.xlsx with 商品名称/数量", () => {
    const base64 = buildRestockImportTemplate();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(RESTOCK_IMPORT_TEMPLATE_FILENAME).toBe("补货导入模板.xlsx");
    expect(sheetRows(base64)).toEqual([["商品名称", "数量"]]);
  });
});
