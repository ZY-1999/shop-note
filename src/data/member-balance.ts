import type { Cents } from "@/data/primitives";
import type { StockRecordRepository } from "@/data/stock-record";
import type { TopupRepository } from "@/data/topup";

/**
 * Derived member money balance (stock-balance-refactor).
 *
 * `balance(staff) = Σ(unvoided topup amount) − Σ(unvoided 'out' record
 * line_amount)` for that member. Never stored (invariant #4 — recomputed every
 * read, same discipline as `Inventory.shopAggregate`); negative = 欠款 (invariant
 * #5 — a member may check out more than they have topped up, returned as-is with
 * no clamp/error). Pure derived read, no write surface.
 *
 * Split from `Inventory` on purpose: member money and global stock are two deep
 * modules, not one mixed god-object — money lives here, qty lives in `Inventory`.
 */
export interface Balance {
  amount: Cents; // may be negative (欠款)
}

export class MemberBalance {
  constructor(
    private topups: TopupRepository,
    private stockRecords: StockRecordRepository,
  ) {}

  async balance(staffId: string): Promise<Balance> {
    const topups = await this.topups.list({ staff_id: staffId });
    const toppedUp = topups.reduce((sum, t) => sum + t.amount, 0);

    // A member's records are all 'out' (restock 'in' is owned by admin -1), so
    // staffHistory is their checkouts; sum the frozen line_amount of each.
    const history = await this.stockRecords.staffHistory(staffId);
    const spent = history
      .filter((rw) => rw.record.direction === "out")
      .reduce((sum, rw) => sum + rw.items.reduce((s, i) => s + i.line_amount, 0), 0);

    return { amount: (toppedUp - spent) as Cents };
  }
}
