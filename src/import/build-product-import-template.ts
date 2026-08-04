import * as XLSX from "xlsx";

/** Fixed filename for the product import template share. */
export const PRODUCT_IMPORT_TEMPLATE_FILENAME = "商品导入模板.xlsx";

/**
 * Build a product import workbook as base64 xlsx:
 * header (名称、单价) + exactly one example data row.
 */
export function buildProductImportTemplate(): string {
  const header = ["名称", "单价"];
  const example = ["可乐", "3.00"];
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "商品");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
