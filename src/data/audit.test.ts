import { describe, expect, jest, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";

describe("AuditProvider — logEvent diff", () => {
  test("captures only changed fields as {field, old, new}", async () => {
    const audit = new AuditProvider(new InMemoryAdapter());

    const entry = await audit.logEvent({
      action: "update",
      entity_type: "staff",
      entity_id: "s1",
      before: { name: "Alice", phone: "111" },
      after: { name: "Bob", phone: "111" },
    });

    expect(entry.diff).toEqual([{ field: "name", old: "Alice", new: "Bob" }]);
  });

  test("a multi-field change produces ordered diff entries (preserves field order)", async () => {
    const audit = new AuditProvider(new InMemoryAdapter());

    const entry = await audit.logEvent({
      action: "update",
      entity_type: "staff",
      entity_id: "s1",
      before: { name: "Alice", phone: "111" },
      after: { name: "Bob", phone: "222" },
    });

    expect(entry.diff).toEqual([
      { field: "name", old: "Alice", new: "Bob" },
      { field: "phone", old: "111", new: "222" },
    ]);
  });
});

describe("AuditProvider — actor/time invariants", () => {
  test("actor defaults to 'owner' and timestamp is real now", async () => {
    const fixed = Date.parse("2026-01-01T00:00:00Z");
    jest.useFakeTimers();
    jest.setSystemTime(fixed);
    try {
      const audit = new AuditProvider(new InMemoryAdapter());

      const entry = await audit.logEvent({
        action: "create",
        entity_type: "widget",
        entity_id: "w1",
        after: { name: "thing" },
      });

      expect(entry.actor).toBe("owner");
      expect(entry.timestamp).toBe(fixed);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("AuditProvider — queryTimeline", () => {
  test("filters by entity_type and action; returns chronological order", async () => {
    const audit = new AuditProvider(new InMemoryAdapter());

    const t1 = Date.parse("2026-01-01T00:00:00Z");
    const t2 = Date.parse("2026-01-02T00:00:00Z");
    const t3 = Date.parse("2026-01-03T00:00:00Z");

    jest.useFakeTimers();
    try {
      jest.setSystemTime(t1);
      await audit.logEvent({ action: "create", entity_type: "staff", entity_id: "s1", after: { name: "A" } });
      jest.setSystemTime(t2);
      await audit.logEvent({ action: "update", entity_type: "staff", entity_id: "s1", before: { name: "A" }, after: { name: "B" } });
      jest.setSystemTime(t3);
      await audit.logEvent({ action: "create", entity_type: "product", entity_id: "p1", after: { name: "Widget" } });
    } finally {
      jest.useRealTimers();
    }

    const staffEvents = await audit.queryTimeline({ entity_type: "staff" });
    expect(staffEvents.map((e) => e.entity_id)).toEqual(["s1", "s1"]);
    expect(staffEvents.map((e) => e.timestamp)).toEqual([t1, t2]); // chronological, earliest first

    const creates = await audit.queryTimeline({ action: "create" });
    expect(creates).toHaveLength(2);
  });

  test("filters by date_range (inclusive on both ends)", async () => {
    const audit = new AuditProvider(new InMemoryAdapter());

    const t1 = Date.parse("2026-01-01T00:00:00Z");
    const t2 = Date.parse("2026-01-02T00:00:00Z");
    const t3 = Date.parse("2026-01-03T00:00:00Z");

    jest.useFakeTimers();
    try {
      jest.setSystemTime(t1);
      await audit.logEvent({ action: "create", entity_type: "staff", entity_id: "s1", after: {} });
      jest.setSystemTime(t2);
      await audit.logEvent({ action: "update", entity_type: "staff", entity_id: "s1", before: {}, after: {} });
      jest.setSystemTime(t3);
      await audit.logEvent({ action: "void", entity_type: "staff", entity_id: "s1", before: {} });
    } finally {
      jest.useRealTimers();
    }

    const window = await audit.queryTimeline({ date_range: { from: t2, to: t3 } });
    expect(window.map((e) => e.action)).toEqual(["update", "void"]);
  });
});

describe("AuditProvider — immutability", () => {
  test("the public surface exposes only logEvent + queryTimeline (no mutation API)", () => {
    const audit = new AuditProvider(new InMemoryAdapter());

    // Compile-time proof (verified by `tsc --noEmit`): each access below is a
    // type error because the method does not exist on AuditProvider. If someone
    // later adds one, its @ts-expect-error becomes unused and tsc fails — the
    // immutability invariant is enforced by the absence of the surface.
    // @ts-expect-error — no updateEntry on audit entries
    void audit.updateEntry;
    // @ts-expect-error — no deleteEntry
    void audit.deleteEntry;
    // @ts-expect-error — no restoreEntry
    void audit.restoreEntry;
    // @ts-expect-error — no voidEntry
    void audit.voidEntry;

    expect(typeof audit.logEvent).toBe("function");
    expect(typeof audit.queryTimeline).toBe("function");
  });
});
