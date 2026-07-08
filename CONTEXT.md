# shop-note — Project Context

> Single-context glossary for the shop-management domain. Source of truth for ubiquitous language; code and specs defer to the terms here. Created 2026-07-08 during the SDD build of the data layer (specs #01–#07); extend as the domain grows.

## What this is

`shop-note` is a **local-first, single-operator, offline** shop management app (Expo SDK 57 / React Native). No backend, no sync. The first deliverable is a pure-TypeScript data layer ([src/data/](src/data/)) — staff, products, stock records, audit, and derived inventory over a typed storage port. UI is not yet built.

Key decisions live in [docs/adr/](docs/adr/); the code terrain is mapped in [docs/codemap/project.md](docs/codemap/project.md).

## Ubiquitous Language

| Term | Meaning | Notes |
|---|---|---|
| **员工 Staff** | A shop operator; the owner stock records are attributed to (`staff_id`). | Soft-deleted via `voided_at`. |
| **商品 Product** | Anything that can be moved in/out of stock. Fields: `title`, `code`, `category`, `purchase_price`. | Soft-deleted via `voided_at`. |
| **进价 purchase_price** | A product's current purchase price, in `Cents`. | Drives cost revaluation; stored on the product, not the record. |
| **库存记录 Stock Record** | One in/out event (`direction: "in" \| "out"`), attributed to a staff, carrying one or more **条目**. | `create` is not audited; `edit`/`void` are. |
| **条目 Stock Item** | A line within a stock record: product ref + qty + a frozen snapshot. | `line_amount = unit_price × qty`. |
| **快照 Snapshot** | At posting time each item freezes `title` + `unit_price` from the product. | On edit, only *touched* lines resnapshot to the current price; untouched lines keep their original snapshot. |
| **Cents** | Branded integer type for money (units = 分, not 元). Avoids float error. | See [src/data/primitives.ts](src/data/primitives.ts). |
| **line_amount** | An item's amount = `unit_price × qty`, in `Cents`. | Computed at posting, stored on the item. |
| **派生余额 Derived balance** | `balance(staff, product) = Σ(in qty, unvoided) − Σ(out qty, unvoided)`. | **Never stored** — recomputed every read (ADR-0002). |
| **成本金额 cost_amount** | `current purchase_price × balance qty`, in `Cents`. | Revalued instantly on price change (never stored). |
| **店铺汇总 shopAggregate** | Cross-staff sum of balances/cost per product. | Derived, never stored. |
| **欠货 Negative inventory** | `balance < 0` (more `out` than `in`). Allowed — returned as-is, no clamp, no error. | PRD invariant. |
| **作废 Void** | Soft-delete: set `voided_at`. The record + its items remain (never hard-removed); excluded from `list`/`staffHistory`/derivation. | No `delete` API exists anywhere (ADR-0001). |
| **审计 Audit** | Per-mutate field-level diff timeline. Actions: `create`/`update`/`void`/`restore`. | Stock-record `create` is intentionally not audited. |
| **StoragePort** | The single test seam — a dumb typed row store (`withTransaction`/`insert`/`findById`/`update`/`find`). | Two adapters: `InMemoryAdapter` (tests) / `ExpoSqliteAdapter` (prod stub). See ADR-0001. |

## Invariants

These hold across the whole data layer; code is shaped to make breaking them hard.

1. **No hard deletes.** Everything is voided (`voided_at`), never erased. `StoragePort` has no `remove`.
2. **Money is integer `Cents`.** Never a float. Quantities are plain integers.
3. **Snapshots are frozen at posting.** An item's `title`/`unit_price` don't track the product after posting — except a *touched* line on edit, which resnapshots to the then-current price.
4. **Derived figures are never stored.** Balances/cost/aggregate are recomputed from the ledger every read (ADR-0002).
5. **Negative inventory is allowed.** No clamp, no error — 欠货 is a real state.
6. **Every mutate is audited** (except stock-record `create`) inside a `withTransaction` — no change without an audit entry, no audit entry without a change.

## Pointers

- **PRD**: [.scratch/2026-07-08-shop-management-system/01-shop-management-system.md](.scratch/2026-07-08-shop-management-system/01-shop-management-system.md)
- **Specs**: [.scratch/2026-07-08-shop-management-system/specs/](.scratch/2026-07-08-shop-management-system/specs/)
- **ADRs**: [docs/adr/](docs/adr/)
- **CodeMap**: [docs/codemap/project.md](docs/codemap/project.md)
