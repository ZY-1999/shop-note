import * as XLSX from "xlsx";

/** Fixed filename for the empty product import template share. */
export const PRODUCT_IMPORT_TEMPLATE_FILENAME = "商品导入模板.xlsx";

/**
 * Build a header-only product import workbook as base64 xlsx
 * (名称、单价 — no data rows).
 */
export function buildProductImportTemplate(): string {
  const header = ["名称", "单价"];
  const ws = XLSX.utils.aoa_to_sheet([header]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "商品");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
