import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { TopupRepository } from "@/data/topup";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const topups = new TopupRepository(storage, audit);
  return { storage, audit, topups };
}

describe("TopupRepository — create + audit", () => {
  test("create stores the top-up and writes one 'create' audit entry", async () => {
    const { storage, topups } = setup();
    const created = await topups.create({ staff_id: "s1", amount: cents(10000), note: "首充" }); // ¥100.00

    expect(created.id).toBeTruthy();
    expect(created).toMatchObject({ staff_id: "s1", amount: 10000, note: "首充", voided_at: null });
    expect(created.created_at).toBe(created.updated_at);

    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "topup" });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ action: "create", entity_id: created.id, actor: "owner" });
  });
});

describe("TopupRepository — list + getById", () => {
  test("list returns unvoided top-ups, newest timestamp first; staff_id filter narrows", async () => {
    const { topups } = setup();
    await topups.create({ staff_id: "s1", amount: cents(10000), timestamp: 100 }); // ¥100
    await topups.create({ staff_id: "s2", amount: cents(20000), timestamp: 200 }); // ¥200
    const voided = await topups.create({ staff_id: "s1", amount: cents(5000), timestamp: 300 });
    await topups.void(voided.id);

    const all = await topups.list();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.timestamp)).toEqual([200, 100]); // desc

    const s1 = await topups.list({ staff_id: "s1" });
    expect(s1.map((t) => t.amount)).toEqual([cents(10000)]); // voided ¥50 excluded
  });

  test("getById returns a top-up even after it is voided", async () => {
    const { topups } = setup();
    const created = await topups.create({ staff_id: "s1", amount: cents(10000) });
    await topups.void(created.id);
    const got = await topups.getById(created.id);
    expect(got).not.toBeNull();
    expect(got?.voided_at).not.toBeNull();
  });

  test("filters by date_range (inclusive on both ends)", async () => {
    const { topups } = setup();
    const t1 = new Date(2026, 5, 1, 10, 0).getTime();
    const t2 = new Date(2026, 5, 5, 10, 0).getTime();
    const t3 = new Date(2026, 5, 10, 10, 0).getTime();
    await topups.create({ staff_id: "s1", amount: cents(1000), timestamp: t1 });
    await topups.create({ staff_id: "s1", amount: cents(2000), timestamp: t2 });
    await topups.create({ staff_id: "s1", amount: cents(3000), timestamp: t3 });

    const window = await topups.list({ date_range: { from: t2, to: t3 } });
    expect(window.map((t) => t.timestamp)).toEqual([t3, t2]);
  });
});

describe("TopupRepository — void + audit", () => {
  test("void sets voided_at and writes a 'void' audit entry; data preserved", async () => {
    const { storage, topups } = setup();
    const created = await topups.create({ staff_id: "s1", amount: cents(10000) });

    const voided = await topups.void(created.id);
    expect(voided.voided_at).not.toBeNull();

    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "topup" });
    expect(timeline.map((e) => e.action)).toEqual(["create", "void"]);
    // soft-deleted, never hard-removed
    expect(await topups.getById(created.id)).not.toBeNull();
  });

  test("void throws if the top-up does not exist", async () => {
    const { topups } = setup();
    await expect(topups.void("nope")).rejects.toThrow(/topup .* not found/);
  });
});
