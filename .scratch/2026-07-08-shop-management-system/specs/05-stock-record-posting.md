# Stock record — posting (header + items, snapshot) + read + filter + staff history

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-08
Parent: #01
Blocked by: #3, #4

## Goal

Post a stock record (one staff, many item lines) that freezes each item's product title + unit_price at posting time, read it back with its snapshots, filter records by staff/direction/date, and view a staff's transaction history — the write+read foundation of the movement ledger. Editing/voiding is #06.

## Acceptance criteria

- [ ] Create an `in` record for a staff with two item lines (product A qty 10, product B qty 5) → each item's `title` and `unit_price` equal product A/B's fields at the moment of posting — proves snapshot capture at posting (story 20).
- [ ] After editing product A's title and `purchase_price`, re-read the record → its item still carries the original snapshot (title + unit_price unchanged); `product_id` is retained as the FK — proves snapshot fidelity + FK retention after master-data drift (story 20).
- [ ] `getById` returns the header (staff_id, direction, timestamp, note) plus the full item list with snapshots — proves the read shape.
- [ ] `record.timestamp` is user-settable (backdatable to an earlier time) and defaults to now when omitted — proves backdating (story 21).
- [ ] Filter records by staff_id, by direction (`in`/`out`), and by timestamp date range, each returning the correct subset — proves multi-axis filtering (story 27).
- [ ] A staff's transaction history returns their records in chronological order — proves per-staff history (story 26).
- [ ] Record **create** produces **no** audit entry — proves the coverage exclusion (only edit/void are audited, per PRD story 29) — negative test.

## Scope

- **In**: `stock_record` header (id, staff_id FK, direction, timestamp user-settable, note, voided_at, created/updated) + `stock_record_item` (id, record_id FK, product_id FK, title snapshot, unit_price snapshot, qty, line_amount); `stockRecordRepo` create(header+items)/getById/list/filter/staffHistory; the no-audit-on-create rule.
- **Out**: editing and voiding records (#06); deriving balances/costs (#07); staff/product CRUD (#03/#04); UI.

## Context

- PRD schema: `stock_record` + `stock_record_item` (see parent #01); "每条明细在录入时快照商品标题与单价"; "product_id 作 FK 保留，用于派生并在商品编辑/假删除后仍可关联".
- FK references to staff (#03) and product (#04); item snapshots are read from product at posting.
- Built on the storage port (#01); does NOT call the audit provider on create (only #06 does, on edit/void).
- This spec and #06 share the stock_record interface — #06 extends it with edit/void; design the item-collection shape here so #06's resnapshot is a natural extension.

## Design

- **Interface delta** — the posting/read half of `stockRecordRepo` (extended by #06 for edit/void):
  ```ts
  type Direction = 'in' | 'out';
  type StockRecord = { id: string; staff_id: string; direction: Direction;
                       timestamp: number; note: string | null;           // user-settable (defaults to now)
                       voided_at: number | null; created_at: number; updated_at: number };
  type StockItem = { id: string; record_id: string; product_id: string;
                     title: string; unit_price: Cents; qty: number;       // title + unit_price FROZEN at posting
                     line_amount: Cents };                                // = unit_price × qty (frozen historical value)
  stockRecordRepo.create(input: { staff_id; direction; timestamp?; note?; items: Array<{ product_id; qty }> }): { record: StockRecord; items: StockItem[] };
  stockRecordRepo.getById(id): { record: StockRecord; items: StockItem[] } | null;   // returns even if voided
  stockRecordRepo.list(filter?: { staff_id?; direction?; date_range? }): Array<{ record; items }>;  // voided excluded by default
  stockRecordRepo.staffHistory(staff_id): Array<{ record; items }>;      // chronological by record.timestamp
  ```
- **Internal architecture** — over `StoragePort` (#01). On `create`: fetch each referenced product via `productRepo.getById` (validates the FK exists), snapshot `title` + `purchase_price`→`unit_price` into each `StockItem`, compute `line_amount`, assign stable item `id`s, persist header + items in one `withTransaction`. **`create` deliberately does NOT call `audit.logEvent`** (PRD: record create is not audited — only edit/void are). `getById`/`list`/`staffHistory` are reads that return header+items together (the item collection is never read without its header). The item carries `product_id` as a retained FK so derivation (#07) and post-edit linkage survive later product edits/voids; the snapshots (`title`, `unit_price`, `line_amount`) are what guarantee fidelity. Item `id`s are stable across the record's life — this is the contract #06's edit-merge depends on.
  - **Deep-module note**: `create` hides FK-validation + multi-row atomic snapshot behind one call — a justified small deep module. Keep snapshot capture inside `create`; do not let callers supply pre-computed snapshots (they'd drift from the product's real state).

## Rework on failure

Failure is isolated to the posting/read path. If the item shape must change, coordinate with #06 (it shares `StockItem` and the item-`id` stability contract) — the shared surface is the only cross-spec coupling.
