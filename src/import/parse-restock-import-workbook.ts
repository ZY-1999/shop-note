import * as XLSX from "xlsx";

import type { RestockImportSheetRow } from "@/import/preview-restock-import";

/**
 * Parse a restock-import xlsx (base64) into sheet rows.
 * Maps columns by header name (商品名称 / 数量); data starts at row 2.
 * Skips fully-blank data rows.
 */
export function parseRestockImportWorkbook(
  base64: string,
): RestockImportSheetRow[] {
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
  const iTitle = idx("商品名称");
  const iQty = idx("数量");
  if (iTitle < 0) {
    throw new Error("缺少「商品名称」列");
  }

  const out: RestockImportSheetRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] as unknown[];
    const cell = (j: number) =>
      j >= 0 ? String(cells[j] ?? "").trim() : "";
    const title = cell(iTitle);
    const qty = cell(iQty);
    if (!title && !qty) continue;
    out.push({
      row: i + 1, // 1-based spreadsheet row
      title,
      qty,
    });
  }
  return out;
}
