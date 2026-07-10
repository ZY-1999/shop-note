import { AuditProvider } from "@/data/audit";
import type { HasId, StoragePort } from "@/data/port";
import { type Cents, cents, id, now } from "@/data/primitives";
import type { ProductRepository } from "@/data/product";
import { ADMIN_STAFF_ID } from "@/data/staff";

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
 * frozen historical value (unit_price × qty). Item `id`s are stable across the
 * record's life — this is the contract #06's edit-merge keys on.
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
  timestamp?: number;
  note?: string;
  items: Array<{ product_id: string; qty: number }>;
}

export interface StockRecordUpdatePatch {
  staff_id?: string;
  direction?: Direction;
  timestamp?: number;
  note?: string | null;
  /** When provided, the full intended item list (upsert semantics — see update). */
  items?: Array<{ id?: string; product_id: string; qty: number }>;
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
 * Stock record repository — the movement ledger.
 *
 * `create` (#05) validates each product FK, snapshots title + unit_price, and
 * persists atomically — but does NOT audit (PRD: record create is not audited).
 * `update`/`void` (#06) DO audit, via the audit provider, atomically with the
 * write. There is no delete method — records are voided, never hard-removed.
 */
export class StockRecordRepository {
  constructor(
    private storage: StoragePort,
    private products: ProductRepository,
    private audit: AuditProvider,
  ) {}

  async create(input: StockRecordCreateInput): Promise<RecordWithItems> {
    // Restock (`direction: 'in'`) is global — only the admin '-1' may receive it.
    // A normal member checking out uses `direction: 'out'`. (stock-balance-refactor)
    if (input.direction === "in" && input.staff_id !== ADMIN_STAFF_ID) {
      throw new Error(
        `direction 'in' (restock) requires the admin staff_id '${ADMIN_STAFF_ID}'`,
      );
    }
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

  /**
   * Edit a posted record — header fields and/or item lines.
   *
   * Item merge (the riskiest behavior in the project): each submitted line is
   * matched to a stored item by its stable `id`. A line is "touched" iff it is
   * new (no matching id) or its `product_id`/`qty` differs from the stored line;
   * touched lines RESNAPSHOT title/unit_price/line_amount from the product's
   * current state. Lines unchanged by the edit keep their ORIGINAL posting-time
   * snapshot. Stored items not mentioned in the submission are kept as-is
   * (upsert semantics — only the submitted lines are reconciled).
   */
  async update(recordId: string, patch: StockRecordUpdatePatch): Promise<RecordWithItems> {
    return this.storage.withTransaction(async () => {
      const existing = await this.getById(recordId);
      if (!existing) throw new Error(`stock_record ${recordId} not found`);
      const { record: current, items: storedItems } = existing;

      const ts = now();
      const nextRecord: StockRecord = {
        ...current,
        staff_id: patch.staff_id ?? current.staff_id,
        direction: patch.direction ?? current.direction,
        timestamp: patch.timestamp ?? current.timestamp,
        note: patch.note !== undefined ? patch.note : current.note,
        updated_at: ts,
      };
      // Same invariant as create: an effective direction 'in' must be owned by '-1'.
      // Closes the edit path that could otherwise flip an 'out' record to 'in'
      // under a normal member. (stock-balance-refactor)
      if (nextRecord.direction === "in" && nextRecord.staff_id !== ADMIN_STAFF_ID) {
        throw new Error(
          `direction 'in' (restock) requires the admin staff_id '${ADMIN_STAFF_ID}'`,
        );
      }

      let nextItems = storedItems;
      if (patch.items) {
        nextItems = await this.mergeItems(recordId, patch.items, storedItems);
        for (const item of nextItems) {
          const wasUpdated = await this.storage.update<StockItem>("stock_record_item", item.id, item);
          if (!wasUpdated) await this.storage.insert("stock_record_item", item);
        }
      }

      await this.storage.update<StockRecord>("stock_record", recordId, {
        staff_id: nextRecord.staff_id,
        direction: nextRecord.direction,
        timestamp: nextRecord.timestamp,
        note: nextRecord.note,
        updated_at: ts,
      });

      await this.audit.logEvent({
        action: "update",
        entity_type: "stock_record",
        entity_id: recordId,
        before: auditableRecord(current, storedItems),
        after: auditableRecord(nextRecord, nextItems),
      });

      return { record: nextRecord, items: nextItems };
    });
  }

  /** Void a record — sets voided_at; never removes data. Audited as 'void'. */
  async void(recordId: string): Promise<RecordWithItems> {
    return this.storage.withTransaction(async () => {
      const existing = await this.getById(recordId);
      if (!existing) throw new Error(`stock_record ${recordId} not found`);
      const { record: current, items } = existing;
      const ts = now();
      const nextRecord: StockRecord = { ...current, voided_at: ts, updated_at: ts };
      await this.storage.update<StockRecord>("stock_record", recordId, { voided_at: ts, updated_at: ts });
      await this.audit.logEvent({
        action: "void",
        entity_type: "stock_record",
        entity_id: recordId,
        before: auditableRecord(current, items),
        after: auditableRecord(nextRecord, items),
      });
      return { record: nextRecord, items };
    });
  }

  /**
   * Merge submitted item lines into the stored set. Touched (changed/new) lines
   * resnapshot from the product's current state; unchanged matched lines keep
   * their original snapshot; unmentioned stored lines are carried forward.
   */
  private async mergeItems(
    recordId: string,
    submission: Array<{ id?: string; product_id: string; qty: number }>,
    storedItems: StockItem[],
  ): Promise<StockItem[]> {
    const storedById = new Map(storedItems.map((i) => [i.id, i]));
    const resolved: StockItem[] = [];
    for (const line of submission) {
      if (!Number.isInteger(line.qty)) {
        throw new RangeError(`qty must be an integer, got ${line.qty}`);
      }
      const stored = line.id ? storedById.get(line.id) : undefined;
      const untouched =
        stored !== undefined && stored.product_id === line.product_id && stored.qty === line.qty;
      if (untouched) {
        resolved.push(stored); // keep original snapshot verbatim
        storedById.delete(stored.id);
      } else {
        const product = await this.products.getById(line.product_id);
        if (!product) throw new Error(`product ${line.product_id} not found`);
        resolved.push({
          id: stored?.id ?? id(), // keep id when updating an existing line; new id for new lines
          record_id: recordId,
          product_id: product.id,
          title: product.title,
          unit_price: product.purchase_price,
          qty: line.qty,
          line_amount: cents(product.purchase_price * line.qty),
        });
        if (stored) storedById.delete(stored.id);
      }
    }
    // Stored items not mentioned in the submission are kept (upsert semantics).
    for (const remaining of storedById.values()) resolved.push(remaining);
    return resolved;
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

/**
 * Project a record + its items into a plain object whose field-equality diff
 * (computed by the audit provider) captures what an operator changed. Header
 * fields compared by value; `items` is a sorted signature so the diff reflects
 * any added/removed/changed line (qty/price/product) without leaking internal
 * ids/timestamps into the audit trail.
 */
function auditableRecord(record: StockRecord, items: StockItem[]): Record<string, unknown> {
  return {
    staff_id: record.staff_id,
    direction: record.direction,
    timestamp: record.timestamp,
    note: record.note,
    voided_at: record.voided_at,
    items: items
      .map((i) => `${i.product_id}:${i.qty}:${i.unit_price}`)
      .sort()
      .join("|"),
  };
}
