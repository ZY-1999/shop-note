# Product repository — CRUD + soft-delete + restore + search, audit-wired

Type: spec
Status: ready-for-human # implemented via /tdd 2026-07-08 — awaits Stage 3 review
Parent: #01
Blocked by: #2

## Goal

Deliver the Product entity repository — create/read/update, soft-delete and restore, and title/code/category search at ~1000-item scale — where every mutation emits a correct field-level audit entry, and whose `purchase_price` is the input the derived-inventory cost calculation later reads.

## Acceptance criteria

- [ ] Create a product with `purchase_price` as integer cents (e.g. `1995` for ¥19.95) → `getById` returns cents exactly; the type layer rejects a floating-point price — proves the money invariant (stories 7, 33).
- [ ] Search by title substring matches across ~1000 seeded products (e.g. "可" hits both "可乐" and "可口可乐"); search by exact `code` and exact `category` each filter correctly — proves multi-axis search at scale (story 12).
- [ ] Void a product → excluded from search/list defaults; restore → reappears — proves soft-delete + restore (stories 10, 11).
- [ ] Update `purchase_price` (e.g. 1995→2495) → re-read confirms the new price; the audit timeline has an `action='update'` entry with the price old→new diff — proves field-level audit and that the new price is readable for later cost revaluation (stories 8, 9, 28).
- [ ] create / update / void / restore each produce exactly one audit entry with the correct action — proves full CRUD audit coverage.
- [ ] A voided product is still reachable by id and its `purchase_price` still readable (for historical snapshots/derivation) — proves no-hard-delete + FK integrity for #05/#07.

## Scope

- **In**: Product entity shape (id, title, purchase_price int cents, code?, category?, voided_at, created_at, updated_at); `productRepo` create/getById/list/search/update/void/restore; audit wiring.
- **Out**: cost revaluation logic (that's #07 — this spec only ensures the new price is readable); snapshotting price into stock records (that's #05); UI.

## Context

- PRD schema: `product`: id, title, purchase_price(int 分), code(nullable), category(nullable), voided_at(nullable), created_at, updated_at.
- PRD: "修改进货价后，所有当前库存自动按新成本重新估值" (story 9) — the revaluation itself is #07; this spec delivers the price update that triggers it.
- Consumes the audit provider from #02; built on the storage port from #01.
- Sibling to #03 (staff); either may be built first. Downstream consumers: #05 (FK + snapshot source), #07 (current price for cost).

## Design

- **Interface delta** — `productRepo` public surface after this spec:
  ```ts
  type Product = { id: string; title: string; purchase_price: Cents;  // Cents from #01, int
                   code: string | null; category: string | null;
                   voided_at: number | null; created_at: number; updated_at: number };
  productRepo.create(input: { title; purchase_price: Cents; code?; category? }): Product;
  productRepo.getById(id): Product | null;                            // returns even if voided (FK integrity for #05/#07)
  productRepo.list(opts?: { includeVoided?: boolean }): Product[];
  productRepo.search(q: { text?: string; code?: string; category?: string }): Product[]; // title substring (case-insensitive) + exact code/category, voided excluded
  productRepo.update(id, patch: { title?; purchase_price?; code?; category? }): Product;
  productRepo.void(id): Product;
  productRepo.restore(id): Product;
  ```
- **Internal architecture** — mirrors `staffRepo`'s shape (read → change → persist → `audit.logEvent` inside `withTransaction`), over `StoragePort` (#01) + audit (#02). `purchase_price` is typed `Cents` (#01), so floating-point prices are rejected at the type/runtime boundary, not per-call. `search` is a `find` over the products table with substring/exact predicates applied — at ~1000 rows an in-memory scan is well within the fluency budget; the expo-sqlite adapter can later add a `LIKE`/index without touching this repo (performance flag, not a correctness concern). `update` of `purchase_price` simply persists the new value — the revaluation that follows is #07's responsibility (this spec guarantees the new price is readable).
  - **Deep-module note**: thin master-data module, like staff. The `search` predicate is the only non-trivial surface and stays here.

## Rework on failure

Failure is isolated to the product module. A wrong search/price decision changes only `productRepo`; the audit provider, port, and downstream consumers (which read `productRepo.getById`) are unaffected.
