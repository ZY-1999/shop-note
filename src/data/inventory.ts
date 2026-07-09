import type { Product, ProductRepository } from "@/data/product";
import type { Direction, StockItem, StockRecordRepository } from "@/data/stock-record";

export interface Balance {
  product: Product;
  qty: number;
  cost_amount: number; // in cents (current price × qty); may be negative
}

export interface Aggregate {
  product: Product;
  total_qty: number;
  total_cost: number; // in cents; may be negative
}

/**
 * Per-staff holding rollup (spec #05) — the one-ledger-pass, grouped-by-staff
 * projection the 记账 list and 汇总's by-staff view consume. `total_amount` is a
 * cents-valued number (Σ current purchase_price × balance qty); negative means
 * 欠货. Reuses the same derivation discipline as the other reads (never stored).
 */
export interface StaffSummary {
  staff_id: string;
  variety: number; // distinct products with a non-zero balance
  total_qty: number; // Σ balance qty across products (may be negative)
  total_amount: number; // cents — Σ (current purchase_price × balance qty)
  has_negative: boolean; // any product balance < 0 → 欠货 flag
}

interface ItemMove {
  item: StockItem;
  direction: Direction;
}

/**
 * Derived inventory — a read-only projection over the unvoided movement ledger.
 *
 * Never stores a balance: every call recomputes from stock records + the
 * product's current price. This is what guarantees no drift (no cached figure
 * to diverge) and instant cost revaluation (a price change is reflected on the
 * next read with no invalidation step). Negative qty/cost are returned as-is
 * (PRD: 欠货 allowed). Derivation stays in TypeScript — not pushed into the
 * port/SQL — so the in-memory Jest suite proves exactly what production runs.
 */
export class Inventory {
  constructor(
    private stockRecords: StockRecordRepository,
    private products: ProductRepository,
  ) {}

  async balance(staffId: string, productId: string): Promise<{ qty: number; cost_amount: number }> {
    const moves = await this.loadStaffMoves(staffId);
    const qty = sumQty(moves, productId);
    const product = await this.products.getById(productId);
    const price = product?.purchase_price ?? 0; // historical FK may outlive a voided product
    return { qty, cost_amount: price * qty };
  }

  async staffInventory(staffId: string): Promise<Balance[]> {
    const moves = await this.loadStaffMoves(staffId);
    return this.toList(aggregateQty(moves), (product, qty) => ({
      product,
      qty,
      cost_amount: product.purchase_price * qty,
    }));
  }

  async shopAggregate(): Promise<Aggregate[]> {
    const records = await this.stockRecords.list(); // voided excluded by default
    const moves: ItemMove[] = [];
    for (const { record, items } of records) {
      for (const item of items) moves.push({ item, direction: record.direction });
    }
    return this.toList(aggregateQty(moves), (product, totalQty) => ({
      product,
      total_qty: totalQty,
      total_cost: product.purchase_price * totalQty,
    }));
  }

  /**
   * Per-staff holding rollup in ONE ledger pass (spec #05 / ADR-0005): group every
   * unvoided move by staff_id → product_id → net qty, then per staff compute
   * variety / total_qty / total_amount (joining the current price, as
   * `shopAggregate` does) / has_negative. N staff without N scans — the PRD's
   * "不对每员工单独算 N 次". Pure, never stored.
   */
  async staffSummaries(): Promise<StaffSummary[]> {
    const records = await this.stockRecords.list(); // voided excluded by default
    // staff_id → (product_id → net qty)
    const qtyByStaffProduct = new Map<string, Map<string, number>>();
    for (const { record, items } of records) {
      let byProduct = qtyByStaffProduct.get(record.staff_id);
      if (!byProduct) {
        byProduct = new Map();
        qtyByStaffProduct.set(record.staff_id, byProduct);
      }
      for (const item of items) {
        const delta = record.direction === "in" ? item.qty : -item.qty;
        byProduct.set(item.product_id, (byProduct.get(item.product_id) ?? 0) + delta);
      }
    }

    const summaries: StaffSummary[] = [];
    for (const [staff_id, byProduct] of qtyByStaffProduct) {
      let variety = 0;
      let total_qty = 0;
      let total_amount = 0;
      let has_negative = false;
      for (const [productId, qty] of byProduct) {
        if (qty === 0) continue; // only non-zero balances count toward variety/total
        variety += 1;
        total_qty += qty;
        const product = await this.products.getById(productId);
        const price = product?.purchase_price ?? 0; // historical FK may outlive a voided product
        total_amount += price * qty;
        if (qty < 0) has_negative = true;
      }
      summaries.push({ staff_id, variety, total_qty, total_amount, has_negative });
    }
    return summaries;
  }

  /** A staff's unvoided item moves (records already exclude voided). */
  private async loadStaffMoves(staffId: string): Promise<ItemMove[]> {
    const records = await this.stockRecords.staffHistory(staffId);
    const moves: ItemMove[] = [];
    for (const { record, items } of records) {
      for (const item of items) moves.push({ item, direction: record.direction });
    }
    return moves;
  }

  /** Materialize per-product rows, joining each to the current product. */
  private async toList<T>(
    qtyByProduct: Map<string, number>,
    build: (product: Product, qty: number) => T,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (const [productId, qty] of qtyByProduct) {
      const product = await this.products.getById(productId);
      if (!product) continue; // historical FK outlives a voided product, so this is rare
      rows.push(build(product, qty));
    }
    return rows;
  }
}

/** Σ(in qty) − Σ(out qty) for one product across the given moves. */
function sumQty(moves: ItemMove[], productId: string): number {
  let qty = 0;
  for (const { item, direction } of moves) {
    if (item.product_id !== productId) continue;
    qty += direction === "in" ? item.qty : -item.qty;
  }
  return qty;
}

/** Group moves into product_id → net qty (in − out). */
function aggregateQty(moves: ItemMove[]): Map<string, number> {
  const qtyByProduct = new Map<string, number>();
  for (const { item, direction } of moves) {
    const delta = direction === "in" ? item.qty : -item.qty;
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + delta);
  }
  return qtyByProduct;
}
