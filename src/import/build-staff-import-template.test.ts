import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildStaffImportTemplate,
  STAFF_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-staff-import-template";
import { parseStaffImportWorkbook } from "@/import/parse-staff-import-workbook";

function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildStaffImportTemplate (manage-import #05)", () => {
  it("emits 会员导入模板.xlsx with header + exactly one example row", () => {
    const base64 = buildStaffImportTemplate();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(STAFF_IMPORT_TEMPLATE_FILENAME).toBe("会员导入模板.xlsx");

    const rows = sheetRows(base64);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["姓名", "电话", "备注", "等级"]);

    const parsed = parseStaffImportWorkbook(base64);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).not.toBe("管理员");
    expect(["普站", "星站"]).toContain(parsed[0]!.level);
  });
});
