import * as XLSX from "xlsx";

import type { SummaryExportSheets } from "@/data/config";
import type { Aggregate } from "@/data/inventory";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";

export type SummaryWorkbookInput = {
  sheets: SummaryExportSheets;
  /** as-of-now shop aggregate rows (qty=0 filtered out in build). */
  inventory: Aggregate[];
};

function ymd(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** `汇总-{fromYYYYMMDD}-{toYYYYMMDD}.xlsx` from local calendar ends of the range. */
export function summaryExportFilename(from: number, to: number): string {
  return `汇总-${ymd(from)}-${ymd(to)}.xlsx`;
}

/**
 * Multi-sheet summary workbook. Spec #02 only emits 「库存」 when selected;
 * other sheet bits are ignored until later specs.
 */
export function buildSummaryWorkbook(input: SummaryWorkbookInput): string {
  const wb = XLSX.utils.book_new();

  if (input.sheets.inventory) {
    const rows = input.inventory.filter((r) => r.total_qty !== 0);
    let qtySum = 0;
    let costSum = 0;
    const body = rows.map((r) => {
      qtySum += r.total_qty;
      costSum += r.total_cost;
      return [r.product.title, r.total_qty, formatCentsAsYuan(r.total_cost)];
    });
    const aoa: unknown[][] = [
      ["商品", "件数", "金额"],
      ...body,
      ["合计", qtySum, formatCentsAsYuan(costSum)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "库存");
  }

  // xlsx rejects empty workbooks; transitional when only unimplemented bits are on.
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "（暂无）");
  }

  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
