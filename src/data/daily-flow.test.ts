import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { StaffRepository } from "@/data/staff";
import { StockRecordRepository } from "@/data/stock-record";
import { DailyFlow } from "@/data/daily-flow";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit);
  const dailyFlow = new DailyFlow(stockRecords);
  return { storage, audit, products, staff, stockRecords, dailyFlow };
}

/** A wall-clock ms at LOCAL noon on a given (Y, M, D) — pinned so dayBucket is
 *  deterministic regardless of the host timezone (new Date uses local time,
 *  dayBucket reads local time — the two agree). */
function localNoon(year: number, month0: number, day: number): number {
  return new Date(year, month0, day, 12, 0, 0, 0).getTime();
}

describe("DailyFlow — core aggregation", () => {
  test("two 'in' records, same staff + same day → one row summing their line_amounts", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(500) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });
    const day = localNoon(2026, 6, 9); // local 2026-07-09 noon

    // line_amount 500×2 = 1000
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 2 }],
    });
    // line_amount 500×1 = 500
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 1 }],
    });

    const rows = await dailyFlow.flow();
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-07-09");
    expect(rows[0].staff_id).toBe(staffS.id);
    expect(rows[0].in_amount).toBe(1500);
    expect(rows[0].out_amount).toBe(0);
  });
});

describe("DailyFlow — direction split per bucket", () => {
  test("an 'in' (1000) and an 'out' (300), same staff + same day → both on ONE row", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });
    const day = localNoon(2026, 6, 9);

    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 10 }], // 1000
    });
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "out",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 3 }], // 300
    });

    const rows = await dailyFlow.flow();
    expect(rows).toHaveLength(1); // not two
    expect(rows[0].in_amount).toBe(1000);
    expect(rows[0].out_amount).toBe(300);
  });
});

describe("DailyFlow — day ordering", () => {
  test("records on different days → distinct rows, newest day first", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: localNoon(2026, 6, 1),
      items: [{ product_id: productP.id, qty: 1 }],
    });
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: localNoon(2026, 6, 9),
      items: [{ product_id: productP.id, qty: 1 }],
    });
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: localNoon(2026, 6, 5),
      items: [{ product_id: productP.id, qty: 1 }],
    });

    const rows = await dailyFlow.flow();
    expect(rows.map((r) => r.date)).toEqual(["2026-07-09", "2026-07-05", "2026-07-01"]);
  });
});

describe("DailyFlow — void exclusion", () => {
  test("voiding a record drops its line_amount from the day's totals on next read", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });
    const day = localNoon(2026, 6, 9);

    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 5 }], // 500
    });
    const toVoid = await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 3 }], // 300
    });

    expect((await dailyFlow.flow())[0].in_amount).toBe(800);

    await stockRecords.void(toVoid.record.id);

    // voided record's line_amount gone, no explicit recompute
    expect((await dailyFlow.flow())[0].in_amount).toBe(500);
  });
});

describe("DailyFlow — edit propagation", () => {
  test("editing a record's line resnapshots → day total reflects the new amount", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });
    const day = localNoon(2026, 6, 9);

    const rec = await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 3 }], // snapshot 300
    });

    expect((await dailyFlow.flow())[0].in_amount).toBe(300);

    // edit qty 3 → 7 (resnapshot → 700)
    await stockRecords.update(rec.record.id, {
      items: [{ id: rec.items[0].id, product_id: productP.id, qty: 7 }],
    });

    expect((await dailyFlow.flow())[0].in_amount).toBe(700);
  });
});

describe("DailyFlow — frozen snapshot amount", () => {
  test("changing a product's current price leaves past flow rows unchanged", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: localNoon(2026, 6, 9),
      items: [{ product_id: productP.id, qty: 5 }], // snapshot 500
    });
    expect((await dailyFlow.flow())[0].in_amount).toBe(500);

    await products.update(productP.id, { purchase_price: cents(300) });

    // flow uses the frozen snapshot line_amount, not current-price-revalued
    expect((await dailyFlow.flow())[0].in_amount).toBe(500);
  });
});

describe("DailyFlow — filter", () => {
  test("staff_id filter narrows rows to that staff", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const s1 = await staff.create({ name: "张三", phone: "1", notes: "" });
    const s2 = await staff.create({ name: "李四", phone: "2", notes: "" });
    const day = localNoon(2026, 6, 9);

    await stockRecords.create({
      staff_id: s1.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 2 }], // 200
    });
    await stockRecords.create({
      staff_id: s2.id,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 5 }], // 500
    });

    const rows = await dailyFlow.flow({ staff_id: s1.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].staff_id).toBe(s1.id);
    expect(rows[0].in_amount).toBe(200);
  });

  test("date_range filter narrows rows to the window", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: localNoon(2026, 6, 1),
      items: [{ product_id: productP.id, qty: 1 }],
    });
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      timestamp: localNoon(2026, 6, 9),
      items: [{ product_id: productP.id, qty: 1 }],
    });

    const rows = await dailyFlow.flow({
      date_range: { from: localNoon(2026, 6, 5), to: localNoon(2026, 6, 15) },
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-07-09"]);
  });
});

describe("DailyFlow — derived never stored (ADR-0002)", () => {
  test("every read recomputes; DailyFlow exposes no write surface", async () => {
    const { stockRecords, dailyFlow } = setup();

    // Two independent reads return equal results — no cached figure to diverge.
    expect(await dailyFlow.flow()).toEqual(await dailyFlow.flow());

    // Compile-time: the projection is read-only — no save/persist/cache exists.
    // @ts-expect-error — no save
    void dailyFlow.save;
    // @ts-expect-error — no persist
    void dailyFlow.persist;
  });
});
