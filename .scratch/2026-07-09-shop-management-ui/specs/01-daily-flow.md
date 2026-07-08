# Daily flow — per (day, staff) in/out amount derived read model

Type: spec
Status: ready-for-human # implemented via /tdd 2026-07-09 — awaits Stage 3 review
Parent: #01
Blocked by: None — can start immediately

## Goal

A pure-TypeScript derived read model (sibling of `Inventory`) that aggregates each unvoided stock record's frozen snapshot `line_amount` into per-(day, staff) in/out money totals, newest day first — the data behind the 汇总 tab's "每日流水" view. Derived, never stored; Jest-coverable like `inventory.test.ts`.

## Acceptance criteria

- [ ] Two unvoided `in` records for staff S on the same day, line_amounts 1000 + 500 → one `DailyFlowRow{ date, staff_id:S, in_amount:1500, out_amount:0 }` — proves the core (day × staff × direction) aggregation (story 19).
- [ ] An `in` (1000) and an `out` (300) for S the same day → `{in_amount:1000, out_amount:300}` on one row (not two) — proves direction split per bucket (story 19).
- [ ] Records on different days → distinct rows, ordered **newest day first** — proves descending date ordering (story 19).
- [ ] Void a record → its `line_amount` no longer appears in the day's totals on the next read, no explicit recompute — proves void exclusion + derived-no-drift (stories 19, 24, ADR-0002).
- [ ] Edit a record's line (resnapshot → new `line_amount`) via #06 → the day's total reflects the new amount next read — proves an edit propagates to the derived flow (story 23 edit case).
- [ ] Amounts are the **historical snapshot `line_amount`**, NOT current-price-revalued: change the product's `purchase_price` → the past day's flow amount is unchanged (contrast with `Inventory` cost revaluation) — proves the流水 "that day's money" semantics (PRD 实施决策 §每日流水).
- [ ] Optional `staff_id` / `date_range` filter narrows the rows — proves the filter surface the 汇总 view uses.

## Scope

- **In**: `src/data/daily-flow.ts` — `DailyFlow` class + `DailyFlowRow` type; `flow(filter?)` over `StockRecordRepository.list()` (voided already excluded); pure TS, no persistence, no `expo-sqlite` import. A Jest suite alongside `inventory.test.ts`.
- **Out**: UI rendering (汇总 tab is #08); storing/caching the flow (forbidden — ADR-0002); cost revaluation (that is `Inventory`'s rule, deliberately NOT applied here); writing/editing records (#06).

## Context

- PRD 实施决策 §数据层增量 — `dailyFlow`: "按 (天, 员工) 聚合未作废记录的 snapshot `line_amount`，按 `direction` 拆 in / out，日期倒序"; "金额口径 = 历史快照 `line_amount`（录入时冻结的单价 × 数量），不按当前进货价重估".
- Sibling of `Inventory` ([src/data/inventory.ts](../../../../src/data/inventory.ts)) — same derivation discipline (never stored, recomputed each call, negative allowed). Read its doc-comment for the pattern.
- Consumes `StockRecordRepository.list()` ([src/data/stock-record.ts](../../../../src/data/stock-record.ts)) → `RecordWithItems[]` (each `item.line_amount` is the frozen snapshot Cents; `record.direction` / `record.timestamp` / `record.staff_id` on the header; voided excluded by default).
- ADR-0002 (derived never stored); ADR-0001 (single seam — Jest against `InMemoryAdapter`).
- Added to the `Repos` set in #02.

## Design

- **Interface delta** — a read-only projection (no write side, nothing persisted):
  ```ts
  export interface DailyFlowRow {
    date: string;        // 'YYYY-MM-DD' — the calendar day of record.timestamp
    staff_id: string;
    in_amount: number;   // Cents — Σ line_amount over the day's unvoided 'in' records for this staff
    out_amount: number;  // Cents — Σ line_amount over the day's unvoided 'out' records for this staff
  }
  export interface DailyFlowFilter {
    staff_id?: string;
    date_range?: { from?: number; to?: number };  // epoch ms, compared against record.timestamp
  }
  export class DailyFlow {
    constructor(stockRecords: StockRecordRepository) {}
    async flow(filter?: DailyFlowFilter): Promise<DailyFlowRow[]>  // newest day first
  }
  ```
- **Internal architecture** — pure functions over `stockRecords.list()`. Iterate `RecordWithItems`; for each, bucket a `Σ item.line_amount` into `(day(record.timestamp), record.staff_id, record.direction)`. Apply `staff_id` / `date_range` filter before bucketing. Emit one row per `(date, staff_id)` with `in_amount`/`out_amount` filled; sort by `date` descending. **Nothing is stored** — every call recomputes (ADR-0002: no drift). Because the source `list()` already excludes voided records, void exclusion is automatic; an edit (#06) changes the underlying `line_amount`, so the next read reflects it with no invalidation step of this module's own (the UI's React Query invalidation is #03's concern).
  - **Day-bucket decision**: `date` derives from `record.timestamp` (epoch ms) → the **local calendar day** ('YYYY-MM-DD') of the operator, not UTC. Rationale: a single-operator local app thinks in local days ("today's 流水"); bucketing by UTC would split a working day at 08:00 CST. Implement via a deterministic `dayBucket(ms): string` helper (e.g. `new Date(ms)` → locale-independent `YYYY-MM-DD` of the device's local timezone). Tests pin timestamps to known local-day values so the bucket is deterministic. Flag: if multi-timezone ever matters (out of scope — no sync), revisit.
  - **Amount semantics**: deliberately `line_amount` (frozen snapshot), NOT `product.purchase_price × qty`. This is the one place dailyFlow diverges from `Inventory`'s cost-revaluation rule — the流水 answers "what money moved that day", not "what is it worth now". Test asserts a price change leaves past flow rows unchanged.
  - **Deep-module note**: `flow()` hides a ledger scan + day/staff/direction bucketing behind a tiny surface — a read projection peer of `Inventory`. Keep it pure TS (not pushed into SQL) so the in-memory Jest suite proves exactly what production runs (same trade-off as `Inventory`).

## Rework on failure

Failure is isolated — `DailyFlow` writes nothing, so a wrong aggregation cannot corrupt the ledger. If a different day-bucket rule is ever needed (TZ), it is a one-function change behind `dayBucket`.

## Comments

- 2026-07-09 — implemented via /tdd (sdd-flow Stage 2, spec #01). Acceptance criteria → proving test (all in `src/data/daily-flow.test.ts`):
  - AC1 two `in` same day → one summed row → `two 'in' records, same staff + same day → one row summing their line_amounts`
  - AC2 `in`+`out` same day → both on ONE row → `an 'in' (1000) and an 'out' (300), same staff + same day → both on ONE row`
  - AC3 different days → distinct rows, newest first → `records on different days → distinct rows, newest day first`
  - AC4 void drops its line_amount next read → `voiding a record drops its line_amount from the day's totals on next read`
  - AC5 edit line resnapshot propagates → `editing a record's line resnapshots → day total reflects the new amount`
  - AC6 price change leaves past flow unchanged → `changing a product's current price leaves past flow rows unchanged`
  - AC7 staff_id / date_range filter → `staff_id filter narrows rows to that staff` + `date_range filter narrows rows to the window`
  - derived-never-stored (ADR-0002, AC4 no-drift half) → `every read recomputes; DailyFlow exposes no write surface`
  Test: `npx jest src/data/daily-flow.test.ts` → 9 passed / 9 total. Typecheck: `npx tsc --noEmit` → exit 0.
  Commit: `feat(daily-flow): derived per-(day,staff) in/out flow read model` (this spec's implementation commit).
