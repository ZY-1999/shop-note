import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { StaffRepository, ADMIN_STAFF_ID } from "@/data/staff";
import { ConfigRepository } from "@/data/config";
import { StockRecordRepository } from "@/data/stock-record";
import { Inventory } from "@/data/inventory";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const config = new ConfigRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit, config);
  const inventory = new Inventory(stockRecords, products);
  return { storage, audit, products, staff, stockRecords, inventory };
}

/**
 * Global-inventory model (stock-balance-refactor): `shopAggregate` is the single
 * derived read — `Σ restock('in' via admin -1) − Σ member 'out'` per product,
 * across every staff. Members no longer hold stock; the per-staff balance /
 * staffInventory / staffSummaries reads are gone. Negative total_qty = 欠货
 * (invariant #5) — a member may check out more than the global stock holds.
 */
describe("Inventory — global shopAggregate", () => {
  test("shopAggregate = Σ restock (in via -1) − Σ member out", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 10 }],
    });
    await stockRecords.create({
      staff_id: "member",
      direction: "out",
      items: [{ product_id: p.id, qty: 3 }],
    });

    const row = (await inventory.shopAggregate()).find((a) => a.product.id === p.id)!;
    expect(row.total_qty).toBe(7); // 10 − 3
    expect(row.total_cost).toBe(1995 * 7); // current price × qty
  });

  test("voiding a record propagates to shopAggregate on the next read", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    const restock = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 10 }],
    });
    await stockRecords.create({
      staff_id: "member",
      direction: "out",
      items: [{ product_id: p.id, qty: 3 }],
    });

    expect((await inventory.shopAggregate()).find((a) => a.product.id === p.id)!.total_qty).toBe(7);

    await stockRecords.void(restock.record.id); // restock gone → only the -3 out remains
    expect((await inventory.shopAggregate()).find((a) => a.product.id === p.id)!.total_qty).toBe(-3);
  });

  test("editing a record's qty propagates to shopAggregate (no drift)", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 10 }],
    });
    const out = await stockRecords.create({
      staff_id: "member",
      direction: "out",
      items: [{ product_id: p.id, qty: 3 }],
    });

    expect((await inventory.shopAggregate()).find((a) => a.product.id === p.id)!.total_qty).toBe(7);

    // edit member out qty 3→5
    await stockRecords.update(out.record.id, {
      items: [{ id: out.items[0].id, product_id: p.id, qty: 5 }],
    });
    expect((await inventory.shopAggregate()).find((a) => a.product.id === p.id)!.total_qty).toBe(5);
  });

  test("cost revaluation: total_cost follows the product's current price; qty unchanged", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 10 }],
    });

    const row = (a: { total_qty: number; total_cost: number }) => a;
    expect(row((await inventory.shopAggregate()).find((a) => a.product.id === p.id)!)).toMatchObject({
      total_qty: 10,
      total_cost: 1995 * 10,
    });

    await products.update(p.id, { purchase_price: cents(2495) });

    expect(row((await inventory.shopAggregate()).find((a) => a.product.id === p.id)!)).toMatchObject({
      total_qty: 10, // qty unchanged
      total_cost: 2495 * 10, // revalued to current price
    });
  });
});

describe("Inventory — 欠货 (negative global stock)", () => {
  test("member out exceeding restock yields negative total_qty, no error (invariant #5)", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    // No restock yet — a member checking out drives the global stock negative.
    await stockRecords.create({
      staff_id: "member",
      direction: "out",
      items: [{ product_id: p.id, qty: 5 }],
    });

    const row = (await inventory.shopAggregate()).find((a) => a.product.id === p.id)!;
    expect(row.total_qty).toBe(-5);
    expect(row.total_cost).toBe(-5 * 1995);
  });
});

describe("Inventory — no-drift + read-only", () => {
  test("every read recomputes from the ledger; Inventory exposes no write surface", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 10 }],
    });

    // Two independent reads return equal results — no cached figure to diverge.
    expect(await inventory.shopAggregate()).toEqual(await inventory.shopAggregate());

    // Compile-time: the projection is read-only — no save/persist/cache exists.
    // @ts-expect-error — no saveBalance
    void inventory.saveBalance;
    // @ts-expect-error — no persist
    void inventory.persist;
  });
});

describe("Inventory — voided record/product handling", () => {
  test("voided records excluded; voided products still resolve for historical totals", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(1995) });

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      items: [{ product_id: p.id, qty: 10 }],
    });
    await stockRecords.create({
      staff_id: "member",
      direction: "out",
      items: [{ product_id: p.id, qty: 3 }],
    });

    // void the product → historical total still resolves with its price.
    await products.void(p.id);
    const row = (await inventory.shopAggregate()).find((a) => a.product.id === p.id)!;
    expect(row.total_qty).toBe(7); // 10 in − 3 out
    expect(row.total_cost).toBe(7 * 1995); // product still resolves at its price
  });
});

describe("Inventory — shopAggregateAsOf (summary-range-export #03)", () => {
  test("counts only unvoided moves with timestamp < beforeExclusiveMs; current price", async () => {
    const { products, stockRecords, inventory } = setup();
    const p = await products.create({ title: "可乐", purchase_price: cents(300) });
    const day = (d: number, h = 12) => new Date(2026, 6, d, h, 0, 0, 0).getTime();
    const from = new Date(2026, 6, 5, 0, 0, 0, 0).getTime();

    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: day(3),
      items: [{ product_id: p.id, qty: 10 }],
    });
    await stockRecords.create({
      staff_id: "member",
      direction: "out",
      timestamp: day(4),
      items: [{ product_id: p.id, qty: 2 }],
    });
    // On the boundary day — excluded from as-of(from).
    await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: from,
      items: [{ product_id: p.id, qty: 5 }],
    });
    const voided = await stockRecords.create({
      staff_id: ADMIN_STAFF_ID,
      direction: "in",
      timestamp: day(2),
      items: [{ product_id: p.id, qty: 100 }],
    });
    await stockRecords.void(voided.record.id);

    await products.update(p.id, { purchase_price: cents(400) });

    const asOf = (await inventory.shopAggregateAsOf(from)).find(
      (a) => a.product.id === p.id,
    )!;
    expect(asOf.total_qty).toBe(8); // 10 − 2; voided + boundary excluded
    expect(asOf.total_cost).toBe(400 * 8);

    const now = (await inventory.shopAggregate()).find((a) => a.product.id === p.id)!;
    expect(now.total_qty).toBe(13); // +5 on boundary
  });

  test("empty ledger before cutoff returns []", async () => {
    const { inventory } = setup();
    const from = new Date(2026, 6, 5, 0, 0, 0, 0).getTime();
    expect(await inventory.shopAggregateAsOf(from)).toEqual([]);
  });
});
