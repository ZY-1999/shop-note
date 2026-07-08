# Stock record — edit (resnapshot) + void, audit-wired

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-08
Parent: #01
Blocked by: #5

## Goal

Edit a posted stock record (item changes resnapshot to the current product title/price) and void records, with both mutations emitting field-level audit entries — and never hard-deleting. This is the highest-risk slice: edit-resnapshot fidelity and the balance-impacting void.

## Acceptance criteria

- [ ] Edit a record's item (change qty, or add a new line) → added/changed lines resnapshot to the product's **current** title + unit_price at edit time; item lines not touched by the edit keep their original snapshot — proves resnapshot fidelity vs. original-post snapshot (story 23).
- [ ] Edit the header (note, timestamp, staff_id) → re-read confirms changes; `updated_at` advances — proves header edit (story 23).
- [ ] Void a record → `voided_at` is set; `getById` still returns it (with items intact); there is no hard-delete API — proves void semantics + no-hard-delete invariant (story 24).
- [ ] Edit produces exactly one audit entry `action='update'` with a field-level diff of what changed; void produces exactly one `action='void'` entry — proves edit/void audit coverage (story 29).
- [ ] After voiding a record, a downstream balance read (#07) excludes it — proves void propagates to derivation (connectivity; story 25) — verified once #07 lands, or via a direct ledger-read here.
- [ ] Editing/voiding never silently corrupts the snapshots of untouched items — negative test on resnapshot scope.

## Scope

- **In**: `stockRecordRepo` edit(header+items, resnapshot touched lines)/void(set voided_at); audit wiring for edit + void only; the no-hard-delete guarantee.
- **Out**: posting/read/filter (#05); deriving balances (#07); audit provider internals (#02); UI.

## Context

- Extends the stock_record surface designed in #05 (same header+item shape, same repository).
- PRD: "记录可编辑、可作废(voided_at)；绝不硬删；变更进 audit_log"; coverage "出入库 edit/void".
- Consumes the audit provider (#02) on edit and void — NOT on create (create is #05 and explicitly excluded).
- The resnapshot decision (which lines re-freeze) is the riskiest behavior in the project — defend it with negative tests.

## Design

**DESIGN-IT-TWICE — item-collection edit semantics** (the riskiest behavior in the project). Two radically different shapes compared:

- **(a) Replace-all** — `update` replaces the entire item list; every line resnapshots to the current product price.
- **(b) Item-level merge by stable id** — `update` takes the full intended item list; lines matched by their stable `id` (from #05); added (new id) or product/qty-changed lines resnapshot to the **current** product price; lines unchanged by the edit keep their **original posting-time** snapshot; stored ids absent from the submission are dropped.

| Axis | (a) Replace-all | (b) Merge by stable id |
|---|---|---|
| Fidelity | **Breaks it** — untouched historical lines silently get re-priced on any edit | **Preserves it** — only lines the operator actually changed re-freeze |
| Depth | Shallow (delete-all + re-insert) | Hides non-trivial diff/merge+resnapshot behind one call — deep |
| Seam | Trivially testable, but tests the wrong behavior | Testable via the public `update`: assert untouched items' snapshots are unchanged, touched items' reflect current price |

**Decision: (b) item-level merge by stable id.** It is the only shape that satisfies the snapshot-fidelity acceptance (PRD story 20: historical snapshots must not drift after later edits). A line is "touched" iff it is newly added, or its `product_id` or `qty` differs from the stored line; touch → resnapshot `title`/`unit_price`/`line_amount` from the product's current state. Untouched lines are copied verbatim (original snapshot intact).

- **Interface delta** — extends `stockRecordRepo` (#05):
  ```ts
  stockRecordRepo.update(id, patch: { staff_id?; direction?; timestamp?; note?; items?: Array<{ id?: string; product_id; qty }> }): { record; items };
  stockRecordRepo.void(id): { record; items };   // sets voided_at; never removes data
  ```
  No `delete` method exists (PRD: never hard-delete).
- **Internal architecture** — both methods run read→change→persist→`audit.logEvent` inside one `withTransaction` (atomicity across header/items/audit). `update`'s merge: load stored header+items; apply header patch; for `items`, partition the submission by whether each entry's `id` matches a stored item — matched+unchanged → keep stored snapshot; matched+changed or unmatched → resnapshot from `productRepo.getById(product_id)`; stored ids not in the submission → dropped. The audit diff for `update` covers header fields and the item-set change (fields/added/removed lines as the diff payload). `void` sets `voided_at = now` and is reflected by #07's derivation excluding the record (verified there).
  - **Deep-module note**: `update`'s merge+resnapshot is genuinely deep — a small surface hiding the project's trickiest state reconciliation. Defend it with negative tests (untouched-line snapshot unchanged; voided record excluded downstream).

## Rework on failure

The merge rule is the one risky decision. If "touched ⇒ resnapshot" is too aggressive (e.g. a qty-only edit should not re-price), narrow the touch condition here — the merge function is localized to `stockRecordRepo.update` and does not touch #05's posting path or #07's derivation.
