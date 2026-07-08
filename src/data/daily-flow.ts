import type { StockRecordRepository } from "@/data/stock-record";

export interface DailyFlowRow {
  date: string; // 'YYYY-MM-DD' — local calendar day of record.timestamp
  staff_id: string;
  in_amount: number; // Cents — Σ frozen line_amount over the day's unvoided 'in' records for this staff
  out_amount: number; // Cents — Σ frozen line_amount over the day's unvoided 'out' records for this staff
}

export interface DailyFlowFilter {
  staff_id?: string;
  date_range?: { from?: number; to?: number }; // epoch ms, compared against record.timestamp
}

/**
 * Derived daily flow — a read-only projection of the movement ledger that
 * answers "what money moved, per (day, staff)". Sibling of `Inventory`, with
 * the same derivation discipline: never stored, recomputed on every call, so
 * there is no cached figure to drift and no invalidation step when a record is
 * voided or edited (the next read reflects it). Stays in TypeScript — not
 * pushed into the port/SQL — so the in-memory Jest suite proves exactly what
 * production runs.
 *
 * Amounts are the FROZEN snapshot `line_amount` (unit_price × qty at posting /
 * last-touch edit time), NOT current-price-revalued — the流水 answers "that
 * day's money", not "what is it worth now" (contrast with `Inventory`'s cost
 * revaluation). Days are the operator's LOCAL calendar day (a single-operator
 * app thinks in local days); bucketing by UTC would split a working day at
 * 08:00 CST.
 */
export class DailyFlow {
  constructor(private stockRecords: StockRecordRepository) {}

  async flow(filter?: DailyFlowFilter): Promise<DailyFlowRow[]> {
    const records = await this.stockRecords.list(); // voided excluded by default
    const buckets = new Map<string, DailyFlowRow>();
    for (const { record, items } of records) {
      if (!passesFilter(record, filter)) continue;
      const date = dayBucket(record.timestamp);
      const key = `${date}|${record.staff_id}`;
      let row = buckets.get(key);
      if (row === undefined) {
        row = { date, staff_id: record.staff_id, in_amount: 0, out_amount: 0 };
        buckets.set(key, row);
      }
      const amount = sumLineAmounts(items);
      if (record.direction === "in") row.in_amount += amount;
      else row.out_amount += amount;
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

function passesFilter(
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
