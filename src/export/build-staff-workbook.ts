import * as XLSX from "xlsx";

import { ADMIN_STAFF_ID, labelForLevel, type Staff } from "@/data/staff";

/** Spreadsheet MIME for staff (and later product) xlsx exports. */
export const STAFF_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Build a staff membership workbook as base64 xlsx.
 * Rows are whatever the caller already filtered (current list); this only
 * shapes columns (+ safety-drops `-1`). Status column appears iff `includeVoided`.
 */
export function buildStaffWorkbook(
  rows: Staff[],
  opts: { includeVoided: boolean },
): string {
  const header = ["姓名", "电话", "备注", "等级"];
  if (opts.includeVoided) header.push("状态");

  const body = rows
    .filter((s) => s.id !== ADMIN_STAFF_ID)
    .map((s) => {
      const row: string[] = [s.name, s.phone, s.notes, labelForLevel(s.level)];
      if (opts.includeVoided) {
        row.push(s.voided_at == null ? "有效" : "已删除");
      }
      return row;
    });

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "会员");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

/** Local-calendar `会员-YYYYMMDD.xlsx` for the device day of `now`. */
export function staffExportFilename(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `会员-${y}${m}${day}.xlsx`;
}
