/**
 * The single test seam.
 *
 * A dumb typed row-store: both the in-memory adapter (tests) and the
 * expo-sqlite adapter (production) implement this interface. The repository
 * is its only consumer; adapters never invent domain fields — the repo owns
 * id generation, timestamps, and voided semantics. Nothing in the system
 * hard-deletes (PRD invariant), so there is no `remove` on the surface.
 *
 * Design decision (spec #01, DESIGN-IT-TWICE): all business logic lives in
 * pure-TS repository modules on top of this port; the port stays shallow on
 * purpose. Resist pushing query/aggregation logic down here.
 */

/** Row identity — every stored row is keyed by `id`. */
export interface HasId {
  id: string;
}

/** A read query over a table. `where` is field equality (null/undefined both mean "absent"). */
export interface Query<T> {
  where?: Partial<T>;
  orderBy?: { field: keyof T; dir?: "asc" | "desc" };
  limit?: number;
}

export interface StoragePort {
  /**
   * Run `fn` atomically: on resolve, its writes commit; on throw, every write
   * made inside is rolled back and the error rethrows. Used to keep mutate +
   * audit in lockstep (no audit-without-change or change-without-audit).
   */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Store a row exactly as given (the repo has already set id/timestamps). */
  insert<T extends HasId>(table: string, row: T): Promise<T>;
  /** Return the row by id, or null. Survives soft-delete (voided rows remain). */
  findById<T>(table: string, id: string): Promise<T | null>;
  /** Merge a partial patch into the stored row; returns null if no such id. */
  update<T extends object>(table: string, id: string, patch: Partial<T>): Promise<T | null>;
  /** Return rows matching the query (all rows when no filter). */
  find<T>(table: string, query?: Query<T>): Promise<T[]>;
}
