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
  test("createTableSql(staff) reproduces the staff schema (types, NOT NULL, PRIMARY KEY)", () => {
    expect(createTableSql("staff")).toBe(
      "CREATE TABLE IF NOT EXISTS staff " +
        "(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, " +
        "notes TEXT NOT NULL, voided_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
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

  test("MIGRATIONS v1 builds all 5 tables + idx_item_record_id; the index is NON-unique (many items per record)", () => {
    expect(MIGRATIONS).toHaveLength(1);
    const v1 = MIGRATIONS.find((m) => m.version === 1);
    expect(v1).toBeDefined();
    expect(v1!.statements).toEqual([
      createTableSql("staff"),
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
  });
});
