import * as XLSX from "xlsx";

/** Fixed filename for the empty staff import template share. */
export const STAFF_IMPORT_TEMPLATE_FILENAME = "会员导入模板.xlsx";

/**
 * Build a header-only staff import workbook as base64 xlsx
 * (姓名、电话、备注、等级 — no data rows).
 */
export function buildStaffImportTemplate(): string {
  const header = ["姓名", "电话", "备注", "等级"];
  const ws = XLSX.utils.aoa_to_sheet([header]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "会员");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
