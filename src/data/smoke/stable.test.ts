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

  test("timestamp-ish fields (_at + timestamp) → '<time>' when present; null/absent both dropped", () => {
    expect(stable({ created_at: 1, updated_at: 2, timestamp: 5 })).toEqual({
      created_at: "<time>",
      updated_at: "<time>",
      timestamp: "<time>",
    });
    // voided_at null (not voided) → dropped (port: null ≈ absent).
    expect(stable({ voided_at: null })).toEqual({});
    expect(stable({ voided_at: 9 })).toEqual({ voided_at: "<time>" });
  });

  test("null- and undefined-valued keys are dropped (port: null/undefined ≈ absent)", () => {
    expect(stable({ note: undefined })).toEqual({});
    expect(stable({ note: null })).toEqual({});
    // create-scenario FieldDiff: old:undefined → dropped, matching both Expo's
    // old:null (also dropped) and InMemory's lossy rollback clone (key omitted).
    const diff = [{ field: "name", old: undefined, new: "张三" }];
    expect(stable(diff)).toEqual([{ field: "name", new: "张三" }]);
  });

  test("non-volatile fields pass through; null-valued keys dropped; objects/arrays recursed", () => {
    const product = {
      id: "p1",
      title: "可乐",
      purchase_price: 1995,
      code: null, // dropped
      category: "饮料",
      created_at: 1,
    };
    expect(stable(product)).toEqual({
      id: "<id>",
      title: "可乐",
      purchase_price: 1995,
      category: "饮料",
      created_at: "<time>",
    });
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

  test("a null-valued key and a missing key compare equal (the rollback-clone gap)", () => {
    // Expo side: create-audit FieldDiff stored with old: null (faithful SQL row).
    // InMemory side after a rollback: the same FieldDiff with `old` MISSING (the
    // JSON-clone rollback dropped old:undefined). stable() must canonicalize both
    // to the same shape — this is exactly the [0].diff[0] 3-keys-≠-2-keys case.
    const expoSide = stable([{ field: "name", old: null, new: "张三" }]);
    const memSide = stable([{ field: "name", new: "张三" }]); // old absent
    expect(expoSide).toEqual(memSide);
  });

  test("FieldDiff old/new are normalized by the sibling `field` name (timestamps/ids nested under generic keys)", () => {
    // The audit-timeline hazard: a void/restore diff's `new` holds a real `now()`
    // millisecond, and the two adapters call now() ~ms apart. The key is "new"
    // (generic), so stable() must classify the VALUE by the sibling `field` name.
    // void diff: field=voided_at, old:null (was active) → dropped, new:<ts> → "<time>".
    expect(stable([{ field: "voided_at", old: null, new: 1783521752541 }])).toEqual([
      { field: "voided_at", new: "<time>" },
    ]);
    // restore diff: old:<ts> → "<time>", new:null → dropped.
    expect(stable([{ field: "voided_at", old: 1783521752541, new: null }])).toEqual([
      { field: "voided_at", old: "<time>" },
    ]);
    // two adapters with different now() timestamps compare equal (the actual fix).
    expect(stable([{ field: "voided_at", old: null, new: 111 }])).toEqual(
      stable([{ field: "voided_at", old: null, new: 222 }]),
    );
    // non-timestamp field values pass through unchanged — money/qty must NOT be
    // collapsed (a price diff's new is a real number both sides agree on).
    expect(stable([{ field: "purchase_price", old: 1995, new: 2495 }])).toEqual([
      { field: "purchase_price", old: 1995, new: 2495 },
    ]);
    // an id-valued diff field (e.g. record_id change) collapses new → "<id>".
    expect(stable([{ field: "record_id", old: "r1", new: "r2" }])).toEqual([
      { field: "record_id", old: "<id>", new: "<id>" },
    ]);
  });
});
