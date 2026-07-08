# 汇总 tab — shop overview + daily flow + by-staff / by-product distribution

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-09 — adversarial review PASS (cfd1fa6), human approved the 9-spec breakdown; entering Stage 2 (/tdd)
Parent: #01
Blocked by: #3, #4

## Goal

The supervision / reconciliation tab: four switched views over the derived read models — a shop overview (cross-staff totals per product + grand total), the daily money flow (per day × staff in/out, newest first), inventory by staff (who holds what), and inventory by product (where each product went). All read-only, all derived, all refresh automatically when the ledger changes.

## Acceptance criteria

- [ ] A view switcher (segmented) toggles the four views; each renders from a derived read — proves the 汇总 information architecture (stories 18–21).
- [ ] **Overview** renders per-product total qty + amount (one `shopAggregate()`) + a grand total — proves the shop-level aggregate (story 18).
- [ ] **Daily flow** renders rows of (day × staff) with in/out amounts, **newest day first**, amounts being the **historical snapshot** `line_amount` (unchanged by a later price edit) — proves the dailyFlow read (#1) in the UI (story 19).
- [ ] **By staff** lists each staff's variety/total-qty/total-amount (from `staffSummaries()`, #5); tapping a staff opens their holdings detail — proves the staff-axis distribution (story 20).
- [ ] **By product** lists each product's total qty/amount (`shopAggregate()`); tapping a product shows its per-staff breakdown (on-demand) — proves the product-axis distribution (story 21).
- [ ] An edit/void/post elsewhere (#6/#7/#9) is reflected in the open 汇总 view without manual refresh — proves cross-view invalidation (stories 25, 27).

## Scope

- **In**: the 汇总 screen + four view components + the segmented switcher; consumption of `useShopAggregate()`, `useStaffSummaries()` (#5), `useDailyFlow()` (#1), and a conditional `useBalance(staffId, productId)` for the by-product drill-down; `MoneyText` reuse (#5).
- **Out**: the dailyFlow read model (#1) and `staffSummaries()` (#5) — consumed, not rebuilt; posting/editing/voiding records (#6/#7); staff/product CRUD (#9); a new all-cells matrix read (deliberately not added — drill-downs are on-demand per tap, so no N-calls-per-render); the audit-log viewing screen (out of scope).

## Context

- Derived reads (never stored — ADR-0002): `Inventory.shopAggregate()` (per-product cross-staff totals), `Inventory.balance(staffId, productId)`, `Inventory.staffInventory(staffId)`; `staffSummaries()` from #5; `DailyFlow.flow()` from #1.
- dailyFlow amounts = historical snapshot `line_amount` (NOT current-price-revalued) — the one place 汇总 diverges from the otherwise-current-price cost view; a price edit (#9) must NOT change past flow rows (contrast with overview/by-staff amounts, which DO revalue).
- Hooks/gate from #3; `MoneyText` from #5; nav from #4.

## Design

- **Interface delta** — a screen that composes four read-only views:
  ```tsx
  <SummaryTab />   // segmented: overview | dailyFlow | byStaff | byProduct
  // views consume useShopAggregate(), useDailyFlow(), useStaffSummaries() (standalone hooks from #3)
  ```
  No new public read API — this spec composes existing reads. (If a future flat matrix is wanted, add it behind these views; not needed now.)
- **Internal architecture**:
  - **Segmented switcher** — local state picks the active view; each view is its own component fetching its read. Only the visible view needs its data live (React Query lazily fetches per the hook used in each view).
  - **Overview** — `useShopAggregate()` → per-product rows (qty/amount via `MoneyText`) + grand total (sum). Current-price cost view (revalues on price change).
  - **Daily flow** — `useDailyFlow()` → rows grouped day-desc; each row shows the day, staff, and in/out amounts. Amounts are snapshot `line_amount` — assert (test) that editing a product price does not mutate past rows.
  - **By staff** — `useStaffSummaries()` → one row per staff (variety/qty/amount, 欠货 flagged); tap → staff detail (#7) for the per-product breakdown.
  - **By product** — `useShopAggregate()` → one row per product (total qty/amount); tap → conditional `useBalance(staffId, productId)` (enabled when that product is tapped) for the per-staff breakdown — a proper conditional hook (rules-of-react compliant, React Compiler on), not a per-render callable.
  - **Cross-view refresh** — every write path (#6/#7/#9) invalidates `qk.inventory` / `qk.dailyFlow` (by prefix — `qk.inventory` already covers `staffSummaries`), so an open 汇总 view re-fetches automatically; no view-local refetch logic.
  - **Deep-module note**: 汇总 is a thin composition of derived reads — its value is the information architecture (four reconciling views from one ledger), not new logic. Keep it read-only and derivation-delegating; do not sneak aggregation into the UI (ADR-0002).

## Rework on failure

Purely read-only — no writes, so a wrong view cannot corrupt data. A stale view = a missing key in some mutation's invalidation set (#6/#7/#9), fixed there. The dailyFlow snapshot-vs-revalue distinction is the one correctness subtlety; it lives in #1's read, asserted there.
