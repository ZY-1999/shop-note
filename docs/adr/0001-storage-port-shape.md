# ADR-0001: StoragePort is a dumb typed row store, not a SQL/ORM mirror

- Status: **Accepted** (2026-07-08)
- Scope: shop-management-system data layer (spec #01)

## Context

The data layer needs to serve five modules (staff, product, stock-record, audit, derived inventory) on top of a device store (`expo-sqlite`), while staying unit-testable in pure Jest — with no device and no running database. The PRD's testing decision is explicit: **the in-memory adapter must prove exactly what production runs.**

Two shapes were on the table (spec #01 ran DESIGN-IT-TWICE):

1. A **rich port** mirroring SQL/ORM capabilities (joins, aggregations, migrations) — push domain logic toward the store.
2. A **dumb typed row store** — minimal CRUD over typed rows, all domain logic in pure-TypeScript repositories above it.

## Decision

`StoragePort` is a **dumb typed row store** — the shallowest port that still lets a repository persist and read typed rows:

- `withTransaction(fn)` — atomic; on throw every write made inside is rolled back and the error rethrows.
- `insert<T extends HasId>(table, row)` — store a row exactly as given (the repo already set id/timestamps).
- `findById<T>(table, id)` — read one (survives soft-delete).
- `update<T extends object>(table, id, patch)` — merge a partial patch.
- `find<T>(table, query?)` — rows by field-equality `where` + `orderBy` + `limit`.

**No `remove`** on the surface (PRD invariant: no hard deletes — rows are voided, never erased). No joins, no aggregations, no migrations in the port. All business logic — snapshotting, voiding, audit diffs, derived balances — lives in the repository modules above it.

## Consequences

- **+ Single test seam.** `InMemoryAdapter` is the only adapter tests need; the Jest suite proves the exact behaviour production runs, because the real `ExpoSqliteAdapter` implements the same shallow interface. No SQL to mock, no DB to spin up.
- **+ Deep domain modules.** Logic concentrates in repositories (snapshot merge, derived inventory) where it can be reasoned about and tested as pure TypeScript — the port stays shallow on purpose.
- **+ No hard-delete footgun.** Voiding is the only "removal" path; the port cannot accidentally erase audit or ledger history.
- **− The port does no heavy lifting.** Aggregations (e.g. `Inventory.balance`) scan in TypeScript — O(unvoided items) per read. Acceptable for a single-operator app (~1000 products); revisit only if measured slow (see [ADR-0002](0002-derived-inventory-never-stored.md)).
- **− Adapters must implement transactional semantics themselves.** `InMemoryAdapter` does it via pre-transaction snapshots; the real `expo-sqlite` adapter will use SQLite's `BEGIN`/`ROLLBACK`/`COMMIT`.

## Alternatives considered

- **Rich SQL-mirror port** (query builder / ORM-style). Rejected: it would push domain logic into a layer that's hard to unit-test without a real DB, breaking the PRD testing decision, and force the test seam to mock SQL rather than exercise real behaviour.
- **Two ports** (one read, one write). Rejected for now: the current surface is small enough that one port keeps the seam count at one; a read/write split can be introduced later if read-path optimisation demands it.

## References

- Spec: [.scratch/2026-07-08-shop-management-system/specs/01-storage-foundation.md](../../.scratch/2026-07-08-shop-management-system/specs/01-storage-foundation.md)
- Code: [src/data/port.ts](../../src/data/port.ts), [src/data/in-memory.ts](../../src/data/in-memory.ts), [src/data/expo-sqlite.ts](../../src/data/expo-sqlite.ts)
