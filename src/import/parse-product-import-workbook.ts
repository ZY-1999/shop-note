import * as XLSX from "xlsx";

import type { ProductImportSheetRow } from "@/import/preview-product-import";

/**
 * Parse a product-import xlsx (base64) into sheet rows.
 * Maps columns by header name (名称 / 单价); data starts at row 2.
 * Skips fully-blank data rows.
 */
export function parseProductImportWorkbook(
  base64: string,
): ProductImportSheetRow[] {
  const wb = XLSX.read(base64, { type: "base64" });
  if (wb.SheetNames.length === 0) return [];
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (aoa.length === 0) return [];

  const header = (aoa[0] as unknown[]).map((c) => String(c ?? "").trim());
  const idx = (label: string) => header.indexOf(label);
  const iTitle = idx("名称");
  const iPrice = idx("单价");
  if (iTitle < 0) {
    throw new Error("缺少「名称」列");
  }

  const out: ProductImportSheetRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] as unknown[];
    const cell = (j: number) =>
      j >= 0 ? String(cells[j] ?? "").trim() : "";
    const title = cell(iTitle);
    const price = cell(iPrice);
    if (!title && !price) continue;
    out.push({
      row: i + 1, // 1-based spreadsheet row
      title,
      price,
    });
  }
  return out;
}
