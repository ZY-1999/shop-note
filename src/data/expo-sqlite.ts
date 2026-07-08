import * as SQLite from "expo-sqlite";
import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";
import type { HasId, Query, StoragePort } from "@/data/port";
import {
  SCHEMA,
  buildFind,
  buildInsert,
  buildUpdate,
  deserializeRow,
} from "@/data/sql-logic";
import type { BuildQuery, TableName } from "@/data/sql-logic";
import { runMigrations } from "@/data/expo-sqlite-migration";

/**
 * Production storage adapter — `expo-sqlite` backed (spec #02).
 *
 * A **thin executor** over #01's pure SQL builders: each port method binds
 * `{sql, params}` from `buildInsert`/`buildUpdate`/`buildFind` and runs it via
 * the `SQLiteDatabase`, deserializing JSON columns on read. No SQL strings live
 * here — the adapter is dumb by design (ADR-0001/0003). Open the store through
 * {@link ExpoSqliteAdapter.open}; it sets WAL and runs migrations before use.
 *
 * Verified by the device smoke (spec #02/#03) against `InMemoryAdapter`, not by
 * Jest (the repo is the single test seam — PRD testing decision).
 */
export class ExpoSqliteAdapter implements StoragePort {
  /**
   * Open `name`, switch to WAL, and run migrations — yields an adapter ready for
   * use. The single factory keeps lifecycle in one place (what the smoke and any
   * future composition root want).
   */
  static async open(name: string): Promise<ExpoSqliteAdapter> {
    const db = await SQLite.openDatabaseAsync(name);
    await db.execAsync("PRAGMA journal_mode = WAL");
    await runMigrations(db);
    return new ExpoSqliteAdapter(db);
  }

  private constructor(private readonly db: SQLiteDatabase) {}

  /** Close the underlying database (lifecycle; not on StoragePort). */
  async close(): Promise<void> {
    await this.db.closeAsync();
  }

  /**
   * Hand-written `BEGIN`/`COMMIT`/`ROLLBACK`. `SQLiteDatabase.withTransactionAsync`
   * returns `void`, but the port contract must return `T`; a single connection
   * means `fn`'s queries share this transaction. **Not reentrant** — `BEGIN`
   * cannot nest (no `SAVEPOINT`); see the `withTransaction` note on `StoragePort`.
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.db.execAsync("BEGIN");
    try {
      const result = await fn();
      await this.db.execAsync("COMMIT");
      return result;
    } catch (error) {
      try {
        await this.db.execAsync("ROLLBACK");
      } catch {
        // best-effort — the original error is the one that matters.
      }
      throw error;
    }
  }

  async insert<T extends HasId>(table: string, row: T): Promise<T> {
    const t = tableNameOf(table);
    const { sql, params } = buildInsert(t, row as Record<string, unknown>);
    await this.db.runAsync(sql, bind(params));
    return row;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    const t = tableNameOf(table);
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${t} WHERE id = ?`,
      [id],
    );
    return row ? (deserializeRow(t, row) as T) : null;
  }

  async update<T extends object>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
    const t = tableNameOf(table);
    const { sql, params } = buildUpdate(t, id, patch as Record<string, unknown>);
    const result = await this.db.runAsync(sql, bind(params));
    if (result.changes === 0) return null; // no such row — matches InMemoryAdapter
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ${t} WHERE id = ?`,
      [id],
    );
    return row ? (deserializeRow(t, row) as T) : null;
  }

  async find<T>(table: string, query?: Query<T>): Promise<T[]> {
    const t = tableNameOf(table);
    const { sql, params } = buildFind(t, toBuildQuery(query));
    const rows = await this.db.getAllAsync<Record<string, unknown>>(sql, bind(params));
    return rows.map((row) => deserializeRow(t, row) as T);
  }
}

/**
 * Bridge the port's `Query<T>` to #01's structural `BuildQuery` (column-name
 * strings, not `keyof T`). A clean widening — no cast on the values, only on the
 * field selector — so the builder stays generic-agnostic.
 */
function toBuildQuery<T>(query?: Query<T>): BuildQuery | undefined {
  if (!query) return undefined;
  const out: BuildQuery = {};
  if (query.where) out.where = query.where as unknown as Record<string, unknown>;
  if (query.orderBy) {
    out.orderBy = { field: String(query.orderBy.field), dir: query.orderBy.dir };
  }
  if (query.limit != null) out.limit = query.limit;
  return out;
}

/** Narrow a port `table: string` to a registry `TableName`, or throw clearly. */
function tableNameOf(table: string): TableName {
  if (!(table in SCHEMA)) {
    throw new Error(`ExpoSqliteAdapter: unknown table "${table}"`);
  }
  return table as TableName;
}

/**
 * Bind params with `undefined`→`null`. SQLite has no undefined bind value
 * (`SQLiteBindValue`), and `InMemoryAdapter` treats undefined as absent (== null)
 * — normalizing here keeps the two adapters behaviorally equal for nullable
 * columns the repo leaves unset.
 */
function bind(params: unknown[]): SQLiteBindParams {
  return params.map((p) => (p === undefined ? null : p)) as unknown as SQLiteBindParams;
}
