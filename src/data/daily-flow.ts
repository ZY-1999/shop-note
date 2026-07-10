import type { StockRecordRepository } from "@/data/stock-record";
import type { TopupRepository } from "@/data/topup";

export interface DailyFlowRow {
  date: string; // 'YYYY-MM-DD' — local calendar day of the event's timestamp
  staff_id: string; // '-1' for restock (admin) — rendered as a 补货 event, not a member
  in_amount: number; // Cents — Σ frozen line_amount over the day's unvoided 'in' (restock, -1) records
  out_amount: number; // Cents — Σ frozen line_amount over the day's unvoided 'out' (member) records
  topup_amount: number; // Cents — Σ amount over the day's unvoided top-ups for this member
}

export interface DailyFlowFilter {
  staff_id?: string;
  date_range?: { from?: number; to?: number }; // epoch ms, compared against each event's timestamp
}

/**
 * Derived综合流水 — a read-only projection answering "what moved each day, per
 * staff": restock (`in` under admin `-1`), member checkouts (`out`), and member
 * top-ups. Sibling of `Inventory`, same derivation discipline: never stored,
 * recomputed on every call (no drift, no invalidation step on void/edit). Stays
 * in TypeScript so the in-memory Jest suite proves exactly what production runs.
 *
 * Stock-balance-refactor extends this from the old in/out-only flow by folding
 * in top-ups (the third event type) — the (day, staff) bucket shape is unchanged,
 * so the summary tab's day×staff grouping carries over; `-1` restock lands in its
 * own (-1, day) bucket that the UI labels 「补货」 (US12: restock is not a member).
 *
 * Amounts are the FROZEN snapshot `line_amount` (stock) or `amount` (top-up), NOT
 * current-price-revalued — the流水 answers "that day's money", not "what is it
 * worth now". Days are the operator's LOCAL calendar day.
 */
export class DailyFlow {
  constructor(
    private stockRecords: StockRecordRepository,
    private topups: TopupRepository,
  ) {}

  async flow(filter?: DailyFlowFilter): Promise<DailyFlowRow[]> {
    const records = await this.stockRecords.list(); // voided excluded by default
    const buckets = new Map<string, DailyFlowRow>();
    const ensure = (date: string, staffId: string): DailyFlowRow => {
      const key = `${date}|${staffId}`;
      let row = buckets.get(key);
      if (row === undefined) {
        row = { date, staff_id: staffId, in_amount: 0, out_amount: 0, topup_amount: 0 };
        buckets.set(key, row);
      }
      return row;
    };
    for (const { record, items } of records) {
      if (!passesRecordFilter(record, filter)) continue;
      const row = ensure(dayBucket(record.timestamp), record.staff_id);
      const amount = sumLineAmounts(items);
      if (record.direction === "in") row.in_amount += amount;
      else row.out_amount += amount;
    }
    // Fold top-ups into each member's (day, staff) bucket.
    for (const topup of await this.topups.list()) {
      if (!passesTopupFilter(topup, filter)) continue;
      const row = ensure(dayBucket(topup.timestamp), topup.staff_id);
      row.topup_amount += topup.amount;
    }
    return [...buckets.values()].sort(byDateDesc);
  }
}

/** Σ line_amount over a record's item lines (the frozen money that moved). */
function sumLineAmounts(items: ReadonlyArray<{ line_amount: number }>): number {
  let total = 0;
  for (const item of items) total += item.line_amount;
  return total;
}

/** Local calendar day 'YYYY-MM-DD' of an epoch-ms timestamp. */
function dayBucket(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Newest day first; ties (same date, different staff) keep insertion order. */
function byDateDesc(a: DailyFlowRow, b: DailyFlowRow): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

function passesRecordFilter(
  record: { staff_id: string; timestamp: number },
  filter?: DailyFlowFilter,
): boolean {
  if (!filter) return true;
  if (filter.staff_id !== undefined && record.staff_id !== filter.staff_id) return false;
  const range = filter.date_range;
  if (range?.from != null && record.timestamp < range.from) return false;
  if (range?.to != null && record.timestamp > range.to) return false;
  return true;
}

function passesTopupFilter(
  topup: { staff_id: string; timestamp: number },
  filter?: DailyFlowFilter,
): boolean {
  if (!filter) return true;
  if (filter.staff_id !== undefined && topup.staff_id !== filter.staff_id) return false;
  const range = filter.date_range;
  if (range?.from != null && topup.timestamp < range.from) return false;
  if (range?.to != null && topup.timestamp > range.to) return false;
  return true;
}
