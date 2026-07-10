/**
 * Pure SQL logic for the expo-sqlite production adapter (spec #01).
 *
 * The adapter (spec #02) owns SQL *execution*; this module owns SQL *generation*
 * and row (de)serialization, so the error-prone parts — column order, placeholder
 * counts, JSON-column round-trips, `find` semantics — are pure functions that
 * Jest can cover without a device. `SCHEMA` is the single source of truth shared
 * by these builders and the DDL/migration landed in spec #02 (ADR-0003).
 *
 * No `expo-sqlite` import, no I/O, no state.
 */

/** The five domain tables the adapter persists. */
export type TableName =
  | "staff"
  | "product"
  | "stock_record"
  | "stock_record_item"
  | "audit_log";

/** Per-table column metadata. `jsonColumns` are stringified on write, parsed on read. */
export interface TableSchema {
  readonly columns: readonly string[];
  readonly jsonColumns: readonly string[];
}

/**
 * Single source of truth for every table's columns. Column order mirrors the
 * entity interface declaration order, which the DDL (spec #02) reproduces — so
 * `INSERT` column lists, the schema, and the TS row shapes all agree.
 */
export const SCHEMA: Record<TableName, TableSchema> = {
  staff: {
    columns: ["id", "name", "phone", "notes", "level", "voided_at", "created_at", "updated_at"],
    jsonColumns: [],
  },
  product: {
    columns: ["id", "title", "purchase_price", "code", "category", "voided_at", "created_at", "updated_at"],
    jsonColumns: [],
  },
  stock_record: {
    columns: ["id", "staff_id", "direction", "timestamp", "note", "voided_at", "created_at", "updated_at"],
    jsonColumns: [],
  },
  stock_record_item: {
    columns: ["id", "record_id", "product_id", "title", "unit_price", "qty", "line_amount"],
    jsonColumns: [],
  },
  audit_log: {
    columns: ["id", "actor", "action", "entity_type", "entity_id", "timestamp", "diff"],
    // FieldDiff[] — a nested array the port stores as a flat JSON text column (ADR-0003).
    jsonColumns: ["diff"],
  },
};

/** Structural query shape the builders consume (column-name strings, not keyof T).
 *  The adapter bridges StoragePort's `Query<T>` → `BuildQuery` at the call site. */
export interface BuildQuery {
  where?: Record<string, unknown>;
  orderBy?: { field: string; dir?: "asc" | "desc" };
  limit?: number;
}

/** A built statement: the SQL text plus the bind params, in order. */
export interface BuiltSql {
  sql: string;
  params: unknown[];
}

/**
 * Recursively replace `undefined` with `null`. `JSON.stringify` drops
 * undefined-valued object keys (e.g. `FieldDiff.old` on a create audit, where
 * there was no "before"); normalizing first keeps the key in the stored JSON so
 * the round-trip is stable and deep-equal with the in-memory adapter holds.
 */
function normalizeUndefined(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeUndefined);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeUndefined(v);
    }
    return out;
  }
  return value;
}

/**
 * Serialize a row for storage: JSON columns become JSON text (with `undefined`
 * normalized to `null` first), every other column passes through unchanged.
 * The inverse of {@link deserializeRow}.
 */
export function serializeRow(
  table: TableName,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const { jsonColumns } = SCHEMA[table];
  if (jsonColumns.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = jsonColumns.includes(key) ? JSON.stringify(normalizeUndefined(value)) : value;
  }
  return out;
}

/**
 * Deserialize a stored row: JSON columns are parsed back, every other column
 * passes through. The inverse of {@link serializeRow}.
 */
export function deserializeRow(
  table: TableName,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const { jsonColumns } = SCHEMA[table];
  if (jsonColumns.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = jsonColumns.includes(key) && typeof value === "string" ? JSON.parse(value) : value;
  }
  return out;
}

/** Throw if any key is not a registry column — keeps DDL, INSERT, and UPDATE aligned to
 *  one source of truth; a repo typo surfaces here rather than silently creating a column. */
function assertKnownKeys(table: TableName, keys: readonly string[]): void {
  const columns = SCHEMA[table].columns;
  for (const key of keys) {
    if (!columns.includes(key)) {
      throw new Error(`unknown column "${key}" for table "${table}"`);
    }
  }
}

/** INSERT using the registry's column order; row keys must all be known columns. */
export function buildInsert(table: TableName, row: Record<string, unknown>): BuiltSql {
  const columns = SCHEMA[table].columns;
  assertKnownKeys(table, Object.keys(row));
  const serialized = serializeRow(table, row);
  const cols = columns.join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const params = columns.map((c) => serialized[c]);
  return { sql: `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, params };
}

/** UPDATE over the patch keys (registry-validated), `WHERE id = ?` last. */
export function buildUpdate(
  table: TableName,
  id: string,
  patch: Record<string, unknown>,
): BuiltSql {
  const keys = Object.keys(patch);
  assertKnownKeys(table, keys);
  const serialized = serializeRow(table, patch);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const params = keys.map((k) => serialized[k]);
  params.push(id);
  return { sql: `UPDATE ${table} SET ${sets} WHERE id = ?`, params };
}

/**
 * SELECT mirroring `InMemoryAdapter.find`: a null/undefined `where` value means
 * `IS NULL`, any other value means `= ?`; `orderBy` uses SQLite's default null
 * ordering (null = smallest — no `NULLS` clause); applied WHERE → ORDER BY → LIMIT.
 */
export function buildFind(table: TableName, query?: BuildQuery): BuiltSql {
  const parts = [`SELECT * FROM ${table}`];
  const params: unknown[] = [];
  const where = query?.where;
  if (where) {
    const clauses: string[] = [];
    for (const [field, value] of Object.entries(where)) {
      if (value == null) {
        clauses.push(`${field} IS NULL`);
      } else {
        clauses.push(`${field} = ?`);
        params.push(value);
      }
    }
    if (clauses.length > 0) parts.push(`WHERE ${clauses.join(" AND ")}`);
  }
  if (query?.orderBy) {
    const dir = (query.orderBy.dir ?? "asc").toUpperCase();
    parts.push(`ORDER BY ${query.orderBy.field} ${dir}`);
  }
  if (query?.limit != null) {
    parts.push("LIMIT ?");
    params.push(query.limit);
  }
  return { sql: parts.join(" "), params };
}
