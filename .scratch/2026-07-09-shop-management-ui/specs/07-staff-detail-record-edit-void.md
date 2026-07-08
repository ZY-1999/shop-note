# 记账 tab — staff detail + record detail / edit / void

Type: spec
Status: ready-for-human # designed 2026-07-09 — awaits adversarial review, then Gate A
Parent: #01
Blocked by: #6

## Goal

The look-back / correct flow on top of the post flow (#6): a staff detail screen (current holdings + movement history), a record detail screen showing the frozen line snapshots, and edit / void actions that correct or undo a posted record — edit resnapshots only the touched lines (keeping untouched snapshots frozen), void excludes the record from balances while preserving everything for audit. Every change propagates to balances and is captured in the audit log.

## Acceptance criteria

- [ ] Staff detail shows the staff's full holdings (per-product qty/amount via `staffInventory`) and a newest-first movement history (`staffHistory`); tapping a history item opens that record's detail — proves the look-back entry points (stories 7, 14, 26).
- [ ] Record detail renders the **frozen snapshot** per line (`title` / `unit_price` / `qty` / `line_amount`) and the header (direction / timestamp / note), regardless of later product edits — proves snapshot fidelity in the UI (stories 14, 20).
- [ ] Editing only some lines, then saving → the **touched** lines resnapshot at the product's current price/title; **untouched** lines keep their original snapshot; the staff balance updates; a field-level diff lands in the audit timeline — proves the resnapshot-merge contract end-to-end in the UI (stories 15, 16, 23).
- [ ] Voiding a record → it disappears from the staff's balance on the next read (balance recomputed), but the record + its items remain viewable and the void is in the audit log — proves void = soft-delete with audit (stories 17, 24, 29).
- [ ] An edit/void is reflected in 记账 summaries (#5) and 汇总 (#8) without manual refresh — proves invalidation across views (stories 25, 27).

## Scope

- **In**: staff detail screen; record detail screen; edit mode (reuses #6's form pattern, preloaded with the record's lines); `useUpdateStockRecord` + `useVoidStockRecord` mutations (serialized via #3's gate; invalidate records/inventory/staffSummaries/dailyFlow); confirm-before-void; `MoneyText` reuse (#5).
- **Out**: the `StockRecordRepository.update` resnapshot-merge logic (already shipped — this spec only calls it); the audit-log *viewing* screen (out of scope, first batch — diffs are recorded but not displayed); posting a new record (#6); staff/product CRUD (#9).

## Context

- `StockRecordRepository.update(recordId, { items?: [{ id?, product_id, qty }], ... })` ([src/data/stock-record.ts](../../../../src/data/stock-record.ts)) — item merge: a line is "touched" iff new (no matching id) or `product_id`/`qty` differs; touched lines **resnapshot**; untouched matched lines keep their original snapshot; unmentioned stored lines are **kept** (upsert semantics). `void(recordId)` sets `voided_at` (items never erased). Both audit (action update/void) atomically.
- `getById(recordId)` returns even voided records + items (for detail view after void). `staffInventory(staffId)` + `staffHistory(staffId)` feed the staff detail. `AuditProvider.queryTimeline` records the diffs (not displayed this batch).
- Hooks/gate from #3; `MoneyText` from #5; the form pattern from #6 (edit reuses it, preloaded).

## Design

- **Interface delta**:
  ```ts
  useUpdateStockRecord(): UseMutationResult  // gate.run(() => stockRecords.update(recordId, patch)); onSuccess invalidate
  useVoidStockRecord(): UseMutationResult    // gate.run(() => stockRecords.void(recordId));    onSuccess invalidate
  // both invalidate by prefix: qk.records + qk.inventory (covers staffSummaries too) + qk.dailyFlow
  <StaffDetail staffId />   // holdings (staffInventory) + history (staffHistory) → record detail
  <RecordDetail recordId /> // frozen snapshot + [编辑] → edit mode / [作废] → confirm → void
  ```
- **Internal architecture**:
  - **Staff detail** — `useStaffInventory(staffId)` (per-product qty/amount, 欠货 shown) + `useStockRecords({ staff_id })` (history, newest-first). Each history row → push record detail. Holdings use `MoneyText`; 欠货 rows flagged (#5).
  - **Record detail** — `useStockRecords`/`getById` for the record + its **frozen** items; render each line's snapshot `title`/`unit_price`/`qty`/`line_amount` and the header. The snapshot is the source of truth here — not a re-derivation from the current product (so a later product edit/void doesn't distort history).
  - **Edit mode** — preload #6's form with the record's existing lines (each carrying its stable `id` so the merge can tell touched from untouched). The operator changes some lines; on submit, `useUpdateStockRecord` sends only the intended line set. The repo's merge does the resnapshot/keep logic; the UI's contract is "send the lines as edited, with ids". After save, invalidation refreshes balances + the detail re-reads the new snapshots.
  - **Void** — a confirm step, then `useVoidStockRecord`; the record stays viewable (`getById` returns voided) but drops out of balances/history derivation. Audit captures the void diff (viewable in a future audit screen, not this batch).
  - **Deep-module note**: the UI intentionally carries the **stable line ids** through edit so the repo's "touched vs untouched" merge is driven correctly — this is the one subtle contract the edit form must honor (it is what preserves untouched snapshots). Hide that behind the form; the operator just edits lines.

## Rework on failure

Edit/void are isolated to their screens + two mutations; the repo's merge/void logic is already shipped and unchanged. If an edit drops a line it shouldn't, the bug is in how the form submits line ids (UI), not the merge — fix in the edit form. Void never erases data, so a wrong void is recoverable by restore (if added later) or by re-reading.
