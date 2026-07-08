import { describe, expect, jest, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { StockRecordRepository } from "@/data/stock-record";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const products = new ProductRepository(storage, new AuditProvider(storage));
  const stockRecords = new StockRecordRepository(storage, products);
  return { storage, products, stockRecords };
}

describe("StockRecordRepository — create + snapshot", () => {
  test("create freezes each item's title + unit_price from the product at posting time", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const productB = await products.create({ title: "薯片", purchase_price: cents(500) });

    const { record, items } = await stockRecords.create({
      staff_id: "s1",
      direction: "in",
      items: [
        { product_id: productA.id, qty: 10 },
        { product_id: productB.id, qty: 5 },
      ],
    });

    expect(record.direction).toBe("in");
    expect(record.staff_id).toBe("s1");
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
      staff_id: "s1",
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
      staff_id: "s1",
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
      staff_id: "s1",
      direction: "in",
      note: "首批入库",
      items: [{ product_id: productA.id, qty: 10 }],
    });

    const got = await stockRecords.getById(record.id);
    expect(got).not.toBeNull();
    expect(got!.record).toMatchObject({ staff_id: "s1", direction: "in", note: "首批入库" });
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
        staff_id: "s1",
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
      staff_id: "s1",
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

    await stockRecords.create({ staff_id: "s1", direction: "in", timestamp: t1, items: [line] });
    await stockRecords.create({ staff_id: "s1", direction: "out", timestamp: t2, items: [line] });
    await stockRecords.create({ staff_id: "s2", direction: "in", timestamp: t3, items: [line] });

    expect((await stockRecords.list({ staff_id: "s1" }))).toHaveLength(2);
    expect((await stockRecords.list({ direction: "in" }))).toHaveLength(2);
    expect((await stockRecords.list({ date_range: { from: t2, to: t3 } }))).toHaveLength(2);
  });

  test("staffHistory returns a staff's records in chronological order", async () => {
    const { products, stockRecords } = setup();
    const productA = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const line = { product_id: productA.id, qty: 1 };

    // posted out of chronological order on purpose
    const t1 = Date.parse("2026-01-03T00:00:00Z");
    const t2 = Date.parse("2026-01-01T00:00:00Z");
    const t3 = Date.parse("2026-01-02T00:00:00Z");
    await stockRecords.create({ staff_id: "s1", direction: "in", timestamp: t1, items: [line] });
    await stockRecords.create({ staff_id: "s1", direction: "out", timestamp: t2, items: [line] });
    await stockRecords.create({ staff_id: "s1", direction: "in", timestamp: t3, items: [line] });
    await stockRecords.create({ staff_id: "s2", direction: "in", timestamp: t1, items: [line] });

    const history = await stockRecords.staffHistory("s1");
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.record.timestamp)).toEqual([t2, t3, t1]); // ascending
  });
});
