import type { HasId, StoragePort } from "@/data/port";
import { type Cents, cents, id, now } from "@/data/primitives";
import type { ProductRepository } from "@/data/product";

export type Direction = "in" | "out";

/** Stock record header — one staff, a direction, a user-settable timestamp. */
export interface StockRecord extends HasId {
  staff_id: string;
  direction: Direction;
  timestamp: number; // user-settable (defaults to now) — backdatable
  note: string | null;
  voided_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * A single item line on a stock record. `title` + `unit_price` are FROZEN at
 * posting time (snapshot); `product_id` is a retained FK so derivation (#07) and
 * post-edit linkage survive later product edits/voids. `line_amount` is the
 * frozen historical value (unit_price × qty).
 */
export interface StockItem extends HasId {
  record_id: string;
  product_id: string;
  title: string;
  unit_price: Cents;
  qty: number;
  line_amount: Cents;
}

export interface StockRecordCreateInput {
  staff_id: string;
  direction: Direction;
  timestamp?: number; // defaults to now
  note?: string;
  items: Array<{ product_id: string; qty: number }>;
}

export interface RecordWithItems {
  record: StockRecord;
  items: StockItem[];
}

export interface RecordFilter {
  staff_id?: string;
  direction?: Direction;
  date_range?: { from?: number; to?: number };
}

/**
 * Stock record repository — the movement ledger's write+read foundation.
 *
 * `create` validates each product FK via `productRepo.getById`, snapshots the
 * product's title + purchase_price→unit_price into each item, and persists the
 * header + items atomically. Create deliberately does NOT call the audit
 * provider (PRD: record create is not audited — only edit/void are, in #06).
 */
export class StockRecordRepository {
  constructor(
    private storage: StoragePort,
    private products: ProductRepository,
  ) {}

  async create(input: StockRecordCreateInput): Promise<RecordWithItems> {
    const ts = now();
    const record: StockRecord = {
      id: id(),
      staff_id: input.staff_id,
      direction: input.direction,
      timestamp: input.timestamp ?? ts,
      note: input.note ?? null,
      voided_at: null,
      created_at: ts,
      updated_at: ts,
    };
    const items: StockItem[] = [];
    for (const line of input.items) {
      if (!Number.isInteger(line.qty)) {
        throw new RangeError(`qty must be an integer, got ${line.qty}`);
      }
      const product = await this.products.getById(line.product_id);
      if (!product) throw new Error(`product ${line.product_id} not found`);
      items.push({
        id: id(),
        record_id: record.id,
        product_id: product.id,
        title: product.title,
        unit_price: product.purchase_price,
        qty: line.qty,
        line_amount: cents(product.purchase_price * line.qty),
      });
    }
    await this.storage.withTransaction(async () => {
      await this.storage.insert("stock_record", record);
      for (const item of items) await this.storage.insert("stock_record_item", item);
    });
    return { record, items };
  }

  async getById(recordId: string): Promise<RecordWithItems | null> {
    const record = await this.storage.findById<StockRecord>("stock_record", recordId);
    if (!record) return null;
    const items = await this.storage.find<StockItem>("stock_record_item", {
      where: { record_id: recordId },
    });
    return { record, items };
  }

  async list(filter?: RecordFilter): Promise<RecordWithItems[]> {
    const records = await this.storage.find<StockRecord>("stock_record", {
      orderBy: { field: "timestamp", dir: "asc" },
    });
    const matched = records
      .filter((r) => r.voided_at == null) // voided excluded by default
      .filter((r) => matchesFilter(r, filter));
    return this.loadItemsFor(matched);
  }

  async staffHistory(staffId: string): Promise<RecordWithItems[]> {
    return this.list({ staff_id: staffId });
  }

  /** Load items for many records in one read, grouped by record_id (avoids N+1). */
  private async loadItemsFor(records: StockRecord[]): Promise<RecordWithItems[]> {
    if (records.length === 0) return [];
    const allItems = await this.storage.find<StockItem>("stock_record_item");
    const byRecord = new Map<string, StockItem[]>();
    for (const item of allItems) {
      const arr = byRecord.get(item.record_id);
      if (arr) arr.push(item);
      else byRecord.set(item.record_id, [item]);
    }
    return records.map((record) => ({ record, items: byRecord.get(record.id) ?? [] }));
  }
}

function matchesFilter(record: StockRecord, filter?: RecordFilter): boolean {
  if (!filter) return true;
  if (filter.staff_id !== undefined && record.staff_id !== filter.staff_id) return false;
  if (filter.direction !== undefined && record.direction !== filter.direction) return false;
  const range = filter.date_range;
  if (range?.from != null && record.timestamp < range.from) return false;
  if (range?.to != null && record.timestamp > range.to) return false;
  return true;
}
