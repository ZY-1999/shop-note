import * as XLSX from "xlsx";

import type { StaffImportSheetRow } from "@/import/preview-staff-import";

/**
 * Parse a staff-import xlsx (base64) into sheet rows.
 * Maps columns by header name (姓名 / 电话 / 备注 / 等级); data starts at row 2.
 * Skips fully-blank data rows.
 */
export function parseStaffImportWorkbook(base64: string): StaffImportSheetRow[] {
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
  const iName = idx("姓名");
  const iPhone = idx("电话");
  const iNotes = idx("备注");
  const iLevel = idx("等级");
  if (iName < 0) {
    throw new Error("缺少「姓名」列");
  }

  const out: StaffImportSheetRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] as unknown[];
    const cell = (j: number) =>
      j >= 0 ? String(cells[j] ?? "").trim() : "";
    const name = cell(iName);
    const phone = cell(iPhone);
    const notes = cell(iNotes);
    const level = cell(iLevel);
    if (!name && !phone && !notes && !level) continue;
    out.push({
      row: i + 1, // 1-based spreadsheet row
      name,
      phone,
      notes,
      level,
    });
  }
  return out;
}
