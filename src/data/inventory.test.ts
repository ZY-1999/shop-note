import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { StaffRepository } from "@/data/staff";
import { StockRecordRepository } from "@/data/stock-record";
import { Inventory } from "@/data/inventory";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit);
  const inventory = new Inventory(stockRecords, products);
  return { storage, audit, products, staff, stockRecords, inventory };
}

describe("Inventory — balance", () => {
  test("balance = in qty − out qty for a (staff, product)", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({
      staff_id: staffS.id,
      direction: "in",
      items: [{ product_id: productP.id, qty: 10 }],
    });
    await stockRecords.create({
      staff_id: staffS.id,
      direction: "out",
      items: [{ product_id: productP.id, qty: 3 }],
    });

    const bal = await inventory.balance(staffS.id, productP.id);
    expect(bal.qty).toBe(7);
    expect(bal.cost_amount).toBe(1995 * 7); // current price × balance
  });
});

describe("Inventory — void/edit propagation", () => {
  test("voiding an 'out' record immediately reflects in balance (no recompute call)", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({ staff_id: staffS.id, direction: "in", items: [{ product_id: productP.id, qty: 10 }] });
    const out = await stockRecords.create({ staff_id: staffS.id, direction: "out", items: [{ product_id: productP.id, qty: 3 }] });

    expect((await inventory.balance(staffS.id, productP.id)).qty).toBe(7);

    await stockRecords.void(out.record.id);

    expect((await inventory.balance(staffS.id, productP.id)).qty).toBe(10); // out voided → back to 10
  });

  test("editing an 'out' record's qty propagates to balance (no drift)", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({ staff_id: staffS.id, direction: "in", items: [{ product_id: productP.id, qty: 10 }] });
    const out = await stockRecords.create({ staff_id: staffS.id, direction: "out", items: [{ product_id: productP.id, qty: 3 }] });

    expect((await inventory.balance(staffS.id, productP.id)).qty).toBe(7);

    // edit out qty 3→5
    await stockRecords.update(out.record.id, {
      items: [{ id: out.items[0].id, product_id: productP.id, qty: 5 }],
    });

    expect((await inventory.balance(staffS.id, productP.id)).qty).toBe(5); // 10 − 5
  });
});

describe("Inventory — cost revaluation", () => {
  test("cost_amount reflects the product's current price with no record change", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({ staff_id: staffS.id, direction: "in", items: [{ product_id: productP.id, qty: 10 }] });

    expect((await inventory.balance(staffS.id, productP.id)).cost_amount).toBe(1995 * 10);

    await products.update(productP.id, { purchase_price: cents(2495) });

    expect((await inventory.balance(staffS.id, productP.id)).cost_amount).toBe(2495 * 10);
  });
});

describe("Inventory — negative inventory", () => {
  test("a staff with only an 'out' has negative balance, returned without error", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    await stockRecords.create({ staff_id: staffS.id, direction: "out", items: [{ product_id: productP.id, qty: 5 }] });

    const bal = await inventory.balance(staffS.id, productP.id);
    expect(bal.qty).toBe(-5);
    expect(bal.cost_amount).toBe(-5 * 1995);

    const inv = await inventory.staffInventory(staffS.id);
    const entry = inv.find((b) => b.product.id === productP.id)!;
    expect(entry.qty).toBe(-5);
    expect(entry.cost_amount).toBe(-5 * 1995);
  });
});

describe("Inventory — shop aggregate", () => {
  test("shopAggregate sums balances across staff", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const s1 = await staff.create({ name: "张三", phone: "1", notes: "" });
    const s2 = await staff.create({ name: "李四", phone: "2", notes: "" });

    // s1: in 10, out 3 → 7
    await stockRecords.create({ staff_id: s1.id, direction: "in", items: [{ product_id: productP.id, qty: 10 }] });
    await stockRecords.create({ staff_id: s1.id, direction: "out", items: [{ product_id: productP.id, qty: 3 }] });
    // s2: out 3 → -3
    await stockRecords.create({ staff_id: s2.id, direction: "out", items: [{ product_id: productP.id, qty: 3 }] });

    const agg = await inventory.shopAggregate();
    const productAgg = agg.find((a) => a.product.id === productP.id)!;
    expect(productAgg.total_qty).toBe(4); // 7 + (-3)
    expect(productAgg.total_cost).toBe(4 * 1995);
  });
});

describe("Inventory — no-drift", () => {
  test("every read recomputes from the ledger; Inventory exposes no write surface", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });
    await stockRecords.create({ staff_id: staffS.id, direction: "in", items: [{ product_id: productP.id, qty: 10 }] });

    // Two independent reads return equal results — no cached figure to diverge.
    expect(await inventory.balance(staffS.id, productP.id)).toEqual(await inventory.balance(staffS.id, productP.id));

    // Compile-time: the projection is read-only — no save/persist/cache exists.
    // @ts-expect-error — no saveBalance
    void inventory.saveBalance;
    // @ts-expect-error — no persist
    void inventory.persist;
  });
});

describe("Inventory — voided record/product handling", () => {
  test("voided records excluded; voided products still resolve for historical balances", async () => {
    const { products, staff, stockRecords, inventory } = setup();
    const productP = await products.create({ title: "可乐", purchase_price: cents(1995) });
    const staffS = await staff.create({ name: "张三", phone: "138", notes: "" });

    const inn = await stockRecords.create({ staff_id: staffS.id, direction: "in", items: [{ product_id: productP.id, qty: 10 }] });
    await stockRecords.create({ staff_id: staffS.id, direction: "out", items: [{ product_id: productP.id, qty: 3 }] });

    // void the 'in' record → balance becomes -3 (only the out remains)
    await stockRecords.void(inn.record.id);
    expect((await inventory.balance(staffS.id, productP.id)).qty).toBe(-3);

    // void the product → historical balance still resolves with its price
    await products.void(productP.id);
    const bal = await inventory.balance(staffS.id, productP.id);
    expect(bal.qty).toBe(-3);
    expect(bal.cost_amount).toBe(-3 * 1995); // product still resolves
  });
});
