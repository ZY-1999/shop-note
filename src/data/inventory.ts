import type { Product, ProductRepository } from "@/data/product";
import type { Direction, StockItem, StockRecordRepository } from "@/data/stock-record";

export interface Aggregate {
  product: Product;
  total_qty: number;
  total_cost: number; // in cents; may be negative (欠货)
}

interface ItemMove {
  item: StockItem;
  direction: Direction;
}

/**
 * Derived global inventory — a read-only projection over the unvoided movement
 * ledger.
 *
 * Stock-balance-refactor narrows this from a multi-role "per-staff holdings +
 * shop aggregate" to a single responsibility: **global inventory** (`in` restock
 * from the admin `-1`, `out` from members, summed across all staff). The old
 * per-staff `balance` / `staffInventory` / `staffSummaries` reads are gone —
 * members no longer hold stock; member money lives in `MemberBalance` (spec 03).
 *
 * Never stores a figure: every call recomputes from stock records + the
 * product's current price. This is what guarantees no drift (no cached figure to
 * diverge) and instant cost revaluation (a price change is reflected on the next
 * read with no invalidation step). Negative qty/cost are returned as-is (PRD:
 * 欠货 allowed — a member can check out more than the global stock holds).
 * Derivation stays in TypeScript — not pushed into the port/SQL — so the
 * in-memory Jest suite proves exactly what production runs.
 */
export class Inventory {
  constructor(
    private stockRecords: StockRecordRepository,
    private products: ProductRepository,
  ) {}

  /**
   * Global per-product stock: `Σ(restock 'in' qty) − Σ(member 'out' qty)` across
   * every staff (restock `in` lands under `-1`, member `out` under the member).
   * The derivation is direction-sign-only — it does not care WHO owns a record,
   * only its sign — so the new `-1`-restock model converges here with no logic
   * change. Negative `total_qty` = 欠货 (allowed, invariant #5).
   */
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

/** Group moves into product_id → net qty (in − out). */
function aggregateQty(moves: ItemMove[]): Map<string, number> {
  const qtyByProduct = new Map<string, number>();
  for (const { item, direction } of moves) {
    const delta = direction === "in" ? item.qty : -item.qty;
    qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + delta);
  }
  return qtyByProduct;
}
