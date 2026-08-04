import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildProductImportTemplate,
  PRODUCT_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-product-import-template";

function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildProductImportTemplate (manage-import #02)", () => {
  it("emits header-only 商品导入模板.xlsx with 名称/单价", () => {
    const base64 = buildProductImportTemplate();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(PRODUCT_IMPORT_TEMPLATE_FILENAME).toBe("商品导入模板.xlsx");
    expect(sheetRows(base64)).toEqual([["名称", "单价"]]);
  });
});
