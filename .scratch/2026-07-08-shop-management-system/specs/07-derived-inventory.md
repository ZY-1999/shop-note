# Derived inventory & cost valuation — balance, revaluation, aggregate, negative

Type: spec
Status: ready-for-human # implemented via /tdd 2026-07-08 — awaits Stage 3 review
Parent: #01
Blocked by: #4, #6

## Goal

Derive per-(staff, product) balance and cost amount purely from the unvoided movement ledger — never stored, always recomputed, instantly revalued when a product's price changes — plus a shop-level aggregate, with negative inventory (欠货) allowed. The correctness-critical read model.

## Acceptance criteria

- [ ] Staff S: post `in` qty 10, post `out` qty 3 for product P → `balance(S, P) == 7` — proves the core derivation (stories 14, 15).
- [ ] Void the `out` record → `balance(S, P)` immediately reads `10` again with no explicit recompute call — proves derivation reflects voids in real time (stories 24, 25).
- [ ] Edit the `out` record's qty (3→5) via #06 → `balance(S, P)` next reads `5` (was `7`) — proves an **edit** (not just a void) propagates to derivation with no drift (story 25, edit case — PRD lists "编辑更新余额" as a distinct test-proof).
- [ ] Edit product P's `purchase_price` (1995→2495) → `costAmount(S, P)` immediately reflects `2495 × balance` with no record change — proves instant cost revaluation against current price (stories 9, 16).
- [ ] Staff S has only one `out` qty 5 record (no `in`) → `balance(S, P) == -5` and `costAmount == -5 × purchase_price`, returned without error — proves negative inventory is allowed (story 18).
- [ ] Two staff hold P with balances 7 and -3 → `shopAggregate(P).total_qty == 4` and `total_cost` is the cross-staff sum — proves shop-level aggregation (story 17).
- [ ] No-drift: a fresh recomputation directly from the ledger equals every derived balance/aggregate; there is no stored/cached balance to diverge — proves the never-stored invariant (story 15).
- [ ] Voided records and voided products are handled correctly (voided records excluded from the sum; product still resolves for historical balances) — negative/edge coverage.

## Scope

- **In**: `inventory.balance(staffId, productId)`; `inventory.staffInventory(staffId)` → `[{product, qty, cost_amount}]`; `inventory.shopAggregate()` → `[{product, total_qty, total_cost}]`; cost = current `product.purchase_price` × balance qty; read-only, never persists a balance.
- **Out**: writing stock records (#05/#06); product price updates (#04); storing/caching balances (forbidden by the no-drift rule); UI formatting (元/CNY display is a UI concern).

## Context

- PRD derivation rule: "balance(staff,product) = SUM(qty, direction='in' 且未作废) − SUM(qty, direction='out' 且未作废)"; "amount = product.purchase_price(当前) × balance qty；实时计算；改价即重估"; "店铺汇总 = 跨员工 SUM".
- Reads stock records (posted in #05, voided in #06) and current product price (#04).
- PRD: "派生余额（不存储）"; "允许负库存"; performance note "约 1000 商品与记录增长下，应用仍保持流畅" — correctness first; flag performance as a follow-up if the read path is too slow.
- This is a pure read projection — no write side of its own.

## Design

- **Interface delta** — a read-only projection over the ledger (no write side, nothing persisted):
  ```ts
  type Balance = { product: Product; qty: number; cost_amount: number };  // cost_amount in Cents; qty may be negative
  inventory.balance(staffId, productId): { qty: number; cost_amount: number };
  inventory.staffInventory(staffId): Balance[];        // one entry per product the staff has ever moved
  inventory.shopAggregate(): Array<{ product: Product; total_qty: number; total_cost: number }>;  // cross-staff sum
  ```
- **Internal architecture** — pure functions over `stockRecordRepo.list()` (#05 — voided records excluded by default) and `productRepo.getById` (#04). `balance(staffId, productId)` = Σ `item.qty` over the staff's unvoided `in` records − Σ over their unvoided `out` records for that product; `cost_amount` = `productRepo.getById(productId).purchase_price` (current) × `qty`. `staffInventory` groups the staff's unvoided items by `product_id`; `shopAggregate` groups across all staff. **Nothing is stored** — every call recomputes from the ledger, which is what guarantees no drift (there is no cached figure to diverge). Negative `qty`/`cost_amount` are returned as-is (no clamp, no error — PRD: 欠货). Revaluation is implicit: because cost reads the product's current price on every call, a price change (#04) is reflected the next read with no invalidation step.
  - **Deep-module note**: `inventory.balance` hides a ledger scan + current-price join behind a tiny surface — the system's deepest read module. Keep the derivation in TypeScript (not pushed into the port/SQL) so the in-memory Jest suite proves exactly what production runs; this is the trade-off that buys no-drift + single-seam testing.
- **Performance flag (not a correctness concern)**: each call is O(unvoided items). At ~1000 products and modest record growth this is fine for a single-operator app; if measured slow, optimize the read path (narrower `list` filter, or an on-demand memo invalidating on #05/#06/#04 writes — never a stored authoritative balance, which the no-drift rule forbids). Defer until measured.

## Rework on failure

Failure is isolated to the read projection — it writes nothing, so a wrong derivation cannot corrupt the ledger. If performance forces a cached read-model, add it here behind the same interface; the no-drift rule only forbids a *stored authoritative* balance, not a derived cache with correct invalidation.
