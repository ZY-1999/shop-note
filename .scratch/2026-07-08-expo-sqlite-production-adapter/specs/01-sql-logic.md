# Pure SQL logic — schema registry, SQL builders, row serialization

Type: spec
Status: ready-for-human # designed + adversarial review PASS (coverage + feasibility); awaits Gate A
Parent: #01
Blocked by: None — can start immediately

## Goal

Extract the adapter's SQL generation and row (de)serialization into pure, Jest-testable functions backed by a single-source-of-truth per-table schema registry — the device-independent foundation the real `ExpoSqliteAdapter` (spec #02) consumes.

## Acceptance criteria

The behaviors to test, critical paths first.

- [ ] Per-table schema registry is the single source of truth: it covers all 5 tables (`staff`/`product`/`stock_record`/`stock_record_item`/`audit_log`) with the correct column sets, and flags `audit_log.diff` as the only JSON column — proves DDL and runtime SQL share one source (no drift).
- [ ] `buildInsert(table, row)` produces `INSERT INTO <table> (cols) VALUES (?,?,…)` with column order matching the registry and placeholder count == column count; JSON columns are stringified in the bind params — proves insert SQL is correct and deterministic.
- [ ] `buildUpdate(table, patch)` produces `UPDATE <table> SET col=?, … WHERE id=?` over the patch's keys, validated against the registry — proves update SQL targets only real columns and never silently invents one.
- [ ] `buildFind(table, query)` translates `where` (null/undefined → `IS NULL`, non-null → `= ?`, multi-field AND), `orderBy` (`ASC`/`DESC`, no `NULLS FIRST/LAST`), and `limit` → `LIMIT ?` — proves find SQL mirrors `InMemoryAdapter.find` semantics.
- [ ] JSON columns survive a serialize→parse round-trip, including the create-scenario hazard where `FieldDiff.old === undefined` (normalized so deep-equal holds after `JSON.stringify` drops the key) — proves `audit_log.diff` is lossless on device.
- [ ] Row deserialize maps a stored row back to the repository's TS shape (JSON columns parsed, all others passed through) — proves reads reconstruct exactly what the repo wrote.
- [ ] `npm test` is green for the new pure-logic suite and `npm run typecheck` is clean — proves the foundation is solid with zero device dependency.

## Scope

- **In**: the per-table schema registry module; `buildInsert`/`buildUpdate`/`buildFind` pure functions; row serialize/deserialize helpers (with undefined-normalization for JSON columns); the Jest suite.
- **Out**: `expo-sqlite` (no dependency, no import); executing any SQL; the `ExpoSqliteAdapter` class; the migration runner; the device smoke; touching `port.ts`/repositories/`InMemoryAdapter`; deleting the stub test (that lands in spec #02).

## Context

- [ADR-0003](../../../../docs/adr/0003-expo-sqlite-adapter-shape.md) (per-table registry + JSON column, no joins/sub-tables); [ADR-0001](../../../../docs/adr/0001-storage-port-shape.md) (port shape — the row shapes this logic must handle).
- The port contract: [src/data/port.ts](../../../../src/data/port.ts) — `StoragePort`, `Query<T>` (`where?: Partial<T>`, `orderBy`, `limit`), `HasId`.
- The reference semantics to mirror: [src/data/in-memory.ts](../../../../src/data/in-memory.ts) `find` — `matches` (null/undefined both count as absent) and `compare` (null sorted first, ascending). `buildFind` must reproduce these.
- The nested-array hazard: [src/data/audit.ts](../../../../src/data/audit.ts) — `FieldDiff { field, old, new }`, `computeDiff` emits `old: undefined` on create; `AuditProvider.logEvent` does `insert("audit_log", entry)`, producing rows with a nested `diff`.
- The 5 table shapes (columns + nullability) are fixed by the parent PRD's schema decision; the registry mirrors them verbatim.
- Prior art: existing `src/data/*.test.ts` (Jest + ts-jest, `@jest/globals`, `@/` alias).

## Design

**Interface delta** — the public surface after this spec (a new pure module; **no `expo-sqlite` dependency or import**):

```ts
type TableName = "staff" | "product" | "stock_record" | "stock_record_item" | "audit_log";
interface TableSchema { columns: readonly string[]; jsonColumns: readonly string[]; }
const SCHEMA: Record<TableName, TableSchema>; // single source of truth (5 tables)

// Structural query shape the builders consume (column-name strings, not keyof T).
// The adapter bridges StoragePort's Query<T> → BuildQuery at the call site.
interface BuildQuery {
  where?: Record<string, unknown>;
  orderBy?: { field: string; dir?: "asc" | "desc" };
  limit?: number;
}

function buildInsert(table: TableName, row: Record<string, unknown>): { sql: string; params: unknown[] };
function buildUpdate(table: TableName, id: string, patch: Record<string, unknown>): { sql: string; params: unknown[] };
function buildFind(table: TableName, query?: BuildQuery): { sql: string; params: unknown[] };

function serializeRow(table: TableName, row: Record<string, unknown>): Record<string, unknown>;
function deserializeRow(table: TableName, row: Record<string, unknown>): Record<string, unknown>;
```

- `buildInsert` uses the registry's column order (deterministic) and asserts row keys ⊆ columns — the typo guard ADR-0003 relies on to keep DDL and SQL aligned. JSON columns are stringified in `params`.
- `buildUpdate` SETs the patch's keys (registry-validated), `WHERE id = ?` last.
- `buildFind` — no query → `SELECT * FROM <table>`; `where` → per field `IS NULL` (value null/undefined) or `= ?` (AND-joined); `orderBy` → `ORDER BY field ASC|DESC` with **no `NULLS` clause** (SQLite's default null-ordering mirrors `InMemoryAdapter.compare` — null = smallest); `limit` → `LIMIT ?`.
- `serializeRow` / `deserializeRow` — JSON columns stringify on write / parse on read. `serializeRow` normalizes `undefined`→`null` **inside JSON-column content**, so the round-trip is stable after `JSON.stringify` drops undefined-valued keys (the `audit_log.diff` create-scenario hazard where `FieldDiff.old === undefined`).

**Deep-module note** — these are intentionally shallow pure helpers; the depth lives in the adapter (#02) and the repositories (existing). No DEEPENING applies — this extraction is what *keeps* the adapter thin (no SQL strings leak into it).

**Internal architecture** — one module `src/data/sql-logic.ts`. `SCHEMA` mirrors the 5 table shapes fixed by the parent PRD; the DDL landed in #02 derives its column lists from this same `SCHEMA` (no second source of truth). No state, no I/O — Jest-testable exactly like the existing `src/data/*.test.ts` suites (`@jest/globals`, `@/` alias).

## Rework on failure

Failure is isolated; redo this spec only. The functions are consumed solely by #02; a wrong SQL shape is a one-function fix with its unit test.
