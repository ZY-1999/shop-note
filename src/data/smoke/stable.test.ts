import { describe, expect, test } from "@jest/globals";
import { stable } from "@/data/smoke/stable";

describe("stable() — normalizes volatile fields for cross-adapter compare", () => {
  test("id and *_id fields collapse to '<id>' (ids differ between adapters)", () => {
    expect(
      stable({
        id: "abc",
        staff_id: "s1",
        product_id: "p1",
        record_id: "r1",
        entity_id: "s1",
      }),
    ).toEqual({
      id: "<id>",
      staff_id: "<id>",
      product_id: "<id>",
      record_id: "<id>",
      entity_id: "<id>",
    });
  });

  test("timestamp-ish fields (_at + timestamp) → '<time>' when present, null when absent", () => {
    expect(stable({ created_at: 1, updated_at: 2, timestamp: 5 })).toEqual({
      created_at: "<time>",
      updated_at: "<time>",
      timestamp: "<time>",
    });
    // voided_at null (not voided) stays null; voided_at set → "<time>".
    expect(stable({ voided_at: null })).toEqual({ voided_at: null });
    expect(stable({ voided_at: 9 })).toEqual({ voided_at: "<time>" });
  });

  test("undefined → null everywhere (the audit_log.diff create-scenario hazard)", () => {
    expect(stable({ note: undefined })).toEqual({ note: null });
    // FieldDiff.old: undefined on InMemory → null, matching Expo's stored null.
    const diff = [{ field: "name", old: undefined, new: "张三" }];
    expect(stable(diff)).toEqual([{ field: "name", old: null, new: "张三" }]);
  });

  test("non-volatile fields pass through; objects and arrays are recursed", () => {
    const product = {
      id: "p1",
      title: "可乐",
      purchase_price: 1995,
      code: null,
      category: "饮料",
      created_at: 1,
    };
    expect(stable(product)).toEqual({
      id: "<id>",
      title: "可乐",
      purchase_price: 1995,
      code: null,
      category: "饮料",
      created_at: "<time>",
    });
    // nested array of rows
    const rows = [
      { id: "a", qty: 3 },
      { id: "b", qty: 5 },
    ];
    expect(stable(rows)).toEqual([
      { id: "<id>", qty: 3 },
      { id: "<id>", qty: 5 },
    ]);
  });

  test("returns a deep clone (input is not mutated)", () => {
    const input = { id: "x", diff: [{ field: "n", old: undefined, new: 1 }] };
    const out = stable(input);
    expect(out).not.toBe(input);
    expect(out.diff).not.toBe(input.diff);
    // input untouched (id still "x", old still undefined)
    expect(input.id).toBe("x");
    expect(input.diff[0].old).toBeUndefined();
  });
});
