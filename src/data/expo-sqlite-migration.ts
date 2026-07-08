import type { SQLiteDatabase } from "expo-sqlite";
import type { TableName } from "@/data/sql-logic";

/**
 * Schema migrations for the expo-sqlite production adapter (spec #02).
 *
 * The DDL's column *names* derive from #01's {@link SCHEMA} (single source of
 * truth — the Jest suite asserts `COLUMNS[t].map(c => c.name)` equals
 * `SCHEMA[t].columns` for every table). This module adds only what SCHEMA does
 * not carry — SQLite types, nullability, and value-domain CHECK constraints
 * (ADR-0003). No `FOREIGN KEY` clauses, no `UNIQUE` (`PRAGMA foreign_keys` stays
 * off; references are enforced in the repository layer).
 *
 * `runMigrations` is device-only (needs a live {@link SQLiteDatabase}); the pure
 * DDL generators above it are Jest-covered. The `import type` keeps the
 * expo-sqlite *runtime* out of Jest's module graph — only the erased type reaches
 * this module, so tests can load it without a native dependency.
 */

type SqlType = "TEXT" | "INTEGER";

interface ColDef {
  readonly name: string;
  readonly type: SqlType;
  /** `id` columns → `PRIMARY KEY NOT NULL`. */
  readonly pk?: boolean;
  /** Default false → `NOT NULL`. */
  readonly nullable?: boolean;
  /** Raw CHECK body, e.g. `direction IN ('in', 'out')`. */
  readonly check?: string;
}

/**
 * Structured column definitions. Column NAMES are the drift-guarded source;
 * types/nullability/CHECK live only here (the device store's concern, not the
 * port's). `id` is the primary key on every table; every other column is
 * `NOT NULL` unless explicitly `nullable`.
 */
export const COLUMNS: Record<TableName, readonly ColDef[]> = {
  staff: [
    { name: "id", type: "TEXT", pk: true },
    { name: "name", type: "TEXT" },
    { name: "phone", type: "TEXT" },
    { name: "notes", type: "TEXT" },
    { name: "voided_at", type: "INTEGER", nullable: true },
    { name: "created_at", type: "INTEGER" },
    { name: "updated_at", type: "INTEGER" },
  ],
  product: [
    { name: "id", type: "TEXT", pk: true },
    { name: "title", type: "TEXT" },
    { name: "purchase_price", type: "INTEGER" },
    { name: "code", type: "TEXT", nullable: true },
    { name: "category", type: "TEXT", nullable: true },
    { name: "voided_at", type: "INTEGER", nullable: true },
    { name: "created_at", type: "INTEGER" },
    { name: "updated_at", type: "INTEGER" },
  ],
  stock_record: [
    { name: "id", type: "TEXT", pk: true },
    { name: "staff_id", type: "TEXT" },
    { name: "direction", type: "TEXT", check: "direction IN ('in', 'out')" },
    { name: "timestamp", type: "INTEGER" },
    { name: "note", type: "TEXT", nullable: true },
    { name: "voided_at", type: "INTEGER", nullable: true },
    { name: "created_at", type: "INTEGER" },
    { name: "updated_at", type: "INTEGER" },
  ],
  stock_record_item: [
    { name: "id", type: "TEXT", pk: true },
    { name: "record_id", type: "TEXT" },
    { name: "product_id", type: "TEXT" },
    { name: "title", type: "TEXT" },
    { name: "unit_price", type: "INTEGER" },
    { name: "qty", type: "INTEGER" },
    { name: "line_amount", type: "INTEGER" },
  ],
  audit_log: [
    { name: "id", type: "TEXT", pk: true },
    { name: "actor", type: "TEXT" },
    {
      name: "action",
      type: "TEXT",
      check: "action IN ('create', 'update', 'void', 'restore')",
    },
    { name: "entity_type", type: "TEXT" },
    { name: "entity_id", type: "TEXT" },
    { name: "timestamp", type: "INTEGER" },
    { name: "diff", type: "TEXT" },
  ],
};

function colSql(c: ColDef): string {
  let s = `${c.name} ${c.type}`;
  if (c.pk) s += " PRIMARY KEY NOT NULL";
  else if (!c.nullable) s += " NOT NULL";
  if (c.check) s += ` CHECK (${c.check})`;
  return s;
}

/** `CREATE TABLE … IF NOT EXISTS` for one table, columns in registry order. */
export function createTableSql(table: TableName): string {
  return `CREATE TABLE IF NOT EXISTS ${table} (${COLUMNS[table].map(colSql).join(", ")})`;
}

/**
 * Versioned migrations, applied in order. v1 is the initial schema for the 5
 * domain tables plus the `record_id` lookup index. `idx_item_record_id` is
 * NON-unique: a stock record has many items (the PRD's "唯一索引" = sole index,
 * not a uniqueness constraint).
 */
export const MIGRATIONS: ReadonlyArray<{
  readonly version: number;
  readonly statements: readonly string[];
}> = [
  {
    version: 1,
    statements: [
      createTableSql("staff"),
      createTableSql("product"),
      createTableSql("stock_record"),
      createTableSql("stock_record_item"),
      createTableSql("audit_log"),
      "CREATE INDEX IF NOT EXISTS idx_item_record_id ON stock_record_item(record_id)",
    ],
  },
];

/**
 * Apply every migration with `version > current PRAGMA user_version`, then bump
 * `user_version` to the latest. Idempotent via `CREATE … IF NOT EXISTS` — a
 * populated DB re-runs every statement as a no-op and leaves data intact, so
 * first launch and repeat launch both work.
 *
 * Device-only: requires a live {@link SQLiteDatabase} (the type-only import is
 * erased at transpile, so Jest can load this module without `expo-sqlite`).
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  const latest = Math.max(...MIGRATIONS.map((m) => m.version));
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const stmt of migration.statements) {
      await db.execAsync(stmt);
    }
  }
  if (latest > current) {
    await db.execAsync(`PRAGMA user_version = ${latest}`);
  }
}
