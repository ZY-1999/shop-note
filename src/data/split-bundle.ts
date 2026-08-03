/**
 * Split a money amount into whole bundles + a retail remainder against a unit
 * price (stock-balance-refactor).
 *
 * `bundles = floor(amount / unitPrice)`, `retail = amount % unitPrice`. Pure —
 * no adapter, no I/O — so the data-project Jest covers it at the highest seam
 * (ADR-0006), and all three consumers (出库 record detail, 汇总 aggregation in
 * spec 05, and any future one) share this single source to avoid floor/mod drift.
 *
 * `unitPrice <= 0` (cold start, no unit price configured yet) → 0 bundles, the
 * full amount as retail (no division by zero, no NaN). Inputs are integer Cents.
 */
export interface BundleRetail {
  bundles: number;
  retail: number;
}

export function splitBundleRetail(amountCents: number, unitPriceCents: number): BundleRetail {
  if (!Number.isInteger(amountCents) || !Number.isInteger(unitPriceCents)) {
    throw new RangeError(`splitBundleRetail expects integer cents, got ${amountCents} / ${unitPriceCents}`);
  }
  if (unitPriceCents <= 0) return { bundles: 0, retail: amountCents };
  return { bundles: Math.floor(amountCents / unitPriceCents), retail: amountCents % unitPriceCents };
}

/**
 * Minimal record-with-items view `aggregateBundleRetail` reads — structural, so a
 * full `RecordWithItems` satisfies it without a hard domain coupling here.
 */
export interface BundleRetailRecord {
  record: {
    direction: "in" | "out";
    unit_price_snapshot?: number | null;
    /** 缺省视作非自用，兼容既有调用方。 */
    self_use?: boolean;
  };
  items: ReadonlyArray<{ line_amount: number }>;
}

/**
 * Σ bundles / Σ retail over a set of records — each 'out' record split via its
 * OWN frozen `unit_price_snapshot` (not a shared/current price), 'in' records
 * contribute nothing. Self-use checkouts (`out && self_use`) are skipped for
 * bundles/retail only (amounts still flow through inventory/balance/dailyFlow).
 * The shared aggregation behind every flow-summary surface: the 汇总 range
 * header, its per-day and per-member drill-downs, and the member-detail summary
 * + per-day separators — one source so floor/mod never drifts between them
 * (same discipline as `splitBundleRetail`).
 */
export function aggregateBundleRetail(
  records: ReadonlyArray<BundleRetailRecord>,
): BundleRetail {
  let bundles = 0;
  let retail = 0;
  for (const rw of records) {
    if (rw.record.direction !== "out") continue;
    if (rw.record.self_use === true) continue;
    const amount = rw.items.reduce((sum, i) => sum + i.line_amount, 0);
    const split = splitBundleRetail(amount, rw.record.unit_price_snapshot ?? 0);
    bundles += split.bundles;
    retail += split.retail;
  }
  return { bundles, retail };
}
