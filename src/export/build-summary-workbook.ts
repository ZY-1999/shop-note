import * as XLSX from "xlsx";

import { formatDate, formatDateTime } from "@/components/date-format";
import type { SummaryExportSheets } from "@/data/config";
import type { Aggregate } from "@/data/inventory";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { formatProductQtyList } from "@/export/format-product-qty-list";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";

export type SummaryInboundRecord = {
  timestamp: number;
  items: Array<{ title: string; qty: number }>;
  /** Σ line_amount in cents (snapshot at posting). */
  amountCents: number;
  note: string | null;
};

export type SummaryTopupEvent = {
  staffId: string;
  amountCents: number;
  timestamp: number;
  note: string | null;
};

export type SummaryCheckoutEvent = {
  staffId: string;
  timestamp: number;
  selfUse: boolean;
  items: Array<{ title: string; qty: number }>;
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
  /** staff_id → display name and void state; missing ids fall back to the id. */
  staffDirectory?: Record<string, { name: string; voided?: boolean }>;
  /** @deprecated Compatibility fallback without void state. */
  staffNames?: Record<string, string>;
  /** In-range member topups (caller should already exclude void / `-1`). */
  topups?: SummaryTopupEvent[];
  /** In-range member outs (caller should already exclude void / `-1` / `in`). */
  checkouts?: SummaryCheckoutEvent[];
};

function ymd(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function hms(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

/**
 * `汇总-{from}-{to}-{HHmmss}.xlsx` — time suffix busts share/viewer caches that
 * reuse the same stem and keep showing a stale broken workbook.
 */
export function summaryExportFilename(
  from: number,
  to: number,
  now: number = Date.now(),
): string {
  return `汇总-${ymd(from)}-${ymd(to)}-${hms(now)}.xlsx`;
}

/** Empty cell placeholder — some mobile spreadsheet apps mishandle "" in col A. */
const EMPTY = "—";

function memberName(
  staffId: string,
  directory: Record<string, { name: string; voided?: boolean }> | undefined,
  names: Record<string, string> | undefined,
): string {
  const staff = directory?.[staffId];
  if (staff) return staff.voided ? `${staff.name}（已删除）` : staff.name;
  return names?.[staffId] ?? staffId;
}

type MoneyTriple = { topup: number; out: number; selfUse: number };

/**
 * Multi-sheet summary workbook: 库存 (#02) · 入库明细 (#03) · 充值出库 /
 * 充值出库明细 (#04). Unchecked bits emit no sheet.
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
        r.note ?? EMPTY,
      ];
    });

    const aoa: unknown[][] = [
      ["时间", "商品", "金额", "备注"],
      [
        EMPTY,
        formatProductQtyList(balanceItems) || EMPTY,
        formatCentsAsYuan(balanceAmount),
        balanceNote,
      ],
      ...body,
      ["合计", EMPTY, formatCentsAsYuan(balanceAmount + inboundSum), EMPTY],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "入库明细");
  }

  const topups = (input.topups ?? []).filter(
    (t) => t.staffId !== ADMIN_STAFF_ID,
  );
  const checkouts = (input.checkouts ?? []).filter(
    (c) => c.staffId !== ADMIN_STAFF_ID,
  );

  if (input.sheets.topupCheckout) {
    type Agg = MoneyTriple & { products: Array<{ title: string; qty: number }> };
    const byKey = new Map<string, Agg>();
    const ensure = (date: string, staffId: string): Agg => {
      const key = `${date}\0${staffId}`;
      let row = byKey.get(key);
      if (!row) {
        row = { topup: 0, out: 0, selfUse: 0, products: [] };
        byKey.set(key, row);
      }
      return row;
    };
    for (const t of topups) {
      const date = formatDate(t.timestamp);
      ensure(date, t.staffId).topup += t.amountCents;
    }
    for (const c of checkouts) {
      const date = formatDate(c.timestamp);
      const row = ensure(date, c.staffId);
      if (c.selfUse) row.selfUse += c.amountCents;
      else row.out += c.amountCents;
      row.products.push(...c.items);
    }
    const keys = [...byKey.keys()].sort((a, b) => {
      const [da, sa] = a.split("\0");
      const [db, sb] = b.split("\0");
      if (da !== db) return db!.localeCompare(da!); // newest date first
      const na = memberName(sa!, input.staffDirectory, input.staffNames);
      const nb = memberName(sb!, input.staffDirectory, input.staffNames);
      return na.localeCompare(nb, "zh");
    });
    const totals: MoneyTriple = { topup: 0, out: 0, selfUse: 0 };
    const body = keys.map((key) => {
      const [date, staffId] = key.split("\0") as [string, string];
      const row = byKey.get(key)!;
      totals.topup += row.topup;
      totals.out += row.out;
      totals.selfUse += row.selfUse;
      return [
        date,
        memberName(staffId, input.staffDirectory, input.staffNames),
        formatCentsAsYuan(row.topup),
        formatCentsAsYuan(row.out),
        formatCentsAsYuan(row.selfUse),
        formatProductQtyList(row.products) || EMPTY,
      ];
    });
    const aoa: unknown[][] = [
      ["日期", "会员", "充值", "出库", "自用", "出库商品"],
      ...(body.length > 0
        ? body
        : [[EMPTY, "（本时段无会员充值/出库）", "0.00", "0.00", "0.00", EMPTY]]),
      [
        "合计",
        EMPTY,
        formatCentsAsYuan(totals.topup),
        formatCentsAsYuan(totals.out),
        formatCentsAsYuan(totals.selfUse),
        EMPTY,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (!ws["!ref"]?.startsWith("A1")) {
      throw new Error("充值出库 sheet 未从 A1 起写");
    }
    XLSX.utils.book_append_sheet(wb, ws, "充值出库");
  }

  if (input.sheets.topupCheckoutDetail) {
    type Detail =
      | { kind: "topup"; ts: number; staffId: string; amount: number; note: string | null }
      | {
          kind: "out";
          ts: number;
          staffId: string;
          amount: number;
          selfUse: boolean;
          items: Array<{ title: string; qty: number }>;
        };
    const events: Detail[] = [
      ...topups.map(
        (t): Detail => ({
          kind: "topup",
          ts: t.timestamp,
          staffId: t.staffId,
          amount: t.amountCents,
          note: t.note,
        }),
      ),
      ...checkouts.map(
        (c): Detail => ({
          kind: "out",
          ts: c.timestamp,
          staffId: c.staffId,
          amount: c.amountCents,
          selfUse: c.selfUse,
          items: c.items,
        }),
      ),
    ];
    events.sort((a, b) => b.ts - a.ts || a.staffId.localeCompare(b.staffId));
    const totals: MoneyTriple = { topup: 0, out: 0, selfUse: 0 };
    const body = events.map((e) => {
      if (e.kind === "topup") {
        totals.topup += e.amount;
        return [
          formatDateTime(e.ts),
          memberName(e.staffId, input.staffDirectory, input.staffNames),
          formatCentsAsYuan(e.amount),
          "0.00",
          "0.00",
          e.note ?? EMPTY,
        ];
      }
      if (e.selfUse) totals.selfUse += e.amount;
      else totals.out += e.amount;
      return [
        formatDateTime(e.ts),
        memberName(e.staffId, input.staffDirectory, input.staffNames),
        "0.00",
        e.selfUse ? "0.00" : formatCentsAsYuan(e.amount),
        e.selfUse ? formatCentsAsYuan(e.amount) : "0.00",
        formatProductQtyList(e.items) || EMPTY,
      ];
    });
    const aoa: unknown[][] = [
      ["时间", "会员", "充值", "出库", "自用", "备注/商品"],
      ...(body.length > 0
        ? body
        : [[EMPTY, "（本时段无会员充值/出库）", "0.00", "0.00", "0.00", EMPTY]]),
      [
        "合计",
        EMPTY,
        formatCentsAsYuan(totals.topup),
        formatCentsAsYuan(totals.out),
        formatCentsAsYuan(totals.selfUse),
        EMPTY,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 18 }];
    if (!ws["!ref"]?.startsWith("A1")) {
      throw new Error("充值出库明细 sheet 未从 A1 起写");
    }
    XLSX.utils.book_append_sheet(wb, ws, "充值出库明细");
  }

  // xlsx rejects empty workbooks; transitional when only unimplemented bits are on.
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "（暂无）");
  }

  return XLSX.write(wb, {
    type: "base64",
    bookType: "xlsx",
    // Shared String Table: Honor / some OEM spreadsheet viewers mishandle
    // multi-sheet workbooks that inline every string (WPS/Excel are lenient).
    bookSST: true,
  }) as string;
}
