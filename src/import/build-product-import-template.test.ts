import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildProductImportTemplate,
  PRODUCT_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-product-import-template";
import { parseProductImportWorkbook } from "@/import/parse-product-import-workbook";

function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildProductImportTemplate (manage-import #05)", () => {
  it("emits 商品导入模板.xlsx with header + exactly one example row", () => {
    const base64 = buildProductImportTemplate();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(PRODUCT_IMPORT_TEMPLATE_FILENAME).toBe("商品导入模板.xlsx");

    const rows = sheetRows(base64);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["名称", "单价"]);

    const parsed = parseProductImportWorkbook(base64);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title.length).toBeGreaterThan(0);
    expect(parsed[0]!.price.length).toBeGreaterThan(0);
  });
});
