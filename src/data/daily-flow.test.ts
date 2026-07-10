import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { StaffRepository, ADMIN_STAFF_ID } from "@/data/staff";
import { ConfigRepository } from "@/data/config";
import { StockRecordRepository } from "@/data/stock-record";
import { DailyFlow } from "@/data/daily-flow";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const config = new ConfigRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit, config);
  const dailyFlow = new DailyFlow(stockRecords);
  return { storage, audit, products, staff, stockRecords, dailyFlow };
}

/** A wall-clock ms at LOCAL noon on a given (Y, M, D) — pinned so dayBucket is
 *  deterministic regardless of the host timezone (new Date uses local time,
 *  dayBucket reads local time — the two agree). */
function localNoon(year: number, month0: number, day: number): number {
  return new Date(year, month0, day, 12, 0, 0, 0).getTime();
}

/**
 * stock-balance-refactor: restock ('in') is owned by the admin `-1`, members only
 * check out ('out'). So a (day, staff) bucket now holds EITHER a restock (staff
 * `-1`, in_amount) OR a member's checkouts (out_amount) — not both on one row.
 * The derivation logic is unchanged; the fixtures route 'in' to `-1` and 'out' to
 * a real member.
 */
describe("DailyFlow — core aggregation", () => {
  test("two 'in' records, same admin + same day → one row summing their line_amounts", async () => {
    const { products, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(500) });
    const day = localNoon(2026, 6, 9); // local 2026-07-09 noon

    // line_amount 500×2 = 1000
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 2 }],
    });
    // line_amount 500×1 = 500
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 1 }],
    });

    const rows = await dailyFlow.flow();
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-07-09");
    expect(rows[0].staff_id).toBe(ADMIN_STAFF_ID);
    expect(rows[0].in_amount).toBe(1500);
    expect(rows[0].out_amount).toBe(0);
  });
});

describe("DailyFlow — restock vs member checkout are separate (day, staff) rows", () => {
  test("a restock (admin -1) and a member out, same day → two rows", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const member = await staff.create({ name: "张三", phone: "138", notes: "" });
    const day = localNoon(2026, 6, 9);

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 10 }], // restock 1000
    });
    await stockRecords.create({
      staff_id: member.id,
      direction: "out",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 3 }], // member out 300
    });

    const rows = await dailyFlow.flow();
    expect(rows).toHaveLength(2); // one per (day, staff)
    const restockRow = rows.find((r) => r.staff_id === ADMIN_STAFF_ID)!;
    const memberRow = rows.find((r) => r.staff_id === member.id)!;
    expect(restockRow.in_amount).toBe(1000);
    expect(restockRow.out_amount).toBe(0);
    expect(memberRow.in_amount).toBe(0);
    expect(memberRow.out_amount).toBe(300);
  });
});

describe("DailyFlow — day ordering", () => {
  test("records on different days → distinct rows, newest day first", async () => {
    const { products, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: localNoon(2026, 6, 1),
      items: [{ product_id: productP.id, qty: 1 }],
    });
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: localNoon(2026, 6, 9),
      items: [{ product_id: productP.id, qty: 1 }],
    });
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
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
    const { products, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const day = localNoon(2026, 6, 9);

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 5 }], // 500
    });
    const toVoid = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
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
    const { products, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const day = localNoon(2026, 6, 9);

    const rec = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
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
    const { products, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
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
  test("staff_id filter narrows rows to that staff (member checkouts)", async () => {
    const { products, staff, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });
    const s1 = await staff.create({ name: "张三", phone: "1", notes: "" });
    const s2 = await staff.create({ name: "李四", phone: "2", notes: "" });
    const day = localNoon(2026, 6, 9);

    await stockRecords.create({
      staff_id: s1.id,
      direction: "out",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 2 }], // 200
    });
    await stockRecords.create({
      staff_id: s2.id,
      direction: "out",
      timestamp: day,
      items: [{ product_id: productP.id, qty: 5 }], // 500
    });

    const rows = await dailyFlow.flow({ staff_id: s1.id });
    expect(rows).toHaveLength(1);
    expect(rows[0].staff_id).toBe(s1.id);
    expect(rows[0].out_amount).toBe(200);
  });

  test("date_range filter narrows rows to the window", async () => {
    const { products, stockRecords, dailyFlow } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(100) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: localNoon(2026, 6, 1),
      items: [{ product_id: productP.id, qty: 1 }],
    });
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
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
    const { dailyFlow } = setup();

    // Two independent reads return equal results — no cached figure to diverge.
    expect(await dailyFlow.flow()).toEqual(await dailyFlow.flow());

    // Compile-time: the projection is read-only — no save/persist/cache exists.
    // @ts-expect-error — no save
    void dailyFlow.save;
    // @ts-expect-error — no persist
    void dailyFlow.persist;
  });
});
