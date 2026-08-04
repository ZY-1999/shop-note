import { describe, expect, jest, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import {
  StaffRepository,
  STAFF_LEVELS,
  labelForLevel,
  levelRank,
  DEFAULT_STAFF_LEVEL,
  ADMIN_STAFF_ID,
} from "@/data/staff";

function setup() {
  const storage = new InMemoryAdapter();
  const staffRepo = new StaffRepository(storage, new AuditProvider(storage));
  return { storage, staffRepo };
}

/** Seed the protected '-1' admin row directly (mirrors the v3 migration seed). */
async function seedAdmin(storage: InMemoryAdapter) {
  await storage.insert("staff", {
    id: ADMIN_STAFF_ID,
    name: "管理员",
    phone: "",
    notes: "",
    level: "normal",
    voided_at: null,
    created_at: 0,
    updated_at: 0,
  });
}

describe("StaffRepository — create/read", () => {
  test("create stores a staff; getById returns the full record; list includes it", async () => {
    const { staffRepo } = setup();

    const created = await staffRepo.create({ name: "张三", phone: "13800000000", notes: "店长" });

    expect(created.id).toBeTruthy();
    expect(created).toMatchObject({ name: "张三", phone: "13800000000", notes: "店长", voided_at: null });
    expect(created.created_at).toBe(created.updated_at);

    const got = await staffRepo.getById(created.id);
    expect(got).toEqual(created);

    const list = await staffRepo.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
  });

  test("create writes one 'create' audit entry (actor=owner) for the new staff", async () => {
    const { storage, staffRepo } = setup();

    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "" });

    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "staff" });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      action: "create",
      entity_id: created.id,
      actor: "owner",
    });
  });
});

describe("StaffRepository — void/restore", () => {
  test("void hides staff from listActive; getById still returns it with voided_at set", async () => {
    const { staffRepo } = setup();
    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "" });

    const voided = await staffRepo.void(created.id);

    expect(voided.voided_at).not.toBeNull();
    const active = await staffRepo.listActive();
    expect(active.find((s) => s.id === created.id)).toBeUndefined();
    const got = await staffRepo.getById(created.id);
    expect(got?.voided_at).not.toBeNull(); // history preserved, not erased
  });

  test("restore re-includes staff in listActive and clears voided_at", async () => {
    const { staffRepo } = setup();
    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "" });
    await staffRepo.void(created.id);

    const restored = await staffRepo.restore(created.id);

    expect(restored.voided_at).toBeNull();
    const active = await staffRepo.listActive();
    expect(active.find((s) => s.id === created.id)).toBeDefined();
  });
});

describe("StaffRepository — search", () => {
  test("search({text}) matches active staff by name/phone substring; excludes voided", async () => {
    const { staffRepo } = setup();
    await staffRepo.create({ name: "张三", phone: "13800000001", notes: "" });
    await staffRepo.create({ name: "张四", phone: "13900000002", notes: "" });
    await staffRepo.create({ name: "李四", phone: "13700000003", notes: "" });
    const voidedStaff = await staffRepo.create({ name: "张五", phone: "13600000004", notes: "" });
    await staffRepo.void(voidedStaff.id);

    const byName = await staffRepo.search({ text: "张" });
    expect(byName.map((s) => s.name).sort()).toEqual(["张三", "张四"]);

    const byPhone = await staffRepo.search({ text: "139" });
    expect(byPhone.map((s) => s.name)).toEqual(["张四"]);

    expect(byName.find((s) => s.id === voidedStaff.id)).toBeUndefined();
  });

  test("search({text, includeVoided:true}) matches voided staff by name/phone; default still excludes", async () => {
    const { staffRepo } = setup();
    await staffRepo.create({ name: "张三", phone: "13800000001", notes: "" });
    const voidedStaff = await staffRepo.create({ name: "张五", phone: "13600000004", notes: "" });
    await staffRepo.void(voidedStaff.id);

    expect((await staffRepo.search({ text: "张" })).map((s) => s.name)).toEqual(["张三"]);

    const withVoided = await staffRepo.search({ text: "张", includeVoided: true });
    expect(withVoided.map((s) => s.name).sort()).toEqual(["张三", "张五"]);
    expect(withVoided.find((s) => s.id === voidedStaff.id)?.voided_at).not.toBeNull();
  });
});

describe("StaffRepository — update + audit", () => {
  test("update applies the patch; re-read shows new values; audit diff shows exactly the changed fields", async () => {
    const { storage, staffRepo } = setup();
    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "old" });

    const updated = await staffRepo.update(created.id, { phone: "139", notes: "new" });

    expect(updated.phone).toBe("139");
    expect(updated.notes).toBe("new");
    expect(updated.name).toBe("张三"); // unchanged
    expect(updated.updated_at).toBeGreaterThanOrEqual(created.updated_at);

    const reRead = await staffRepo.getById(created.id);
    expect(reRead?.phone).toBe("139");
    expect(reRead?.notes).toBe("new");

    const updates = await new AuditProvider(storage).queryTimeline({ entity_type: "staff", action: "update" });
    expect(updates).toHaveLength(1);
    expect(updates[0].diff).toEqual([
      { field: "phone", old: "138", new: "139" },
      { field: "notes", old: "old", new: "new" },
    ]);
  });
});

describe("StaffRepository — audit coverage", () => {
  test("create/update/void/restore each produce exactly one audit entry, correct action, actor=owner", async () => {
    const { storage, staffRepo } = setup();
    const audit = new AuditProvider(storage);

    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "x" });
    await staffRepo.update(created.id, { phone: "139" });
    await staffRepo.void(created.id);
    await staffRepo.restore(created.id);

    const timeline = await audit.queryTimeline({ entity_type: "staff" });
    expect(timeline.map((e) => e.action)).toEqual(["create", "update", "void", "restore"]);
    expect(timeline.every((e) => e.actor === "owner")).toBe(true);
    expect(timeline.every((e) => e.entity_id === created.id)).toBe(true);
  });

  test("a voided staff is still reachable by id (no hard delete)", async () => {
    const { staffRepo } = setup();
    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "" });
    await staffRepo.void(created.id);

    const got = await staffRepo.getById(created.id);
    expect(got).not.toBeNull();
    expect(got?.voided_at).not.toBeNull();

    const all = await staffRepo.list({ includeVoided: true });
    expect(all.find((s) => s.id === created.id)).toBeDefined();
  });
});

describe("StaffRepository — admin '-1' protection (stock-balance-refactor)", () => {
  test("list / listActive / search({}) / list({includeVoided:true}) all exclude '-1'", async () => {
    const { storage, staffRepo } = setup();
    await seedAdmin(storage);
    await staffRepo.create({ name: "张三", phone: "138", notes: "" });

    expect((await staffRepo.list()).map((s) => s.id)).not.toContain(ADMIN_STAFF_ID);
    expect((await staffRepo.listActive()).map((s) => s.id)).not.toContain(ADMIN_STAFF_ID);
    expect((await staffRepo.search({})).map((s) => s.id)).not.toContain(ADMIN_STAFF_ID);
    // includeVoided still hides '-1' — it is never a manageable member.
    expect((await staffRepo.list({ includeVoided: true })).map((s) => s.id)).not.toContain(
      ADMIN_STAFF_ID,
    );
    expect(
      (await staffRepo.search({ includeVoided: true })).map((s) => s.id),
    ).not.toContain(ADMIN_STAFF_ID);
    expect(
      (await staffRepo.search({ text: "管理", includeVoided: true })).map((s) => s.id),
    ).not.toContain(ADMIN_STAFF_ID);
    // The real member is still there.
    expect((await staffRepo.list()).map((s) => s.name)).toEqual(["张三"]);
  });

  test("getById('-1') still returns the admin row (record detail shows the name)", async () => {
    const { storage, staffRepo } = setup();
    await seedAdmin(storage);
    const got = await staffRepo.getById(ADMIN_STAFF_ID);
    expect(got).not.toBeNull();
    expect(got?.name).toBe("管理员");
  });

  test("void('-1') throws — the admin row is protected from soft-delete", async () => {
    const { storage, staffRepo } = setup();
    await seedAdmin(storage);
    await expect(staffRepo.void(ADMIN_STAFF_ID)).rejects.toThrow(/-1|admin|管理员/i);
    // Row is untouched (still present, still active).
    expect(await staffRepo.getById(ADMIN_STAFF_ID)).not.toBeNull();
  });

  test("'-1' never appears even alongside voided real members", async () => {
    const { storage, staffRepo } = setup();
    await seedAdmin(storage);
    const a = await staffRepo.create({ name: "张三", phone: "", notes: "" });
    await staffRepo.void(a.id);
    const all = await staffRepo.list({ includeVoided: true });
    // 张三 (voided) shows with includeVoided; '-1' never does.
    expect(all.map((s) => s.id).sort()).toEqual([a.id].sort());
    expect(all.map((s) => s.id)).not.toContain(ADMIN_STAFF_ID);
  });
});

describe("StaffLevel registry — single source for labels + sort rank", () => {
  test("labelForLevel maps codes to display labels; gold ranks above normal", async () => {
    expect(labelForLevel("gold")).toBe("星站");
    expect(labelForLevel("normal")).toBe("普站");
    expect(levelRank("gold")).toBeGreaterThan(levelRank("normal"));
    expect(DEFAULT_STAFF_LEVEL).toBe("normal");
    expect(STAFF_LEVELS.map((l) => l.code).sort()).toEqual(["gold", "normal"]);
  });
});

describe("StaffRepository — level", () => {
  test("create defaults level to 'normal' (普站)", async () => {
    const { staffRepo } = setup();
    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "" });
    expect(created.level).toBe("normal");
    const got = await staffRepo.getById(created.id);
    expect(got?.level).toBe("normal");
  });

  test("create accepts an explicit level", async () => {
    const { staffRepo } = setup();
    const created = await staffRepo.create({
      name: "李四",
      phone: "139",
      notes: "",
      level: "gold",
    });
    expect(created.level).toBe("gold");
    expect(labelForLevel(created.level)).toBe("星站");
  });

  test("create audit captures level in the diff (auditable covers level)", async () => {
    const { storage, staffRepo } = setup();
    await staffRepo.create({ name: "张三", phone: "138", notes: "", level: "gold" });

    const created = await new AuditProvider(storage).queryTimeline({
      entity_type: "staff",
      action: "create",
    });
    expect(created).toHaveLength(1);
    expect(created[0].diff).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "level", new: "gold" })]),
    );
  });

  test("update can change level; audit diff shows exactly the level change", async () => {
    const { storage, staffRepo } = setup();
    const created = await staffRepo.create({ name: "张三", phone: "138", notes: "" });

    const updated = await staffRepo.update(created.id, { level: "gold" });
    expect(updated.level).toBe("gold");
    expect((await staffRepo.getById(created.id))?.level).toBe("gold");

    const updates = await new AuditProvider(storage).queryTimeline({
      entity_type: "staff",
      action: "update",
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].diff).toContainEqual({ field: "level", old: "normal", new: "gold" });
  });

  test("list/listActive/search order gold members first, then by created_at asc", async () => {
    // Distinct created_at (fake timers) so the secondary created_at-asc key is
    // actually exercised, not just stable-sort ties.
    jest.useFakeTimers();
    const { staffRepo } = setup();
    jest.setSystemTime(new Date("2026-07-10T01:00:00Z"));
    const a = await staffRepo.create({ name: "A-normal", phone: "", notes: "" });
    jest.setSystemTime(new Date("2026-07-10T02:00:00Z"));
    const b = await staffRepo.create({ name: "B-gold", phone: "", notes: "", level: "gold" });
    jest.setSystemTime(new Date("2026-07-10T03:00:00Z"));
    const c = await staffRepo.create({ name: "C-normal", phone: "", notes: "" });
    jest.setSystemTime(new Date("2026-07-10T04:00:00Z"));
    const d = await staffRepo.create({ name: "D-gold", phone: "", notes: "", level: "gold" });
    jest.useRealTimers();

    // gold (B, D) before normal (A, C); within a tier, created_at asc.
    const expected = [b.id, d.id, a.id, c.id];
    expect((await staffRepo.list()).map((s) => s.id)).toEqual(expected);
    expect((await staffRepo.listActive()).map((s) => s.id)).toEqual(expected);
    expect((await staffRepo.search({ text: "gold" })).map((s) => s.id)).toEqual([b.id, d.id]);
    expect((await staffRepo.search({ text: "normal" })).map((s) => s.id)).toEqual([a.id, c.id]);
  });
});
