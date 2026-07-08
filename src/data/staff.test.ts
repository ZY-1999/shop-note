import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { StaffRepository } from "@/data/staff";

function setup() {
  const storage = new InMemoryAdapter();
  const staffRepo = new StaffRepository(storage, new AuditProvider(storage));
  return { storage, staffRepo };
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
