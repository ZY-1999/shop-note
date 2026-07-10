import { describe, expect, jest, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { ADMIN_STAFF_ID } from "@/data/staff";
import { StockRecordRepository } from "@/data/stock-record";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit);
  return { storage, audit, products, stockRecords };
}

describe("StockRecordRepository — direction guard (stock-balance-refactor)", () => {
  test("create 'in' (restock) requires the admin staff_id '-1'; a normal member is rejected", async () => {
    const { products, stockRecords } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    await expect(
      stockRecords.create({
        staff_id: "s1",
        direction: "in",
        items: [{ product_id: p.id, qty: 1 }],
      }),
    ).rejects.toThrow(/admin|-1|restock/i);

    // via '-1' it succeeds — restock is global.
    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 5 }],
    });
    expect(record.direction).toBe("in");
    expect(record.staff_id).toBe(ADMIN_STAFF_ID);
  });

  test("create 'out' accepts any staff_id (normal members check out)", async () => {
    const { products, stockRecords } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record } = await stockRecords.create({
      staff_id: "s1",
      direction: "out",
      items: [{ product_id: p.id, qty: 1 }],
    });
    expect(record.staff_id).toBe("s1");
    expect(record.direction).toBe("out");
  });

  test("update guard: flipping an 'out' record to direction 'in' forces staff_id '-1'", async () => {
    const { products, stockRecords } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record } = await stockRecords.create({
      staff_id: "s1",
      direction: "out",
      items: [{ product_id: p.id, qty: 1 }],
    });

    // flipping to 'in' while still under a normal member is blocked.
    await expect(stockRecords.update(record.id, { direction: "in" })).rejects.toThrow(
      /admin|-1|restock/i,
    );

    // 'in' together with '-1' is allowed — the invariant holds post-edit.
    const updated = await stockRecords.update(record.id, {
      direction: "in",
      staff_id: ADMIN_STAFF_ID,
    });
    expect(updated.record.direction).toBe("in");
    expect(updated.record.staff_id).toBe(ADMIN_STAFF_ID);
  });
});

describe("StockRecordRepository — create + snapshot", () => {
  test("create freezes each item's title + unit_price from the product at posting time", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const productB = await products.create({ title: "薯片", purchase_price: cents(500) });

    const { record, items } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [
        { product_id: productA.id, qty: 10 },
        { product_id: productB.id, qty: 5 },
      ],
    });

    expect(record.direction).toBe("in");
    expect(record.staff_id).toBe(ADMIN_STAFF_ID);
    expect(items).toHaveLength(2);

    const itemA = items.find((i) => i.product_id === productA.id)!;
    expect(itemA.title).toBe("可乐");
    expect(itemA.unit_price).toBe(1995);
    expect(itemA.qty).toBe(10);
    expect(itemA.line_amount).toBe(19950); // 1995 × 10

    const itemB = items.find((i) => i.product_id === productB.id)!;
    expect(itemB.title).toBe("薯片");
    expect(itemB.unit_price).toBe(500);
    expect(itemB.line_amount).toBe(2500); // 500 × 5
  });

  test("record create produces no audit entry (only edit/void are audited)", async () => {
    const { storage, products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    // product create wrote audit entries; the stock record create wrote none.
    const timeline = await new AuditProvider(storage).queryTimeline({});
    expect(timeline.filter((e) => e.entity_type === "stock_record")).toHaveLength(0);
  });
});

describe("StockRecordRepository — snapshot fidelity + read shape", () => {
  test("after editing the product, the record's item keeps its original snapshot; product_id retained", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });

    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    // master-data drift after posting
    await products.update(productA.id, { title: "Cola", purchase_price: cents(2495) });

    const reRead = await stockRecords.getById(record.id);
    expect(reRead).not.toBeNull();
    const item = reRead!.items[0];
    expect(item.title).toBe("可乐"); // snapshot unchanged
    expect(item.unit_price).toBe(1995); // snapshot unchanged
    expect(item.product_id).toBe(productA.id); // FK retained for derivation
  });

  test("getById returns the header plus the full item list with snapshots", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });

    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      note: "首批入库",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    const got = await stockRecords.getById(record.id);
    expect(got).not.toBeNull();
    expect(got!.record).toMatchObject({ staff_id: ADMIN_STAFF_ID, direction: "in", note: "首批入库" });
    expect(got!.items).toHaveLength(1);
    expect(got!.items[0]).toMatchObject({ title: "可乐", unit_price: 1995, qty: 10 });
  });
});

describe("StockRecordRepository — timestamp", () => {
  test("defaults to now when omitted", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });

    const fixed = Date.parse("2026-01-01T00:00:00Z");
    jest.useFakeTimers();
    jest.setSystemTime(fixed);
    try {
      const { record } = await stockRecords.create({
        staff_id: ADMIN_STAFF_ID,
        direction: "in",
        items: [{ product_id: productA.id, qty: 1 }],
      });
      expect(record.timestamp).toBe(fixed);
    } finally {
      jest.useRealTimers();
    }
  });

  test("is backdatable to an earlier time", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });

    const earlier = Date.parse("2025-01-01T00:00:00Z");
    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: earlier,
      items: [{ product_id: productA.id, qty: 1 }],
    });
    expect(record.timestamp).toBe(earlier);
  });
});

describe("StockRecordRepository — list/filter", () => {
  test("filters by staff_id, direction, and date_range", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const line = { product_id: productA.id, qty: 1 };

    const t1 = Date.parse("2026-01-01T00:00:00Z");
    const t2 = Date.parse("2026-01-02T00:00:00Z");
    const t3 = Date.parse("2026-01-03T00:00:00Z");

    await stockRecords.create({ staff_id: ADMIN_STAFF_ID, direction: "in", timestamp: t1, items: [line] });
    await stockRecords.create({ staff_id: "s1", direction: "out", timestamp: t2, items: [line] });
    await stockRecords.create({ staff_id: "s2", direction: "out", timestamp: t3, items: [line] });

    // staff_id filter → only s1's 'out' (the 'in' restock is under '-1').
    expect((await stockRecords.list({ staff_id: "s1" }))).toHaveLength(1);
    // direction filter → the single restock ('in') vs the two member checkouts ('out').
    expect((await stockRecords.list({ direction: "in" }))).toHaveLength(1);
    expect((await stockRecords.list({ direction: "out" }))).toHaveLength(2);
    expect((await stockRecords.list({ date_range: { from: t2, to: t3 } }))).toHaveLength(2);
  });

  test("staffHistory returns a staff's records in chronological order", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const line = { product_id: productA.id, qty: 1 };

    // posted out of chronological order on purpose — all member checkouts ('out').
    const t1 = Date.parse("2026-01-03T00:00:00Z");
    const t2 = Date.parse("2026-01-01T00:00:00Z");
    const t3 = Date.parse("2026-01-02T00:00:00Z");
    await stockRecords.create({ staff_id: "s1", direction: "out", timestamp: t1, items: [line] });
    await stockRecords.create({ staff_id: "s1", direction: "out", timestamp: t2, items: [line] });
    await stockRecords.create({ staff_id: "s1", direction: "out", timestamp: t3, items: [line] });
    await stockRecords.create({ staff_id: "s2", direction: "out", timestamp: t1, items: [line] });

    const history = await stockRecords.staffHistory("s1");
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.record.timestamp)).toEqual([t2, t3, t1]); // ascending
  });
});

describe("StockRecordRepository — edit (resnapshot) + void", () => {
  test("edit resnapshots touched lines to current product price; untouched lines keep original snapshot", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const productB = await products.create({ title: "薯片", purchase_price: cents(500) });

    const { record, items } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [
        { product_id: productA.id, qty: 10 },
        { product_id: productB.id, qty: 5 },
      ],
    });
    const itemA = items.find((i) => i.product_id === productA.id)!;
    const itemB = items.find((i) => i.product_id === productB.id)!;

    // product A's price drifts after posting
    await products.update(productA.id, { purchase_price: cents(2495) });

    // edit: change item A's qty 10→20 (touched → resnapshot); item B not mentioned
    const { items: updatedItems } = await stockRecords.update(record.id, {
      items: [{ id: itemA.id, product_id: productA.id, qty: 20 }],
    });

    const updatedA = updatedItems.find((i) => i.id === itemA.id)!;
    expect(updatedA.qty).toBe(20);
    expect(updatedA.unit_price).toBe(2495); // resnapshot to current price
    expect(updatedA.line_amount).toBe(49900); // 2495 × 20

    const updatedB = updatedItems.find((i) => i.id === itemB.id)!;
    expect(updatedB.unit_price).toBe(500); // original snapshot preserved
    expect(updatedB.qty).toBe(5);
  });

  test("header edit (note/timestamp/staff_id) applies; updated_at advances", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });

    const t1 = Date.parse("2026-01-01T00:00:00Z");
    const t2 = Date.parse("2026-01-02T00:00:00Z");
    jest.useFakeTimers();
    try {
      jest.setSystemTime(t1);
      const { record } = await stockRecords.create({
        staff_id: "s1",
        direction: "out",
        items: [{ product_id: productA.id, qty: 1 }],
      });

      jest.setSystemTime(t2);
      const earlier = Date.parse("2025-01-01T00:00:00Z");
      const { record: updated } = await stockRecords.update(record.id, {
        staff_id: "s2",
        note: "修改备注",
        timestamp: earlier,
      });

      expect(updated.staff_id).toBe("s2");
      expect(updated.note).toBe("修改备注");
      expect(updated.timestamp).toBe(earlier); // backdatable, independent of system time
      expect(updated.updated_at).toBe(t2); // system time, advanced past record's t1
      expect(updated.updated_at).toBeGreaterThan(record.updated_at);

      const reRead = await stockRecords.getById(record.id);
      expect(reRead?.record.staff_id).toBe("s2");
      expect(reRead?.record.note).toBe("修改备注");
    } finally {
      jest.useRealTimers();
    }
  });

  test("adding a new line resnapshots it to the current product price", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const productB = await products.create({ title: "薯片", purchase_price: cents(500) });
    const { record, items } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    // add product B as a new line
    const { items: updatedItems } = await stockRecords.update(record.id, {
      items: [
        { id: items[0].id, product_id: productA.id, qty: 10 }, // unchanged
        { product_id: productB.id, qty: 3 }, // new line
      ],
    });

    expect(updatedItems).toHaveLength(2);
    const newItem = updatedItems.find((i) => i.product_id === productB.id)!;
    expect(newItem.unit_price).toBe(500); // snapshot at edit time
    expect(newItem.line_amount).toBe(1500);
  });
});

describe("StockRecordRepository — void semantics", () => {
  test("void sets voided_at; getById still returns with items intact; no delete API", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    const { record: voided } = await stockRecords.void(record.id);
    expect(voided.voided_at).not.toBeNull();

    const got = await stockRecords.getById(record.id);
    expect(got).not.toBeNull();
    expect(got!.items).toHaveLength(1); // items intact — never hard-removed

    // No hard-delete API exists on the surface.
    // @ts-expect-error — no delete method; records are voided, never erased
    void stockRecords.delete;
  });

  test("voided records are excluded from list/staffHistory (propagates to downstream reads)", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    await stockRecords.void(record.id);

    expect(await stockRecords.list()).toHaveLength(0);
    expect(await stockRecords.staffHistory(ADMIN_STAFF_ID)).toHaveLength(0);
  });
});

describe("StockRecordRepository — edit/void audit", () => {
  test("edit produces one 'update' entry with a field-level diff; void produces one 'void' entry", async () => {
    const { storage, products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      note: "原备注",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    await stockRecords.update(record.id, { note: "新备注" });
    await stockRecords.void(record.id);

    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "stock_record" });
    expect(timeline.map((e) => e.action)).toEqual(["update", "void"]);

    const updateEntry = timeline.find((e) => e.action === "update")!;
    expect(updateEntry.diff).toContainEqual({ field: "note", old: "原备注", new: "新备注" });
  });

  test("a qty change shows in the audit diff via the items signature", async () => {
    const { storage, products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record, items } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    await stockRecords.update(record.id, {
      items: [{ id: items[0].id, product_id: productA.id, qty: 20 }],
    });

    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "stock_record", action: "update" });
    expect(timeline).toHaveLength(1);
    const itemsDiff = timeline[0].diff.find((d) => d.field === "items");
    expect(itemsDiff).toBeDefined();
    expect(String(itemsDiff!.old)).toContain(":10:");
    expect(String(itemsDiff!.new)).toContain(":20:");
  });
});

describe("StockRecordRepository — resnapshot scope (negative)", () => {
  test("editing one item never corrupts the snapshot of untouched items", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const productB = await products.create({ title: "薯片", purchase_price: cents(500) });
    const { record, items } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [
        { product_id: productA.id, qty: 10 },
        { product_id: productB.id, qty: 5 },
      ],
    });
    const itemA = items.find((i) => i.product_id === productA.id)!;
    const itemB = items.find((i) => i.product_id === productB.id)!;

    // both products drift after posting
    await products.update(productA.id, { purchase_price: cents(9999) });
    await products.update(productB.id, { purchase_price: cents(9999) });

    // edit only item A
    await stockRecords.update(record.id, {
      items: [{ id: itemA.id, product_id: productA.id, qty: 20 }],
    });

    const reRead = await stockRecords.getById(record.id);
    const untouchedB = reRead!.items.find((i) => i.id === itemB.id)!;
    // B's snapshot is pristine — not re-priced to 9999
    expect(untouchedB.unit_price).toBe(500);
    expect(untouchedB.title).toBe("薯片");
    expect(untouchedB.qty).toBe(5);
  });
});

describe("StockRecordRepository — FK validation", () => {
  test("create throws if a referenced product does not exist", async () => {
    const { stockRecords } = setup();
    await expect(
      stockRecords.create({
        staff_id: "s1",
        direction: "out",
        items: [{ product_id: "nonexistent", qty: 1 }],
      }),
    ).rejects.toThrow(/product .* not found/);
  });

  test("update throws if a resnapshotted line references a missing product", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const { record, items } = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: productA.id, qty: 1 }],
    });

    // touching the line with a bad product_id must fail before any write persists
    await expect(
      stockRecords.update(record.id, {
        items: [{ id: items[0].id, product_id: "nonexistent", qty: 2 }],
      }),
    ).rejects.toThrow(/product .* not found/);

    // the failed edit left the record untouched (transaction rolled back)
    const untouched = await stockRecords.getById(record.id);
    expect(untouched!.items[0].product_id).toBe(productA.id);
    expect(untouched!.items[0].qty).toBe(1);
  });
});
