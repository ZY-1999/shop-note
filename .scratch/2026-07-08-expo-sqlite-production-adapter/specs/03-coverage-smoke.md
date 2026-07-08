# Full-coverage device smoke — behavioral parity across every repo path

Type: spec
Status: ready-for-human # designed + adversarial review PASS (coverage + feasibility); awaits Gate A
Parent: #01
Blocked by: #02 (tracer-bullet smoke — `behaviorScript`, `runExpoSqliteSmoke`, normalization, Home entry — all land there)

## Goal

Extend the device smoke from the tracer-bullet subset to full behavioral coverage across every repository public path — thickening the proof that `ExpoSqliteAdapter` and `InMemoryAdapter` are behaviorally identical (the PRD's central claim).

## Acceptance criteria

The behaviors to test, critical paths first.

- [ ] `behaviorScript` covers staff + product CRUD (create / getById / search / list / void / restore) — proves basic entity parity.
- [ ] `behaviorScript` covers stock-record create (line snapshot of `title` + `unit_price`), update (touched lines resampled, untouched lines keep their snapshot, UPSERT never drops stored lines), and void (items never erased) — proves the hardest write paths match.
- [ ] `behaviorScript` covers the audit timeline including the create-scenario `diff` with `FieldDiff.old === undefined`, plus edit/void diffs — proves field-level audit parity incl. the JSON round-trip hazard.
- [ ] `behaviorScript` covers derived balance / cost / aggregate (read-only projection) — proves the deepest read module matches.
- [ ] `behaviorScript` covers `where voided_at:null` filtering and a transaction rollback — proves query semantics + atomicity parity.
- [ ] Every step is deep-equal between Expo and InMemory; `runExpoSqliteSmoke()` returns `{pass:true, details}` on device — proves full behavioral alignment.

## Scope

- **In**: extend `behaviorScript` to the full scenario list; any normalization refinements the new cases surface.
- **Out**: new repository behavior (the script only exercises existing public API); changes to the adapter, wiring, or Home entry (landed in #02); UI; composition root.

## Context

- The tracer-bullet smoke from spec #02 (`behaviorScript` minimal subset, `runExpoSqliteSmoke()`, undefined≈absent normalization, Home entry) — this spec extends `behaviorScript` only.
- The repository public APIs being exercised: [src/data/staff.ts](../../../../src/data/staff.ts), [src/data/product.ts](../../../../src/data/product.ts), [src/data/stock-record.ts](../../../../src/data/stock-record.ts), [src/data/audit.ts](../../../../src/data/audit.ts) (`queryTimeline`), [src/data/inventory.ts](../../../../src/data/inventory.ts) (`balance` / `staffInventory` / `shopAggregate`).
- The stock-record snapshot / stable-id UPSERT semantics and the "create is not audited, only edit/void are" rule — the behavior the smoke must reproduce (parent feature specs #05/#06).

## Design

**Interface delta** — no new public surface. This spec only **extends** #02's `behaviorScript` to the full step list (appending steps that exercise every repository public path). The runner (`runExpoSqliteSmoke`), `stable()`, and the Home entry are reused unchanged from #02.

**Internal architecture** — append steps to the smoke's step list; each step's `run` returns a real result that #02's `stable()` normalizes (already in place). The added coverage:

- staff + product CRUD — create / getById / list / listActive / search / void / restore;
- stock-record — create (line snapshot of `title` + `unit_price`), update (touched lines resampled, untouched lines keep their snapshot, UPSERT never drops stored lines), void (items retained, never erased);
- audit timeline — incl. the create-scenario `diff` with `FieldDiff.old === undefined` (re-asserted in fuller context) plus edit/void diffs;
- derived read model — balance / cost / aggregate;
- `where voided_at: null` filtering (re-asserted) and a transaction rollback (seeded in #02's tracer, re-run here across fuller state).

No adapter, wiring, or normalization changes. If a new step surfaces a stabilization gap, widen #02's `stable()` rather than special-casing the step.

## Rework on failure

Failure is isolated to the step list; redo this spec only. The adapter (#02) and the smoke harness are not in scope.
