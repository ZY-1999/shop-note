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
