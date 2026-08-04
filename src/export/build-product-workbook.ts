import * as XLSX from "xlsx";

import type { Product } from "@/data/product";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";

/**
 * Build a product workbook as base64 xlsx.
 * Rows are whatever the caller already filtered (current list); this only
 * shapes columns. Status column appears iff `includeVoided`.
 * No 编码/分类/id columns.
 */
export function buildProductWorkbook(
  rows: Product[],
  opts: { includeVoided: boolean },
): string {
  const header = ["名称", "单价"];
  if (opts.includeVoided) header.push("状态");

  const body = rows.map((p) => {
    const row: string[] = [p.title, formatCentsAsYuan(p.purchase_price)];
    if (opts.includeVoided) {
      row.push(p.voided_at == null ? "有效" : "已删除");
    }
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "商品");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}

/** Local-calendar `商品-YYYYMMDD.xlsx` for the device day of `now`. */
export function productExportFilename(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `商品-${y}${m}${day}.xlsx`;
}
