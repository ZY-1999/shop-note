# 记账 tab — record posting form (multi-line items, live amounts, validation)

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-09 — all ACs GREEN in jest/RNTL, tsc clean; device-visual (native picker, real router back) pending
Parent: #01
Blocked by: #5

## Goal

The core write flow: from a staff row's 入库/出库 button, a form prefilled with that staff + direction where the operator adds multiple item lines (pick a product, enter qty), sees each line's amount and the running total live, optionally sets the time / adds a note, and submits — after which the staff's holding summary updates immediately. This is where a movement enters the ledger.

## Acceptance criteria

- [ ] Opening the form from a 入库/出库 button prefills staff (read-only or shown) and direction; the operator adds item lines — each line = product (searched by text/code/category via `useProducts`) + qty — and can add/remove lines — proves multi-item entry (stories 9, 29).
- [ ] Each line shows `purchase_price × qty` live and the form shows the running total, updating as qty/product changes — proves instant amount feedback (story 10), via `MoneyText` (#5).
- [ ] Submit is **blocked** with a visible message when staff is missing, there are zero items, or any item lacks a product or has a non-positive/non-integer qty — proves validation prevents dirty data (story 13).
- [ ] A valid submit creates the record (snapshot of title + unit_price frozen at posting) and the staff row's summary reflects the new balance on return, with no manual refresh — proves the post→invalidate→refresh flow end-to-end (stories 12, 20, 25).
- [ ] The operator can set/backdate the record time and add a note (reason/单号); defaults: time = now, note = empty — proves backdatable timestamp + note (stories 11, 22).
- [ ] An `out` qty exceeding current holdings is **not** blocked — the form lets the operator post it (negative/欠货 allowed) — proves the no-negative-block invariant (story 18; PRD).

## Scope

- **In**: the record form screen; `useCreateStockRecord` mutation (serialized via #3's gate; `onSuccess` invalidates `qk.records` / `qk.inventory` / `qk.dailyFlow` (by prefix; `qk.inventory` already covers `staffSummaries`)); product search via `useProducts`; controlled form state (item-line add/remove/edit, live amount calc, pre-submit validation); optional timestamp + note; `MoneyText` reuse (#5); `@expo/ui` inputs where they help.
- **Out**: editing/voiding an existing record (#7); staff list / summary (#5); product CRUD (#9); the `StockRecordRepository.create` internals (already shipped — this spec only calls it); changing validation rules to block negative stock (forbidden — PRD).

## Context

- `StockRecordRepository.create({ staff_id, direction, timestamp?, note?, items: [{ product_id, qty }] })` ([src/data/stock-record.ts](../../../../src/data/stock-record.ts)) validates each product FK, snapshots `title` + `unit_price`, computes `line_amount`, persists atomically; throws `RangeError` on non-integer qty. Not audited on create (PRD).
- Live amounts use the product's **current** `purchase_price` (read via `useProducts`); the snapshot freezes whatever the price is at submit. `MoneyText` + theme from #5. Provider/hooks/serialization gate from #3; nav from #4.
- PRD: forms are self-built controlled (`useState` + instant amount calc + pre-submit validation), no `react-hook-form`; native inputs (TextField/Picker) use the already-installed `@expo/ui`.
- React Compiler on — the form follows rules-of-react (no side-effectful state derivation; derive amounts in render).

## Design

- **Interface delta**:
  ```ts
  useCreateStockRecord(): UseMutationResult   // mutationFn = (input) => gate.run(() => repos.stockRecords.create(input))
  // input = { staff_id, direction, timestamp?, note?, items: [{ product_id, qty }] }
  // onSuccess → invalidate by prefix: qk.records + qk.inventory (covers shopAggregate /
  //   staff / staffSummaries / balance) + qk.dailyFlow
  <RecordForm staffId direction />             // route params prefilled from #5's buttons
  ```
- **Internal architecture**:
  - **Form state** — controlled: an array of draft lines `[{ product_id?, qty }]` + header fields (staff shown/prefilled, direction prefilled, timestamp default now, note). Amounts are **derived in render** from the lines + the queried products (no stored amount state) — keeps them always-correct and React-Compiler-friendly.
  - **Validation** — pure predicate over the draft: staff present; ≥1 line; every line has a product and an integer qty > 0. On invalid submit, set a shown error (first failing rule); on valid, call `useCreateStockRecord`. The integer->0 rule mirrors the repo's `RangeError` guard so the user is told before the throw.
  - **Product picker** — search via `useProducts({ search })` (text/code/category), flat-listed for selection; reuses the repo's existing search (1000-product case; FlatList, swap to FlashList only if measured slow — ADR-0005).
  - **Submit → refresh** — `useCreateStockRecord` runs through #3's serialization gate; on success its invalidation refreshes inventory/staffSummaries/records/dailyFlow, so the back-to-记账 row (#5) and 汇总 (#8) read the new balance automatically. On success the form navigates back to the staff list.
  - **Negative not blocked** — no pre-submit balance check; an `out` over holdings submits and produces 欠货 downstream (PRD invariant). The form's job is structural validity, not stock sufficiency.
  - **Deep-module note**: the form is the UI's only write path into the movement ledger; it hides "snapshot + atomic post + invalidation" behind "fill lines, submit, see updated balance". Keep amount derivation in render (single source of truth), state minimal.

## Rework on failure

Isolated to the form screen + `useCreateStockRecord`. The repo's create is already shipped and unchanged; a validation or amount bug lives in the form and cannot corrupt the ledger (the repo re-validates). If the invalidation set is incomplete (a view goes stale), widen the invalidated keys in the mutation — one place.

---

## Stage 2 evidence (implemented 2026-07-09)

`npx jest` → 145 passed / 22 suites (both projects); `npx tsc --noEmit` → exit 0.

- **AC1 (prefill + add line)** → `src/components/record-form.test.tsx` "shows the prefilled staff + direction, and picking a product adds a line" (RNTL + real InMemoryAdapter; direction label + staff name prefill, pick adds a line showing the product title). GREEN.
- **AC2 (live amount + running total)** → "updates the line amount and total as the operator types a qty" (300¢×4 → line + total both `¥12.00`; edit qty→10 re-derives total to `¥30.00`; amounts derived in render, never stored). `MoneyText` renders `¥` + figure as two children, so the running-total assertion joins `props.children` before matching. GREEN.
- **AC3 (validation blocks)** → `src/components/record-form-validation.test.ts` (9 unit tests over the pure predicate: staff-missing / no-items / missing-product / non-positive / non-integer / valid); screen-level "blocks submit with no items" + "blocks submit when a line has a non-integer qty" surface the message in `form-error`. Integer->0 rule mirrors the repo's `RangeError`. GREEN.
- **AC4 (valid submit → record + nav back)** → "posts the record (snapshot at current price) and navigates back" (mock-router asserts `router.back()` on success; the posted item carries the snapshot `title=可乐`, `unit_price=cents(300)`, `qty=4`; serialized via `useCreateStockRecord` → gate → `stockRecords.create`). GREEN.
- **AC5 (note + backdatable time)** → "defaults note to empty and time to now; carries the note on submit" (`note=单号A1`, `timestamp` within 5s of now) + "lets the operator backdate the time" (the `@expo/ui` DateTimePicker stub's backdate tap → `timestamp=mockBackdateMs` 2020-01-01). GREEN.
- **AC6 (out over holdings not blocked)** → "posts an out exceeding current holdings (negative / 欠货 allowed)" (no prior `in` → balance 0 → out of 5 still submits; no pre-submit balance check, per PRD). GREEN.

**Route**: `src/app/bookkeeping/record-form.tsx` — a thin adapter reading `useLocalSearchParams<{staff_id; direction}>()` (pushed by #05's 入库/出库 buttons) and passing them as props to the router-agnostic `<RecordForm>` (default import of `DateTimePicker` from `@expo/ui/community/datetime-picker`, per the SDK-57 docs).

**RNTL v14 + React 19 + React Query v5 test mechanics** (the hard part — recording so #7–#9 reuse it): RNTL's `findBy*`/`waitFor` wrap every poll in `act`, which here (a) overlaps the next `fireEvent`'s act so React drops the state update (submit then reads a stale line — qty/note/timestamp empty) and (b) leaks polling timers that, compounded over the 8 tests, corrupt the renderer into empty trees. The suite instead uses a local `waitForSync` (polls on `setTimeout` WITHOUT act — query notifications flush on their own between yields, cosmetic "not wrapped in act" warning only), a `flushPending()` yield after each state-changing `fireEvent` that the next read depends on, and `afterEach` `queryClient.clear()` for isolation. Stable green across repeated runs.

**Device-pending**: jest/RNTL prove behavior through the real data stack (ADR-0006); the native `DateTimePicker` picker UI, real expo-router Stack back, and product-search FlatList perf (1000-product case) remain device-confirmed-pending (same posture as #04/#05).

Commit: see `feat(bookkeeping): record posting form — multi-line + live amounts + validation (#06)` (this spec's Stage 2 commit).
