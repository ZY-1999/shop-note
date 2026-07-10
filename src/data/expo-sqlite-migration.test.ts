import { describe, expect, test } from "@jest/globals";
import { COLUMNS, createTableSql, MIGRATIONS } from "@/data/expo-sqlite-migration";
import { SCHEMA } from "@/data/sql-logic";
import type { TableName } from "@/data/sql-logic";

const TABLES: readonly TableName[] = [
  "staff",
  "product",
  "stock_record",
  "stock_record_item",
  "audit_log",
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
    expect(MIGRATIONS).toHaveLength(2);

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
    // the other v1 tables still derive from COLUMNS.
    expect(v1!.statements.slice(1)).toEqual([
      createTableSql("product"),
      createTableSql("stock_record"),
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
});
