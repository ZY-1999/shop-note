import * as XLSX from "xlsx";

/** Fixed filename for the staff import template share. */
export const STAFF_IMPORT_TEMPLATE_FILENAME = "会员导入模板.xlsx";

/**
 * Build a staff import workbook as base64 xlsx:
 * header (姓名、电话、备注、等级) + exactly one example data row.
 */
export function buildStaffImportTemplate(): string {
  const header = ["姓名", "电话", "备注", "等级"];
  const example = ["张三", "13800000000", "示例备注", "普站"];
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "会员");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
