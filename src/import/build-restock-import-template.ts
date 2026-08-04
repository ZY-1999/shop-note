import * as XLSX from "xlsx";

/** Fixed filename for the restock import template share. */
export const RESTOCK_IMPORT_TEMPLATE_FILENAME = "补货导入模板.xlsx";

/**
 * Build a restock import workbook as base64 xlsx:
 * header (商品名称、数量) + exactly one example data row.
 * Example product name includes「示例」so staff replace it with a real title or delete the row.
 */
export function buildRestockImportTemplate(): string {
  const header = ["商品名称", "数量"];
  const example = ["可乐（示例）", "10"];
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "补货");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
