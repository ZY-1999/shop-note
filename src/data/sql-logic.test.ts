import { describe, expect, test } from "@jest/globals";
import {
  buildFind,
  buildInsert,
  buildUpdate,
  deserializeRow,
  SCHEMA,
  serializeRow,
} from "@/data/sql-logic";

describe("SCHEMA registry", () => {
  test("covers all 5 tables with their entity column sets; audit_log.diff is the only JSON column", () => {
    expect(Object.keys(SCHEMA).sort()).toEqual(
      ["audit_log", "product", "staff", "stock_record", "stock_record_item"],
    );
    expect(SCHEMA.staff.columns).toEqual([
      "id", "name", "phone", "notes", "level", "voided_at", "created_at", "updated_at",
    ]);
    expect(SCHEMA.product.columns).toEqual([
      "id", "title", "purchase_price", "code", "category", "voided_at", "created_at", "updated_at",
    ]);
    expect(SCHEMA.stock_record.columns).toEqual([
      "id", "staff_id", "direction", "timestamp", "note", "voided_at", "created_at", "updated_at",
    ]);
    expect(SCHEMA.stock_record_item.columns).toEqual([
      "id", "record_id", "product_id", "title", "unit_price", "qty", "line_amount",
    ]);
    expect(SCHEMA.audit_log.columns).toEqual([
      "id", "actor", "action", "entity_type", "entity_id", "timestamp", "diff",
    ]);

    // Only audit_log.diff is a JSON column — the registry flags it so serialize/deserialize
    // and the DDL (spec #02) all share one source of truth.
    expect(SCHEMA.staff.jsonColumns).toEqual([]);
    expect(SCHEMA.product.jsonColumns).toEqual([]);
    expect(SCHEMA.stock_record.jsonColumns).toEqual([]);
    expect(SCHEMA.stock_record_item.jsonColumns).toEqual([]);
    expect(SCHEMA.audit_log.jsonColumns).toEqual(["diff"]);
  });
});

describe("buildInsert", () => {
  test("emits INSERT with registry column order, matching placeholders, and bound params", () => {
    const staff = {
      id: "s1", name: "张三", phone: "138", notes: "n", level: "normal",
      voided_at: null, created_at: 1, updated_at: 2,
    };
    const { sql, params } = buildInsert("staff", staff);
    expect(sql).toBe(
      "INSERT INTO staff (id, name, phone, notes, level, voided_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    expect(params).toEqual(["s1", "张三", "138", "n", "normal", null, 1, 2]);
  });

  test("stringifies JSON columns in the bind params (audit_log.diff)", () => {
    const entry = {
      id: "a1", actor: "owner", action: "create", entity_type: "staff",
      entity_id: "s1", timestamp: 5, diff: [{ field: "name", old: null, new: "张三" }],
    };
    const { sql, params } = buildInsert("audit_log", entry);
    expect(sql).toBe(
      "INSERT INTO audit_log (id, actor, action, entity_type, entity_id, timestamp, diff) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    expect(params.slice(0, 6)).toEqual(["a1", "owner", "create", "staff", "s1", 5]);
    // diff is the JSON column → bound as the JSON text of the array; non-JSON params pass through.
    expect(params[6]).toBe(JSON.stringify([{ field: "name", old: null, new: "张三" }]));
  });

  test("rejects a row key that is not a registry column (typo guard)", () => {
    const bad = {
      id: "s1", nme: "x", name: "a", phone: "p", notes: "n",
      voided_at: null, created_at: 1, updated_at: 2,
    };
    expect(() => buildInsert("staff", bad)).toThrow(/unknown column/);
  });
});

describe("buildUpdate", () => {
  test("emits UPDATE SET … WHERE id=? over the patch keys, in patch order", () => {
    const { sql, params } = buildUpdate("staff", "s1", { name: "李四", updated_at: 9 });
    expect(sql).toBe("UPDATE staff SET name = ?, updated_at = ? WHERE id = ?");
    expect(params).toEqual(["李四", 9, "s1"]);
  });

  test("rejects a patch key that is not a registry column (typo guard)", () => {
    expect(() => buildUpdate("staff", "s1", { nme: "x" })).toThrow(/unknown column/);
  });
});

describe("buildFind", () => {
  test("no query → SELECT * with no params", () => {
    const { sql, params } = buildFind("staff");
    expect(sql).toBe("SELECT * FROM staff");
    expect(params).toEqual([]);
  });

  test("where null/undefined → IS NULL; where value → = ?; multi-field joined with AND", () => {
    const both = buildFind("staff", { where: { voided_at: null, name: "张三" } });
    expect(both.sql).toBe("SELECT * FROM staff WHERE voided_at IS NULL AND name = ?");
    expect(both.params).toEqual(["张三"]);

    // undefined matches InMemory's "absent" semantics too → IS NULL (not `= ?`).
    const undef = buildFind("staff", { where: { phone: undefined } });
    expect(undef.sql).toBe("SELECT * FROM staff WHERE phone IS NULL");
  });

  test("orderBy (asc default / desc, no NULLS clause) and limit → LIMIT ?", () => {
    expect(buildFind("staff", { orderBy: { field: "created_at" } }).sql).toBe(
      "SELECT * FROM staff ORDER BY created_at ASC",
    );
    const desc = buildFind("staff", { orderBy: { field: "created_at", dir: "desc" }, limit: 10 });
    expect(desc.sql).toBe("SELECT * FROM staff ORDER BY created_at DESC LIMIT ?");
    expect(desc.params).toEqual([10]);
  });

  test("applies WHERE → ORDER BY → LIMIT in that order", () => {
    const full = buildFind("stock_record", {
      where: { staff_id: "s1" },
      orderBy: { field: "timestamp", dir: "desc" },
      limit: 5,
    });
    expect(full.sql).toBe(
      "SELECT * FROM stock_record WHERE staff_id = ? ORDER BY timestamp DESC LIMIT ?",
    );
    expect(full.params).toEqual(["s1", 5]);
  });
});

describe("deserializeRow", () => {
  test("parses JSON columns and passes every other column through", () => {
    const stored = {
      id: "a1", actor: "owner", action: "create", entity_type: "staff",
      entity_id: "s1", timestamp: 5,
      diff: JSON.stringify([{ field: "name", old: null, new: "张三" }]),
    };
    const row = deserializeRow("audit_log", stored);
    expect(row.diff).toEqual([{ field: "name", old: null, new: "张三" }]);
    expect(row.id).toBe("a1");
    expect(row.timestamp).toBe(5);
  });

  test("is a passthrough for tables with no JSON columns", () => {
    const staff = { id: "s1", name: "张三", voided_at: null };
    expect(deserializeRow("staff", staff)).toEqual(staff);
  });
});

describe("JSON round-trip", () => {
  test("audit_log.diff survives serialize→deserialize, normalizing FieldDiff.old:undefined → null", () => {
    const entry = {
      id: "a1", actor: "owner", action: "create", entity_type: "staff",
      entity_id: "s1", timestamp: 5,
      // create-scenario diff: there was no "before", so old === undefined (the hazard —
      // JSON.stringify would otherwise drop the key and break deep-equal with InMemory).
      diff: [{ field: "name", old: undefined, new: "张三" }],
    };
    const stored = serializeRow("audit_log", entry);
    expect(stored.diff).toBe(JSON.stringify([{ field: "name", old: null, new: "张三" }]));

    const back = deserializeRow("audit_log", stored);
    expect(back.diff).toEqual([{ field: "name", old: null, new: "张三" }]);
  });
});
