import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { id, now } from "@/data/primitives";

describe("InMemoryAdapter (port contract)", () => {
  test("insert then findById returns the stored row", async () => {
    const adapter = new InMemoryAdapter();
    const row = { id: id(), name: "widget", qty: 3 };

    await adapter.insert("widgets", row);

    const got = await adapter.findById<typeof row>("widgets", row.id);
    expect(got).toEqual(row);
  });

  test("update patches a row in place and returns it", async () => {
    const adapter = new InMemoryAdapter();
    const row = { id: id(), name: "widget", qty: 3 };
    await adapter.insert("widgets", row);

    const updated = await adapter.update<typeof row>("widgets", row.id, { qty: 5 });

    expect(updated).toEqual({ ...row, qty: 5 });
    expect(await adapter.findById<typeof row>("widgets", row.id)).toEqual({ ...row, qty: 5 });
  });

  test("find returns rows matching a where filter", async () => {
    const adapter = new InMemoryAdapter();
    type W = { id: string; name: string; kind: string };
    await adapter.insert<W>("widgets", { id: id(), name: "a", kind: "x" });
    await adapter.insert<W>("widgets", { id: id(), name: "b", kind: "x" });
    await adapter.insert<W>("widgets", { id: id(), name: "c", kind: "y" });

    const xs = await adapter.find<W>("widgets", { where: { kind: "x" } });

    expect(xs.map((w) => w.name).sort()).toEqual(["a", "b"]);
  });

  test("find with no filter returns all rows", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.insert("widgets", { id: id(), name: "a" });
    await adapter.insert("widgets", { id: id(), name: "b" });

    const all = await adapter.find<{ id: string; name: string }>("widgets");

    expect(all).toHaveLength(2);
  });

  test("withTransaction commits writes when the body resolves", async () => {
    const adapter = new InMemoryAdapter();
    await adapter.withTransaction(async () => {
      await adapter.insert("widgets", { id: "w1", name: "a" });
    });
    expect(await adapter.findById("widgets", "w1")).not.toBeNull();
  });

  test("withTransaction rolls back writes when the body throws", async () => {
    const adapter = new InMemoryAdapter();

    await expect(
      adapter.withTransaction(async () => {
        await adapter.insert("widgets", { id: "w1", name: "a" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await adapter.findById("widgets", "w1")).toBeNull();
  });

  test("round-trip: create → getById → update → list → void → getById", async () => {
    type W = { id: string; name: string; qty: number; voided_at: number | null };
    const adapter = new InMemoryAdapter();

    const created = await adapter.insert<W>("widgets", {
      id: id(),
      name: "widget",
      qty: 3,
      voided_at: null,
    });
    expect(await adapter.findById<W>("widgets", created.id)).toEqual(created);

    const updated = await adapter.update<W>("widgets", created.id, { qty: 5 });
    expect(updated?.qty).toBe(5);

    expect(await adapter.find<W>("widgets")).toHaveLength(1);

    // void = soft-delete via voided_at; nothing in the port hard-deletes.
    const voided = await adapter.update<W>("widgets", created.id, { voided_at: now() });
    expect(voided?.voided_at).not.toBeNull();

    // getById still returns the voided row (history preserved).
    const after = await adapter.findById<W>("widgets", created.id);
    expect(after?.voided_at).not.toBeNull();
  });

  test("find supports orderBy and limit", async () => {
    type W = { id: string; n: number };
    const adapter = new InMemoryAdapter();
    for (const n of [3, 1, 2]) await adapter.insert<W>("widgets", { id: id(), n });

    const asc = await adapter.find<W>("widgets", { orderBy: { field: "n" } });
    expect(asc.map((w) => w.n)).toEqual([1, 2, 3]);

    const top1 = await adapter.find<W>("widgets", {
      orderBy: { field: "n", dir: "desc" },
      limit: 1,
    });
    expect(top1.map((w) => w.n)).toEqual([3]);
  });
});
