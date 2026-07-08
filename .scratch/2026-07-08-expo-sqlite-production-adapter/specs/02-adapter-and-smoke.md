# ExpoSqliteAdapter — real SQL execution + tracer-bullet device smoke

Type: spec
Status: ready-for-human # implemented via /tdd 2026-07-08 — [DEVICE-PENDING] device smoke not yet run; Jest-testable parts GREEN (see comment)
Parent: #01
Blocked by: #01 (consumes the pure SQL-logic foundation — registry, builders, serialize/deserialize)

## Goal

Replace the `ExpoSqliteAdapter` stub with a real `expo-sqlite`-backed adapter (schema, migration, all 5 port methods, hand-written transactions) AND land a minimal end-to-end device smoke that proves it behaviorally matches `InMemoryAdapter` — the tracer bullet: real SQL × real SQLite × real consistency check, thin coverage.

## Acceptance criteria

The behaviors to test, critical paths first.

- [ ] `expo-sqlite` is installed (SDK 57 compatible); the adapter opens a DB, sets `PRAGMA journal_mode = WAL`, and runs the migration on open — proves the device store initializes correctly on first launch.
- [ ] Migration is idempotent via `PRAGMA user_version` + `CREATE … IF NOT EXISTS`: re-opening a populated DB re-runs harmlessly, leaves data intact, and keeps `user_version` current — proves first-launch and repeat-launch both work.
- [ ] All 5 `StoragePort` methods execute real SQL and return correct TS row shapes (serialize on write, deserialize on read), satisfying the port contract verbatim — proves the adapter is a real port implementation.
- [ ] `audit_log.diff` (nested `FieldDiff[]`, JSON column) round-trips through real SQLite — proves the hardest serialization case works on device.
- [ ] `withTransaction` commits on resolve (and returns `T`), rolls back + rethrows on throw — proves mutate+audit atomicity parity with `InMemoryAdapter`.
- [ ] Port contract comment added: `withTransaction` is non-reentrant (no nesting) — proves the constraint is documented at the contract.
- [ ] Minimal device smoke returns `{pass:true}` — one-table CRUD loop + one audit round-trip (covering create `FieldDiff.old === undefined`) + one transaction rollback, each step deep-equal between Expo and InMemory repo sets (undefined≈absent normalization) — proves the adapter is behaviorally aligned end-to-end.
- [ ] Home `__DEV__` entry (button + result) triggers `runExpoSqliteSmoke()`; the smoke is self-contained (opens/closes its own DB, constructs its own repos) and introduces no `SQLiteProvider`/composition root — proves the dev regression entry exists without scope creep.
- [ ] Existing stub test ([src/data/expo-sqlite.test.ts](../../../../src/data/expo-sqlite.test.ts)) is deleted; `npm run typecheck` is clean; existing `npm test` stays green — proves the stub era is over and nothing else broke.

## Scope

- **In**: install `expo-sqlite`; DDL (5 tables + `idx_item_record_id`) derived from the registry; migration module (`user_version`, idempotent `IF NOT EXISTS`); `ExpoSqliteAdapter` 5 methods + hand-written `BEGIN`/`COMMIT`/`ROLLBACK`; `port.ts` comment (no nested tx); delete the stub test; `behaviorScript` (minimal subset) + `runExpoSqliteSmoke()` + Home `__DEV__` entry + deep-equal normalization.
- **Out**: full smoke coverage (stock-record edit/void, derived aggregates, etc. — spec #03); composition root (`SQLiteProvider`/`useSQLiteContext`); any repository / `InMemoryAdapter` change; extra indexes; Node-side contract tests; UI consuming the data layer.

## Context

- The pure-logic foundation from spec #01 (registry, `buildInsert`/`buildUpdate`/`buildFind`, serialize/deserialize) — this spec consumes it.
- [ADR-0003](../../../../docs/adr/0003-expo-sqlite-adapter-shape.md) — hand-written transactions (no `withTransactionAsync`), no nesting, no `PRAGMA foreign_keys`, no `FOREIGN KEY` clauses, value-domain `CHECK` retained; [ADR-0001](../../../../docs/adr/0001-storage-port-shape.md) — port contract.
- [src/data/expo-sqlite.ts](../../../../src/data/expo-sqlite.ts) — the stub being replaced; [src/data/expo-sqlite.test.ts](../../../../src/data/expo-sqlite.test.ts) — the stub test being deleted.
- Composition pattern to mirror in `runExpoSqliteSmoke`: [src/data/inventory.test.ts](../../../../src/data/inventory.test.ts) `setup()` → `{ storage, audit, products, staff, stockRecords, inventory }`.
- [src/app/index.tsx](../../../../src/app/index.tsx) — Home, where the `__DEV__` entry goes (currently imports no data-layer code).
- Expo SDK 57 `expo-sqlite` API: https://docs.expo.dev/versions/v57.0.0/ — open DB, exec/run/get-all, transaction primitives, `PRAGMA`. SDK 57 has **no** `migrate()` helper, so the migration is hand-written `PRAGMA user_version`.

## Design

**DESIGN-IT-TWICE — the device-smoke structure.** The one structural decision here with real trade-offs (adapter shape, transactions, no-FK are all pinned by ADR-0003 + the #01 foundation). A smoke that must ship a thin tracer bullet now and grow to full coverage in #03:

| Axis | (A) One script + coverage flag | (B) Ordered step list; runner takes a slice |
|---|---|---|
| Growth to full coverage | Branch inside one function; tracer/full kept as parallel paths; #03 edits the same function's full-branch | #03 **appends** steps; #02's runner is untouched — additive only |
| Drift localization | Whole-script pass/fail | **Per-step** pass/fail — names the diverging operation |
| Step coupling | Steps fused in one body | Steps share state cumulatively (each repo set is mutated in order) — explicit, like any behavior script |

**Decision: (B) ordered step list.** Per-step deep-equal is the smoke's entire purpose (which operation diverged?), and #03 becomes pure step-appendage — the tracer bullet thickens, it isn't rewritten. Steps share state within each repo set by design.

**Interface delta** — public surface after this spec:

```ts
// src/data/expo-sqlite.ts — rewritten from the stub
class ExpoSqliteAdapter implements StoragePort {
  static async open(name: string): Promise<ExpoSqliteAdapter>; // open → WAL → migrate; ready to use
  async close(): Promise<void>;                                  // lifecycle (not on StoragePort)
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  insert / findById / update / find                               // StoragePort verbatim
}

// src/data/expo-sqlite-migration.ts — new
const MIGRATIONS: ReadonlyArray<{ version: number; statements: readonly string[] }>;
function runMigrations(db: SQLiteDatabase): Promise<void>; // PRAGMA user_version runner

// src/data/smoke/* — new, dev-only self-contained composition
type SmokeStep = { name: string; run: (repos: Repos) => Promise<unknown> };
const behaviorScript: SmokeStep[];                                 // the shared script; seeded with tracer steps (CRUD loop + audit round-trip + tx rollback), grown to full coverage in #03
function stable<T>(value: T): T;                                   // normalize volatile fields for cross-adapter compare
async function runExpoSqliteSmoke(steps: SmokeStep[] = behaviorScript): Promise<{ pass: boolean; details: string }>;
```

- The adapter owns its full lifecycle behind `ExpoSqliteAdapter.open()` (deep-module instinct: one factory yields a ready adapter — exactly what the smoke and any future composition root want). Migration is a collaborator, not inlined into the class body.
- `runExpoSqliteSmoke()` runs each step on an Expo repo set and an InMemory repo set, deep-equaling `stable(step.run(expo))` vs `stable(step.run(mem))` per step; returns `{pass, details}` with one ok/mismatch line per step.
- `behaviorScript` is the PRD's same-named shared script, refined into an ordered `SmokeStep[]` (vs the PRD's single function) so each step's Expo-vs-InMemory snapshot compares independently — drift localizes to the diverging operation (see DESIGN-IT-TWICE). #03 appends steps to it; the runner is untouched.

**Internal architecture**:

- `ExpoSqliteAdapter` is a **thin executor** over #01's builders: each method binds `{sql, params}` from `buildInsert`/`buildUpdate`/`buildFind` and runs it via the `SQLiteDatabase`'s exec/run/get-first/get-all async methods (per the v57 API); reads `deserializeRow`, writes `serializeRow`. **No SQL strings live in the adapter** — dumb adapter (ADR-0001/0003).
- `withTransaction`: `BEGIN` → `const result = await fn()` → `COMMIT`; catch → `ROLLBACK` + rethrow; return `result`. The `SQLiteDatabase` is a single connection, so `fn`'s queries share the transaction. **Not reentrant** — `BEGIN` can't nest (no `SAVEPOINT`); add this to the `port.ts` `withTransaction` doc comment. (`InMemoryAdapter`'s nesting becomes a beyond-contract detail — left unchanged.)
- Migration: `runMigrations` reads `PRAGMA user_version`, runs every version's `statements` (`CREATE TABLE/INDEX ... IF NOT EXISTS`) where `version > current`, then `PRAGMA user_version = N`. `journal_mode = WAL` set once on open. DDL column lists derive from #01's `SCHEMA`; nullability + value-domain `CHECK` per the parent PRD; **no `FOREIGN KEY`** clauses (`PRAGMA foreign_keys` stays off — ADR-0003).
- Smoke harness (`src/data/smoke/`): `setupRepos(storage)` mirrors `inventory.test.ts`'s `setup()` → `{storage, audit, products, staff, stockRecords, inventory}`. `stable()` normalizes a **closed** volatile set — `id` and any `*_id` → `"<id>"`; `created_at`/`updated_at`/`voided_at`/`timestamp` → `"<time>"` (or `null`); and `undefined`→`null` — so two repo sets with different `id()`/`now()` outputs compare equal. This same normalization absorbs the `audit_log.diff` JSON round-trip drift (`old: undefined` on InMemory vs `old: null`/absent on Expo). The Home `__DEV__` entry calls `runExpoSqliteSmoke()` on press and renders `{pass, details}`; self-contained (opens/closes its own DB, builds its own repos), introduces no `SQLiteProvider`/composition root.
- Expo SDK 57 `expo-sqlite` API (open/exec/run/get, PRAGMA, no `migrate()` helper) is authoritative: https://docs.expo.dev/versions/v57.0.0/ — exact method names confirmed against v57 during `/tdd`.

## Rework on failure

The adapter is the load-bearing spec. If real-SQL execution reveals a port/builder mismatch, the revert point is this spec + #01's builders (its only consumers); repositories, `InMemoryAdapter`, and the port interface stay untouched. If the smoke can't stabilize some field, widen `stable()` — isolated to the smoke harness.

> **Comment** — implemented 2026-07-08; Status → ready-for-human (device smoke PENDING user run)
>
> **Verification split** — the PRD's testing decision puts real-SQL execution on the device, not in Jest. Jest proves the pure-logic foundation + the smoke's *InMemory* half; the device smoke proves real-SQL execution + cross-adapter parity. The device smoke is ONE user action (Home `__DEV__` → "run expo-sqlite smoke") that exercises every device-pending criterion at once. **Do not start spec #03 until it returns `{pass:true}`** — #03 appends steps to this same script and would build on an unverified adapter.
>
> **Jest-proven (GREEN):**
> - [x] migration DDL: types/NOT NULL/PK, value-domain CHECK (direction/action), no FK/UNIQUE, `COLUMNS`↔`SCHEMA` drift guard, `idx_item_record_id` non-unique — `src/data/expo-sqlite-migration.test.ts` (5 tests)
> - [x] `stable()` normalizer: `id`/`*_id`→`<id>`, `*_at`/`timestamp`→`<time>`/null, undefined→null, deep clone — `src/data/smoke/stable.test.ts` (5 tests)
> - [x] behaviorScript InMemory half: every tracer step returns a defined result; the rollback step leaves the earlier write intact (atomicity); the create diff is captured with `old === undefined` (the JSON round-trip hazard) — `src/data/smoke/behavior-script.test.ts` (3 tests)
> - [x] port contract: `withTransaction` non-reentrant note added — `src/data/port.ts`
> - [x] stub test deleted; `npm run typecheck` exit 0; `npm test` → 89 passed, 0 failed
>
> **Device-pending (PRD verification regime — one user-run smoke covers all):**
> - [ ] `expo-sqlite` installed (SDK 57); adapter opens → WAL → migrates on open — `package.json`/`app.json` (expo-sqlite 57.0.0 + config plugin); runtime path `ExpoSqliteAdapter.open`
> - [ ] all 5 port methods execute real SQL with correct TS row shapes — `ExpoSqliteAdapter` insert/findById/update/find
> - [ ] `audit_log.diff` round-trips through real SQLite — exercised by the smoke's "audit: timeline" step
> - [ ] `withTransaction` commits on resolve (returns T) / rolls back + rethrows on throw — exercised by the smoke's "tx: rollback" step
> - [ ] minimal device smoke returns `{pass:true}`; Home `__DEV__` entry renders — `runExpoSqliteSmoke()`; `src/app/index.tsx`
>
> **To verify:** on a device or simulator, press Home → "run expo-sqlite smoke". Expected: `PASS` with one `✓` line per step. Any `✗ MISMATCH`/`THREW` names the diverging operation — fix in this spec + #01's builders (revert point above), not in the repos/port.
>
> - Commit: `dd79c5c`
