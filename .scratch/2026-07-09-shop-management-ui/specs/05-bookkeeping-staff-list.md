# 记账 tab — staff entry list + search + per-staff holding summary (theme tokens + MoneyText)

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-09 — adversarial review PASS (cfd1fa6), human approved the 9-spec breakdown; entering Stage 2 (/tdd)
Parent: #01
Blocked by: #3, #4

## Goal

The bookkeeping home (记账, the default tab): a searchable list of staff, each row showing that staff's current holding summary (variety count / total qty / total amount, with 欠货 flagged), with 入库/出库 buttons that jump straight into a prefilled record form and a tap-through to staff detail. This is the operator's primary landing — "search a staff, post a movement" — and it introduces the shared theme tokens + `MoneyText` every later screen reuses.

## Acceptance criteria

- [ ] The list shows active staff; typing in the search box narrows it by name or phone (driven by `useStaff({ search })`) — proves staff search at the entry point (stories 4, 26).
- [ ] Each row shows the staff's **summary** — variety count, total qty, total amount — computed by **one** `Inventory.staffSummaries()` ledger pass for all staff, not N `staffInventory()` calls — proves the efficient per-staff rollup the PRD mandates (stories 5, 14, 15; ADR-0005).
- [ ] A staff whose balance includes a negative product shows a **欠货** badge and danger styling on the row — proves negative-inventory surfacing at a glance (story 8).
- [ ] `MoneyText` renders `Cents(12345)` → `¥123.45`; a negative amount → `欠货 ¥X.XX` in the danger color; positive in the success/positive token — proves the one money-formatting component (stories 33, 34).
- [ ] Tapping a row's **入库** / **出库** button navigates to the record form prefilled with that staff + direction (mock-router asserts the push carries staff_id + direction); tapping the row body navigates to staff detail (#7) (stories 6, 7).
- [ ] The extended theme tokens (success / danger / warning / border / inputBg / accent) exist in light + dark and are applied (入库=success-ish, 出库/欠货=danger) — proves the semantic-token substrate (stories 33, 34; ADR-0005).

## Scope

- **In**: a small data-layer increment — `Inventory.staffSummaries()` (one ledger pass → per-staff variety/total-qty/total-amount/has-negative) + its hook; the `Colors` extension (six semantic tokens, light + dark); `MoneyText` (Cents→元, 欠货, ±color); `StaffRow`; the 记账 screen (search bar + `FlatList` of `StaffRow`, staff↔summary join); navigation hooks to the form (#6) and staff detail (#7).
- **Out**: the record form itself (#6); staff detail / record detail / edit / void (#7); 汇总 (#8) and 管理 (#9) screens; storing balances (forbidden — ADR-0002); changing repo internals beyond adding `staffSummaries()`.

## Context

- ADR-0005: 记账 is the default tab, staff-centric; `MoneyText` formats Cents→元 with 欠货/±color; theme = RN `StyleSheet` + extended `Colors` semantic tokens (success/danger/warning/border/inputBg/accent), no NativeWind. Per-staff summary must come from **one** `shopAggregate()`-style pass grouped by staff, not N per-staff calls.
- **Design gap surfaced (handled here)**: `Inventory.shopAggregate()` ([src/data/inventory.ts](../../../../src/data/inventory.ts)) returns per-**product** cross-staff totals; `Inventory.staffInventory(staffId)` is per-staff but one-call-per-staff. Neither yields a one-pass per-**staff** rollup. So this spec adds `Inventory.staffSummaries()` — the one-ledger-pass, grouped-by-staff read the PRD/ADR call for (also reused by 汇总's by-staff view, #8).
- Read hooks + `useRepos()` come from #3; nav shell from #4. `StaffRepository.search({ text })` and `Inventory` are the consumed APIs. `Cents` lives in [src/data/primitives.ts](../../../../src/data/primitives.ts).
- Current [theme.ts](../../../../src/constants/theme.ts) has 5 tokens (text/background/backgroundElement/backgroundSelected/textSecondary) — this spec adds 6 more.

## Design

- **Interface delta**:
  ```ts
  // data-layer increment (new method on Inventory, already in Repos — no Repos change)
  inventory.staffSummaries(): Promise<StaffSummary[]>
  interface StaffSummary {
    staff_id: string;
    variety: number;        // distinct products moved (balance != 0)
    total_qty: number;      // Σ balance qty across products (may be negative)
    total_amount: number;   // Cents — Σ (current purchase_price × balance qty) across products
    has_negative: boolean;  // any product balance < 0 → 欠货 flag
  }
  // hook (query key REGISTERED HERE in the factory #3 owns: qk.inventory.staffSummaries() —
  // staffSummaries is an Inventory method, so it lives under the inventory namespace)
  useStaffSummaries(): UseQueryResult<StaffSummary[]>
  // component
  <MoneyText cents={Cents} variant?>  // ¥X.XX | 欠货 ¥X.XX (danger) ; positive→success token
  <StaffRow staff={Staff} summary?: StaffSummary} onIn={..} onOut={..} onOpen={..}/>
  ```
- **Internal architecture**:
  - **`staffSummaries()`** — single pass over `stockRecords.list()` (voided excluded): accumulate per `staff_id` a map `product_id → net qty` (in − out), then per staff compute variety (non-zero count), total_qty, total_amount (join current `purchase_price` via `products.getById`, same as `shopAggregate`), and `has_negative`. One ledger scan for all staff — the PRD's "不对每员工单独算 N 次". Pure, never stored (ADR-0002); negative returned as-is (欠货). Jest-covered like `inventory.test.ts`. (汇总's by-staff view in #8 reuses this read.)
  - **Screen data-flow** — `useStaff({ search })` (active staff, filtered) + `useStaffSummaries()` (all-staff rollup); the screen joins them by `staff_id` and renders one `StaffRow` per active staff. Search narrows the staff list; the summaries query is shared (one invalidate refreshes all rows). 欠货 rows get the danger token + badge.
  - **`MoneyText`** — the single money-formatting primitive: `Cents` → `¥` + two decimals; `cents < 0` → prefix 欠货 + danger color; `> 0` → positive/success token; `0` → neutral. Every later screen (#6–#9) reuses it, so format/color rules live here once.
  - **Navigation wiring** — 入库/出库 buttons call the router push to the form route (#6) with `{ staff_id, direction }` params; row tap pushes staff detail (#7). The push is mock-router-tested here; the targets are built in #6/#7.
  - **Deep-module note**: `staffSummaries()` is a read projection peer of `shopAggregate()` — same scan, different grouping axis (staff vs product). Keep it pure TS; the one-pass shape is the value (N staff without N scans).

## Rework on failure

`staffSummaries()` is an additive read (writes nothing) — a wrong rollup cannot corrupt the ledger; revert to N `staffInventory()` calls behind the same hook if the one-pass form proves wrong. `MoneyText` + theme tokens are leaf utilities — isolated, no downstream rework.
