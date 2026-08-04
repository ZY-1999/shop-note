import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import {
  buildStaffImportTemplate,
  STAFF_IMPORT_TEMPLATE_FILENAME,
} from "@/import/build-staff-import-template";

function sheetRows(base64: string): unknown[][] {
  const wb = XLSX.read(base64, { type: "base64" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

describe("buildStaffImportTemplate (manage-import #01)", () => {
  it("emits header-only 会员导入模板.xlsx with 姓名/电话/备注/等级", () => {
    const base64 = buildStaffImportTemplate();
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    expect(STAFF_IMPORT_TEMPLATE_FILENAME).toBe("会员导入模板.xlsx");
    expect(sheetRows(base64)).toEqual([["姓名", "电话", "备注", "等级"]]);
  });
});
