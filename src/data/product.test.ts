import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ProductRepository } from "@/data/product";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const productRepo = new ProductRepository(storage, new AuditProvider(storage));
  return { storage, productRepo };
}

describe("ProductRepository — create/read + money invariant", () => {
  test("create stores a product with purchase_price in cents; getById returns it", async () => {
    const { productRepo } = setup();

    const created = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });

    expect(created.id).toBeTruthy();
    expect(created).toMatchObject({
      title: "可乐",
      purchase_price: 1995,
      code: null,
      category: null,
      voided_at: null,
    });
    expect(created.created_at).toBe(created.updated_at);

    const got = await productRepo.getById(created.id);
    expect(got).toEqual(created);

    const list = await productRepo.list();
    expect(list).toHaveLength(1);
  });

  test("floating-point money cannot reach the repo (cents() rejects at construction)", () => {
    // The only way to mint a Cents is cents(), which rejects floats — so a float
    // price is stopped at the boundary, before create() is ever called.
    expect(() => cents(19.95)).toThrow(RangeError);
    expect(() => cents(1995)).not.toThrow();
  });

  test("a raw number is not assignable to purchase_price (compile-time Cents brand)", () => {
    const { productRepo } = setup();
    // @ts-expect-error — raw number lacks the Cents brand; only cents() mints it
    void productRepo.create({ title: "x", purchase_price: 1995 });
  });

  test("create writes one 'create' audit entry for the new product", async () => {
    const { storage, productRepo } = setup();

    const created = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });

    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "product" });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ action: "create", entity_id: created.id, actor: "owner" });
  });
});

describe("ProductRepository — search", () => {
  test("title substring matches across ~1000 products; exact code and category filter", async () => {
    const { storage, productRepo } = setup();
    // Seed 1000 products directly via storage — seeding is fixture, not the behavior under test.
    for (let i = 0; i < 1000; i++) {
      await storage.insert("product", {
        id: `seed-${i}`,
        title: `商品${i}`,
        purchase_price: 100,
        code: `C${i}`,
        category: i % 2 === 0 ? "饮料" : "零食",
        voided_at: null,
        created_at: i,
        updated_at: i,
      });
    }
    await productRepo.create({ title: "可乐", purchase_price: cents(1995), code: "COLA", category: "饮料" });
    await productRepo.create({ title: "可口可乐", purchase_price: cents(2500), code: "COKC", category: "饮料" });

    const byText = await productRepo.search({ text: "可" });
    expect(byText.map((p) => p.title).sort()).toEqual(["可乐", "可口可乐"]);

    const byCode = await productRepo.search({ code: "COLA" });
    expect(byCode.map((p) => p.title)).toEqual(["可乐"]);

    const drinks = await productRepo.search({ category: "饮料" });
    expect(drinks).toHaveLength(502); // 500 seeded (even i) + 2 created
  });

  test("search excludes voided products", async () => {
    const { productRepo } = setup();
    const a = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });
    await productRepo.create({ title: "可口可乐", purchase_price: cents(2500) });
    await productRepo.void(a.id);

    const byText = await productRepo.search({ text: "可" });
    expect(byText.map((p) => p.title)).toEqual(["可口可乐"]);
  });

  test("search({text, includeVoided:true}) matches voided products; default still excludes", async () => {
    const { productRepo } = setup();
    const a = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });
    await productRepo.create({ title: "可口可乐", purchase_price: cents(2500) });
    await productRepo.void(a.id);

    expect((await productRepo.search({ text: "可" })).map((p) => p.title)).toEqual(["可口可乐"]);

    const withVoided = await productRepo.search({ text: "可", includeVoided: true });
    expect(withVoided.map((p) => p.title).sort()).toEqual(["可乐", "可口可乐"]);
    expect(withVoided.find((p) => p.id === a.id)?.voided_at).not.toBeNull();
  });
});

describe("ProductRepository — void/restore", () => {
  test("void excludes from list/search defaults; restore brings it back", async () => {
    const { productRepo } = setup();
    const created = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });

    const voided = await productRepo.void(created.id);
    expect(voided.voided_at).not.toBeNull();

    expect((await productRepo.list()).find((p) => p.id === created.id)).toBeUndefined();
    expect((await productRepo.search({ text: "可" })).find((p) => p.id === created.id)).toBeUndefined();

    const restored = await productRepo.restore(created.id);
    expect(restored.voided_at).toBeNull();
    expect((await productRepo.list()).find((p) => p.id === created.id)).toBeDefined();
  });
});

describe("ProductRepository — update + audit", () => {
  test("update purchase_price; re-read confirms new price; audit diff shows price old→new", async () => {
    const { storage, productRepo } = setup();
    const created = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });

    const updated = await productRepo.update(created.id, { purchase_price: cents(2495) });

    expect(updated.purchase_price).toBe(2495);
    const reRead = await productRepo.getById(created.id);
    expect(reRead?.purchase_price).toBe(2495);

    const updates = await new AuditProvider(storage).queryTimeline({ entity_type: "product", action: "update" });
    expect(updates).toHaveLength(1);
    expect(updates[0].diff).toEqual([{ field: "purchase_price", old: 1995, new: 2495 }]);
  });
});

describe("ProductRepository — audit coverage + FK integrity", () => {
  test("create/update/void/restore each produce exactly one audit entry, correct action", async () => {
    const { storage, productRepo } = setup();
    const audit = new AuditProvider(storage);

    const created = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });
    await productRepo.update(created.id, { purchase_price: cents(2495) });
    await productRepo.void(created.id);
    await productRepo.restore(created.id);

    const timeline = await audit.queryTimeline({ entity_type: "product" });
    expect(timeline.map((e) => e.action)).toEqual(["create", "update", "void", "restore"]);
    expect(timeline.every((e) => e.actor === "owner")).toBe(true);
  });

  test("a voided product is still reachable by id with purchase_price readable", async () => {
    const { productRepo } = setup();
    const created = await productRepo.create({ title: "可乐", purchase_price: cents(1995) });
    await productRepo.void(created.id);

    const got = await productRepo.getById(created.id);
    expect(got).not.toBeNull();
    expect(got?.purchase_price).toBe(1995); // FK integrity for #05 snapshots / #07 cost revaluation
  });
});
