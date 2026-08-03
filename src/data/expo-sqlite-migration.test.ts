import { describe, expect, test } from "@jest/globals";
import { COLUMNS, createTableSql, MIGRATIONS, runMigrations } from "@/data/expo-sqlite-migration";
import { SCHEMA } from "@/data/sql-logic";
import type { TableName } from "@/data/sql-logic";

const TABLES: readonly TableName[] = [
  "staff",
  "product",
  "stock_record",
  "stock_record_item",
  "audit_log",
  "topup",
  "config",
];

describe("migration DDL", () => {
  test("createTableSql(staff) reproduces the staff schema (types, NOT NULL, PRIMARY KEY, level DEFAULT+CHECK)", () => {
    expect(createTableSql("staff")).toBe(
      "CREATE TABLE IF NOT EXISTS staff " +
        "(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, " +
        "notes TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'normal' CHECK (level IN ('normal', 'gold')), " +
        "voided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
  });

  test("createTableSql(topup) reproduces the top-up ledger schema (Cents amount, nullable note/voided_at)", () => {
    expect(createTableSql("topup")).toBe(
      "CREATE TABLE IF NOT EXISTS topup " +
        "(id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, amount INTEGER NOT NULL, " +
        "timestamp INTEGER NOT NULL, note TEXT, voided_at INTEGER, " +
        "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
  });

  test("createTableSql(config) reproduces the generic key-value config schema (id PK — id is the config key)", () => {
    expect(createTableSql("config")).toBe(
      "CREATE TABLE IF NOT EXISTS config " +
        "(id TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
  });

  test("stock_record carries unit_price_snapshot (nullable Cents; frozen on out, null on in)", () => {
    const ddl = createTableSql("stock_record");
    // nullable — no NOT NULL; out records freeze the global unit price, in records stay null.
    expect(ddl).toContain("unit_price_snapshot INTEGER,");
    expect(ddl).not.toMatch(/unit_price_snapshot INTEGER NOT NULL/);
  });

  test("nullable columns mirror the TS types (product.code/category, voided_at, stock_record.note)", () => {
    expect(createTableSql("product")).toContain("code TEXT,");
    expect(createTableSql("product")).toContain("category TEXT,");
    expect(createTableSql("stock_record")).toContain("note TEXT,");
    // voided_at is nullable everywhere it appears — no NOT NULL after it.
    for (const t of TABLES) {
      if (SCHEMA[t].columns.includes("voided_at")) {
        expect(createTableSql(t)).toContain("voided_at INTEGER,");
      }
    }
  });

  test("value-domain CHECK on direction and action; no FOREIGN KEY / UNIQUE in any table DDL", () => {
    expect(createTableSql("stock_record")).toContain(
      "CHECK (direction IN ('in', 'out'))",
    );
    expect(createTableSql("audit_log")).toContain(
      "CHECK (action IN ('create', 'update', 'void', 'restore'))",
    );
    for (const t of TABLES) {
      expect(createTableSql(t)).not.toMatch(/FOREIGN KEY/i);
      expect(createTableSql(t)).not.toMatch(/UNIQUE/i);
    }
  });

  test("COLUMNS names match SCHEMA columns for every table (single-source drift guard)", () => {
    for (const t of TABLES) {
      expect(COLUMNS[t].map((c) => c.name)).toEqual([...SCHEMA[t].columns]);
    }
  });

  test("MIGRATIONS: v1 staff CREATE frozen at pre-level shape; v2 ALTER adds level (DEFAULT+CHECK); idx NON-unique", () => {
    expect(MIGRATIONS).toHaveLength(5);

    const v1 = MIGRATIONS.find((m) => m.version === 1);
    expect(v1).toBeDefined();
    // v1 staff CREATE is FROZEN at its historical (pre-level) shape — deliberately
    // NOT createTableSql("staff") (which now includes level). Freezing avoids a
    // duplicate-column error: a fresh DB runs v1 CREATE (no level) then v2 ALTER
    // (adds level); an existing v1 DB skips v1 (IF NOT EXISTS) and gets level via
    // v2 ALTER. SQLite ALTER ADD COLUMN has no IF NOT EXISTS, so this is required.
    expect(v1!.statements[0]).toBe(
      "CREATE TABLE IF NOT EXISTS staff " +
        "(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, " +
        "notes TEXT NOT NULL, voided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
    expect(v1!.statements[0]).not.toBe(createTableSql("staff"));
    // stock_record also frozen (pre-self_use); other v1 tables still derive from COLUMNS.
    const frozenStockRecord =
      "CREATE TABLE IF NOT EXISTS stock_record " +
      "(id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, " +
      "direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), " +
      "timestamp INTEGER NOT NULL, note TEXT, unit_price_snapshot INTEGER, " +
      "voided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)";
    expect(v1!.statements.slice(1)).toEqual([
      createTableSql("product"),
      frozenStockRecord,
      createTableSql("stock_record_item"),
      createTableSql("audit_log"),
      "CREATE INDEX IF NOT EXISTS idx_item_record_id ON stock_record_item(record_id)",
    ]);
    // record_id is NOT unique — a stock record has many items; the PRD's "唯一索引"
    // means the sole index on that column, not a uniqueness constraint.
    const idxStmt = v1!.statements[5];
    expect(idxStmt).not.toMatch(/UNIQUE/i);

    // v2 backfills existing rows to 普站 via DEFAULT; CHECK guards the domain.
    const v2 = MIGRATIONS.find((m) => m.version === 2);
    expect(v2).toBeDefined();
    expect(v2!.statements).toEqual([
      "ALTER TABLE staff ADD COLUMN level TEXT NOT NULL DEFAULT 'normal' CHECK(level IN ('normal', 'gold'))",
    ]);
  });

  test("MIGRATIONS v3: clear-db rebuild — DROP 5 existing tables, CREATE all 7, rebuild idx, seed staff '-1'", () => {
    const latest = Math.max(...MIGRATIONS.map((m) => m.version));
    expect(latest).toBe(5);
    const v3 = MIGRATIONS.find((m) => m.version === 3);
    expect(v3).toBeDefined();

    // 1–5: DROP the 5 pre-existing tables (cascades idx_item_record_id away). topup/config
    // are new in v3 — nothing to drop.
    expect(v3!.statements.slice(0, 5)).toEqual([
      "DROP TABLE IF EXISTS staff",
      "DROP TABLE IF EXISTS product",
      "DROP TABLE IF EXISTS stock_record",
      "DROP TABLE IF EXISTS stock_record_item",
      "DROP TABLE IF EXISTS audit_log",
    ]);

    // 6–12: re-CREATE all 7. staff = full current schema (incl level). stock_record is
    // FROZEN pre-self_use (v5 ALTER still adds the column) — not createTableSql.
    const frozenStockRecord =
      "CREATE TABLE IF NOT EXISTS stock_record " +
      "(id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, " +
      "direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), " +
      "timestamp INTEGER NOT NULL, note TEXT, unit_price_snapshot INTEGER, " +
      "voided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)";
    expect(v3!.statements.slice(5, 12)).toEqual([
      createTableSql("staff"),
      createTableSql("product"),
      frozenStockRecord,
      createTableSql("stock_record_item"),
      createTableSql("audit_log"),
      createTableSql("topup"),
      createTableSql("config"),
    ]);
    expect(v3!.statements[5]).toBe(createTableSql("staff"));
    expect(v3!.statements[5]).toContain("level TEXT NOT NULL DEFAULT 'normal'");
    // stock_record re-create carries unit_price_snapshot but NOT self_use (frozen).
    expect(v3!.statements[7]).toBe(frozenStockRecord);
    expect(v3!.statements[7]).toContain("unit_price_snapshot INTEGER,");
    expect(v3!.statements[7]).not.toContain("self_use");

    // 13: idx_item_record_id rebuilt (DROP TABLE wiped it); still NON-unique.
    expect(v3!.statements[12]).toBe(
      "CREATE INDEX IF NOT EXISTS idx_item_record_id ON stock_record_item(record_id)",
    );
    expect(v3!.statements[12]).not.toMatch(/UNIQUE/i);

    // 14: seed the protected '-1' admin row (fixed id, bypasses StaffRepository.create's
    // random id()). Behavioral guards (filter / void / direction) live in the repo layer (spec 02).
    expect(v3!.statements[13]).toBe(
      "INSERT INTO staff (id, name, phone, notes, level, voided_at, created_at, updated_at) " +
        "VALUES ('-1', '管理员', '', '', 'normal', NULL, 0, 0)",
    );

    // Exactly 14 statements — no stray DROPs of new tables, no extra seeds.
    expect(v3!.statements).toHaveLength(14);
  });

  test("MIGRATIONS v4: DROP + rebuild config (repair pre-v3 config tables missing the id column)", () => {
    const v4 = MIGRATIONS.find((m) => m.version === 4);
    expect(v4).toBeDefined();
    // DROP forces a rebuild even when a pre-v3-shaped config table already exists —
    // CREATE TABLE IF NOT EXISTS alone (as v3 does) can't repair it. config holds only
    // the global unit price, so the rebuild is lossless in practice (cold start = 0).
    expect(v4!.statements).toEqual(["DROP TABLE IF EXISTS config", createTableSql("config")]);
  });

  test("MIGRATIONS v5: ALTER adds self_use; v1+v3 stock_record CREATE frozen pre-column; createTableSql emits DEFAULT 0", () => {
    // AC1+AC2 (checkout-self-use): dual-freeze so a fresh DB (v1→…→v5) and a
    // post-v3 DB both receive self_use via ALTER without duplicate-column.
    expect(MIGRATIONS).toHaveLength(5);
    expect(Math.max(...MIGRATIONS.map((m) => m.version))).toBe(5);

    const frozen =
      "CREATE TABLE IF NOT EXISTS stock_record " +
      "(id TEXT PRIMARY KEY NOT NULL, staff_id TEXT NOT NULL, " +
      "direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), " +
      "timestamp INTEGER NOT NULL, note TEXT, unit_price_snapshot INTEGER, " +
      "voided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)";

    const v1 = MIGRATIONS.find((m) => m.version === 1)!;
    expect(v1.statements[2]).toBe(frozen);
    expect(v1.statements[2]).not.toBe(createTableSql("stock_record"));

    const v3 = MIGRATIONS.find((m) => m.version === 3)!;
    expect(v3.statements[7]).toBe(frozen);
    expect(v3.statements[7]).not.toBe(createTableSql("stock_record"));

    const v5 = MIGRATIONS.find((m) => m.version === 5)!;
    expect(v5.statements).toEqual([
      "ALTER TABLE stock_record ADD COLUMN self_use INTEGER NOT NULL DEFAULT 0",
    ]);

    const ddl = createTableSql("stock_record");
    expect(ddl).toContain("self_use INTEGER NOT NULL DEFAULT 0");
    // column order: … unit_price_snapshot, self_use, voided_at …
    expect(ddl).toMatch(/unit_price_snapshot INTEGER, self_use INTEGER NOT NULL DEFAULT 0, voided_at/);
  });

  test("runMigrations is still (db) => Promise<void> — v3 added without changing the executor contract", () => {
    // Signature unchanged: the version gate + Math.max(...) auto-picks v3; no parameter or
    // return-type change. (Device-only — execution itself is covered by the smoke, ADR-0004.)
    expect(typeof runMigrations).toBe("function");
    expect(runMigrations.length).toBe(1);
  });
});
