# Storage foundation — port, in-memory adapter, Jest harness, primitives

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-08
Parent: #01
Blocked by: None — can start immediately

## Goal

Establish the single test seam — a React-free storage port, an in-memory adapter, a working Jest harness, and the shared money/id/time primitives — so every later module TDDs green from its first call without reinventing infrastructure.

## Acceptance criteria

The behaviors to test, critical paths first.

- [ ] A round-trip through the repository public API using the in-memory adapter (create → getById → update → list → void → getById) returns the expected states — proves the port contract holds and the seam is wired end-to-end.
- [ ] Money is represented as integer cents and quantities as integers; the type layer rejects floating-point money (e.g. `19.95` rejected, `1995` accepted) — proves the money invariant is centralized, not per-module.
- [ ] Identifiers are generated on demand and are unique across calls; record `timestamp` is user-settable (defaults to now, backdatable) while audit/system timestamps take real `now` — proves the two timestamp classes are distinct.
- [ ] The expo-sqlite adapter exists as a compiling stub that implements the same port interface but throws "not implemented in unit test" at runtime — proves contract symmetry without touching real SQL.
- [ ] `npm test` runs Jest against the in-memory adapter only (no device, no expo-sqlite) and is green; TypeScript strict mode reports no errors.

## Scope

- **In**: the `StoragePort` contract; `InMemoryAdapter`; Jest config + tsconfig path aliases; money (cents)/id/timestamp helpers; soft-delete + timestamp field conventions shared by all entities; expo-sqlite adapter as a stub.
- **Out**: any business module (staff/product/records/inventory/audit); real expo-sqlite SQL execution, schema, and migrations (later non-TDD task); UI; the repository's entity-specific operations.

## Context

- Greenfield — no persistence, no test runner, no `expo-sqlite` dependency exists yet (see [docs/codemap/project.md](../../../docs/codemap/project.md) Domain And Data node: "none exist yet").
- PRD implementation decision: "一个无 React 依赖的纯 TS repository 模块，建在 storage port 之上；生产 adapter = expo-sqlite"; testing decision: "单一 seam：repository 公共 API；在 Jest 中用 in-memory storage port 测试（无设备）".
- PRD money/qty rule: "price 存整数分；qty 整数"; timestamp rule: "记录 timestamp 用户可设（默认 now，可补录）；审计/系统字段取真实 now".
- PRD schema (parent #01) lists the shared `voided_at`/`created_at`/`updated_at` convention across staff/product/stock_record.
- The port shape is the highest-leverage interface decision in the project — it must be implementable by both expo-sqlite (real) and in-memory (test), and must carry the derivation queries inventory will need.

## Design

**DESIGN-IT-TWICE — the port abstraction level.** Two radically different shapes were compared:

- **(A) SQL-mirror port** — the port mirrors `expo-sqlite` (`exec`/`prepare`/`executeAsync`/`withTransactionAsync`); the repository writes SQL strings; the in-memory adapter is a SQL interpreter.
- **(B) Typed table-store port** — the port is generic typed row CRUD (`insert`/`findById`/`find`/`update`/`withTransaction`); the repository expresses all logic in TypeScript over rows; both adapters are dumb row-stores (Maps / SQL).

| Axis | (A) SQL-mirror | (B) Typed table-store |
|---|---|---|
| Depth | Shallow port — SQL passthrough; queries scattered as strings | Port hides storage mechanism; **all business logic (derivation, audit diff, soft-delete, snapshots) concentrates in pure-TS repo modules** — deep interfaces like `inventory.balance(staff, product)` |
| Locality | Schema change → find/fix many SQL strings across repo | Each module's logic in one place; schema lives in the adapter |
| Seam | In-memory adapter = SQL interpreter (heavy, brittle) OR per-query mocks (tests the implementation, not behavior) — **contradicts the PRD** | In-memory adapter = `Map<table, Row[]>` (trivial); repo logic fully tested via its public API — **the literal embodiment of the PRD testing decision** |

**Decision: (B) typed table-store port.** It is the only shape that matches the PRD's testing decision ("单一 seam：repository 公共 API；在 Jest 中用 in-memory storage port 测试...不测 SQL 内部") and concentrates the hard-won logic where it's testable. All business logic lives in the pure-TS repository; **both adapters are dumb typed row-stores** — derivation/audit/snapshot/soft-delete logic is never split into SQL, so the in-memory Jest suite proves exactly what production runs.

- **Interface delta** — the public seam after this spec:
  ```ts
  // Dumb typed row-store. Both adapters implement this; the repo is its only consumer.
  interface StoragePort {
    withTransaction<T>(fn: () => Promise<T>): Promise<T>;   // atomic; rollback on throw
    insert<T>(table: string, row: T): Promise<T>;            // stores exactly what the repo gives (repo owns id/timestamps/voided_at)
    findById<T>(table: string, id: string): Promise<T | null>;
    find<T>(table: string, query: Query<T>): Promise<T[]>;   // where (field equality + null-checks) + orderBy + limit
    update<T>(table, id, patch: Partial<T>): Promise<T | null>;
  }
  type Query<T> = { where?: Partial<Nullable<T>>; orderBy?: { field: keyof T; dir: 'asc'|'desc' }; limit?: number };
  ```
  Plus exported primitives: `Cents` (branded int — `cents(n)` constructor throws on non-integer, blocks raw-`number` assignment at compile time); `id()` (unique string — ULID/UUID); `now()` (real clock, injectable per-repo so tests can stub time); shared `SoftDeletable`/`Timestamped` row shapes (`id`, `voided_at?`, `created_at`, `updated_at`). No `remove` on the surface — nothing in the system hard-deletes (PRD invariant).
  - **Deep-module note**: the port is intentionally shallow (dumb storage) — depth is *not* owed here, it lives in the repository modules (#03–#07). Resist any pull to push query/aggregation logic down into the port (that would re-introduce shape (A)'s seam problem under another name).
- **Internal architecture** — module boundary: `src/data/port.ts` (the contract) + `src/data/in-memory.ts` (`InMemoryAdapter` over `Map`) + `src/data/expo-sqlite.ts` (`ExpoSqliteAdapter` stub implementing the same interface, methods throw "not implemented in unit test") + `src/data/primitives.ts` (Cents/id/now/types). The repository entry point constructs with a chosen adapter; **the repo owns id generation, both timestamp classes, and voided semantics** — adapters never invent domain fields. Transactions wrap every multi-write (e.g. mutate-and-audit) so the two adapters share identical atomicity semantics. Jest config added with a tsconfig path alias (`@/`); tests import the repo wired to `InMemoryAdapter` only.

## Rework on failure

If the port shape proves wrong (e.g. derivation is unusably slow at scale, or a query the repo needs can't be expressed), the revert point is this spec only — #02–#07 consume the abstract `StoragePort`, so widening `Query` or adding a method is localized to #01 and the adapter; it does not cascade through entity specs.
