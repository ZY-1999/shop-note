import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { AuditProvider } from "@/data/audit";
import { ConfigRepository, UNIT_PRICE_KEY } from "@/data/config";
import { cents } from "@/data/primitives";

function setup() {
  const storage = new InMemoryAdapter();
  const audit = new AuditProvider(storage);
  const config = new ConfigRepository(storage, audit);
  return { storage, audit, config };
}

describe("ConfigRepository — unit price", () => {
  test("cold start: getUnitPrice returns 0 (key absent), no throw", async () => {
    const { config } = setup();
    expect(await config.getUnitPrice()).toBe(cents(0));
  });

  test("setUnitPrice then getUnitPrice round-trips the value", async () => {
    const { config } = setup();
    await config.setUnitPrice(cents(2400)); // ¥24.00
    expect(await config.getUnitPrice()).toBe(cents(2400));
  });

  test("setUnitPrice twice upserts (no duplicate row) + audits each change", async () => {
    const { storage, config } = setup();
    await config.setUnitPrice(cents(2400));
    await config.setUnitPrice(cents(3000));

    expect(await config.getUnitPrice()).toBe(cents(3000));
    const timeline = await new AuditProvider(storage).queryTimeline({ entity_type: "config" });
    // first set = create, second = update
    expect(timeline.map((e) => e.action)).toEqual(["create", "update"]);
    expect(timeline.every((e) => e.entity_id === UNIT_PRICE_KEY)).toBe(true);
    const update = timeline.find((e) => e.action === "update")!;
    expect(update.diff).toContainEqual({ field: "value", old: 2400, new: 3000 });
  });
});
