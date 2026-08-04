import * as XLSX from "xlsx";

import { formatDate, formatDateTime } from "@/components/date-format";
import type { SummaryExportSheets } from "@/data/config";
import type { Aggregate } from "@/data/inventory";
import { formatProductQtyList } from "@/export/format-product-qty-list";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";

export type SummaryInboundRecord = {
  timestamp: number;
  items: Array<{ title: string; qty: number }>;
  /** Σ line_amount in cents (snapshot at posting). */
  amountCents: number;
  note: string | null;
};

export type SummaryWorkbookInput = {
  sheets: SummaryExportSheets;
  /** as-of-now shop aggregate rows (qty=0 filtered out in build). */
  inventory: Aggregate[];
  /** Start of export range (local day 00:00); used for 历史结余备注. */
  rangeFrom?: number;
  /** as-of `rangeFrom` balance (现价); used when `sheets.inbound`. */
  historicalBalance?: Aggregate[];
  /** In-range `direction=in` documents (incl. `-1`); used when `sheets.inbound`. */
  inboundRecords?: SummaryInboundRecord[];
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
 * Multi-sheet summary workbook. Spec #02 emits 「库存」; #03 adds 「入库明细」
 * (historical balance + in-range restocks). Other bits ignored until later.
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

  if (input.sheets.inbound) {
    const from = input.rangeFrom ?? 0;
    const balance = input.historicalBalance ?? [];
    const records = input.inboundRecords ?? [];
    const balanceItems = balance
      .filter((r) => r.total_qty !== 0)
      .map((r) => ({ title: r.product.title, qty: r.total_qty }));
    const balanceAmount = balance.reduce((s, r) => s + r.total_cost, 0);
    const balanceNote = `截至 ${formatDate(from)} 00:00 的历史结余`;

    let inboundSum = 0;
    const body = records.map((r) => {
      inboundSum += r.amountCents;
      return [
        formatDateTime(r.timestamp),
        formatProductQtyList(r.items),
        formatCentsAsYuan(r.amountCents),
        r.note ?? "",
      ];
    });

    const aoa: unknown[][] = [
      ["时间", "商品", "金额", "备注"],
      ["", formatProductQtyList(balanceItems), formatCentsAsYuan(balanceAmount), balanceNote],
      ...body,
      ["合计", "", formatCentsAsYuan(balanceAmount + inboundSum), ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "入库明细");
  }

  // xlsx rejects empty workbooks; transitional when only unimplemented bits are on.
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "（暂无）");
  }

  return XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
}
