# ADR-0002: Derived inventory is never stored

- Status: **Accepted** (2026-07-08)
- Scope: shop-management-system data layer (spec #07)

## Context

The shop needs, per (staff, product): a net quantity **balance** and a **cost amount**, plus a shop-level **aggregate**. The PRD requires two strong properties:

1. **No drift** — the derived figure must always equal a fresh recomputation from the movement ledger.
2. **Instant cost revaluation** — when a product's `purchase_price` changes, the cost amount reflects it on the next read, with no invalidation step.

The natural temptation is to store/cache balances for read performance.

## Decision

Derived inventory is **never persisted**. `Inventory` is a read-only projection that recomputes every call:

- `balance(staff, product) = Σ(qty, direction='in', unvoided) − Σ(qty, direction='out', unvoided)`
- `cost_amount = product.purchase_price (current) × balance`
- `staffInventory` groups per product; `shopAggregate` sums across staff.

This is enforced **architecturally, not just by convention**: the `Inventory` class takes `StockRecordRepository` + `ProductRepository` as *read* collaborators and has **no `StoragePort` parameter** — it physically cannot persist. The class also exposes no save/persist/cache method (asserted by a `@ts-expect-error` compile-time check in the test suite).

## Consequences

- **+ No drift is guaranteed by construction.** There is no cached figure to diverge from the ledger — the invariant is structural, not a discipline to maintain.
- **+ Instant revaluation is free.** Cost reads the product's current price on every call, so a price change is reflected with no invalidation step.
- **+ Single test seam (with [ADR-0001](0001-storage-port-shape.md)).** The derivation runs in pure TypeScript proven by the same in-memory Jest suite.
- **+ Void/edit propagation is automatic.** Every read walks unvoided records via `StockRecordRepository.list()` (voided excluded by default), so a void or edit is reflected on the next read with no explicit recompute call.
- **− Each read is O(unvoided items).** At ~1000 products and modest record growth this is fine for a single-operator app; the PRD explicitly defers performance until measured.

## Alternatives considered

- **Stored authoritative balance** (update the stored balance on every post/void/edit). Rejected: it directly violates the no-drift rule — any forgotten invalidation path (a new edit case, a bulk void) silently diverges the cache from the ledger. The correctness cost is too high for the read-speed gain at this scale.
- **Derived cache with explicit invalidation** (memoise, invalidate on #04/#05/#06 writes). Held in reserve as a rework path, **not** adopted now: the no-drift rule only forbids a *stored authoritative* balance, not a correctly-invalidated cache. Defer until a measured read-path slowdown justifies the invalidation surface area.

## References

- Spec: [.scratch/2026-07-08-shop-management-system/specs/07-derived-inventory.md](../../.scratch/2026-07-08-shop-management-system/specs/07-derived-inventory.md)
- Code: [src/data/inventory.ts](../../src/data/inventory.ts)
- Related: [ADR-0001](0001-storage-port-shape.md) — storage port shape
