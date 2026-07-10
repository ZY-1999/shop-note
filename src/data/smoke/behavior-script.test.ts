import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { behaviorScript } from "@/data/smoke/behavior-script";
import { setupRepos } from "@/data/composition";
import { ADMIN_STAFF_ID } from "@/data/staff";

/**
 * The behavior script's *InMemory* half. Jest can reach this half because
 * `behavior-script.ts` imports no `expo-sqlite`; the *Expo* half (real SQL) is
 * the device smoke (`runExpoSqliteSmoke`), exercised by the 管理 `__DEV__` entry.
 * Together they prove behavioral parity; this test alone proves the full script
 * is well-formed and its step sequence is sound (a malformed step would otherwise
 * surface only on device). It runs the ENTIRE script per test.
 */
describe("behaviorScript (global-inventory model) — InMemory half", () => {
  test("every step returns a defined result, in sequence", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    for (const step of behaviorScript) {
      const result = await step.run(repos);
      expect(result).toBeDefined();
    }
  });

  test("the transaction-rollback step leaves the earlier write intact (atomicity)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    for (const step of behaviorScript) await step.run(repos);
    const staff = await repos.staff.list();
    // the rolled-back create did not persist; the renamed staff from step 3 did.
    // ('-1' is never listed, so this is exactly the one real member.)
    expect(staff).toHaveLength(1);
    expect(staff[0].name).toBe("李四");
  });

  test("the create audit diff is captured with old === undefined (the JSON hazard)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    for (const step of behaviorScript) await step.run(repos);
    const timeline = await repos.audit.queryTimeline({ entity_type: "staff" });
    const create = timeline.find((e) => e.action === "create");
    expect(create).toBeDefined();
    // create diff: there was no "before", so old === undefined — exactly the value
    // the device smoke's stable() must normalize to null (Expo stores it as null).
    const nameDiff = create!.diff.find((d) => d.field === "name");
    expect(nameDiff).toBeDefined();
    expect(nameDiff!.old).toBeUndefined();
    expect(nameDiff!.new).toBe("张三");
  });

  test("the restock→out→void chain drives the global stock 8 → 6 → 欠货 (void propagation)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    const aggByName = async () => {
      const rows = await repos.inventory.shopAggregate();
      return rows;
    };

    // Run through the restock step, snapshot, then through the member-out step.
    const restockIdx = behaviorScript.findIndex((s) => s.name.startsWith("shopAggregate: global stock after restock"));
    for (let i = 0; i <= restockIdx; i++) await behaviorScript[i].run(repos);
    const [p] = await repos.products.list();
    let row = (await aggByName()).find((a) => a.product.id === p.id);
    expect(row?.total_qty).toBe(8); // restock 5+3

    const outIdx = behaviorScript.findIndex((s) => s.name.startsWith("shopAggregate: global stock after member out"));
    for (let i = restockIdx + 1; i <= outIdx; i++) await behaviorScript[i].run(repos);
    row = (await aggByName()).find((a) => a.product.id === p.id);
    expect(row?.total_qty).toBe(6); // 8 − 2 member out

    // Run the rest (incl. the restock void) — global goes negative (欠货).
    for (let i = outIdx + 1; i < behaviorScript.length; i++) await behaviorScript[i].run(repos);
    row = (await aggByName()).find((a) => a.product.id === p.id);
    // restock voided (+8 gone), member out (-2) still active → -2 欠货.
    expect(row?.total_qty).toBe(-2);
  });

  test("the dailyFlow step reflects Σ frozen line_amount (both restock and member-out rows)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    // Run up to and including the dailyFlow step.
    const dailyFlowIdx = behaviorScript.findIndex((s) => s.name.startsWith("dailyFlow"));
    for (let i = 0; i <= dailyFlowIdx; i++) await behaviorScript[i].run(repos);
    const flow = await repos.dailyFlow.flow();
    // Two (day, staff) rows: the '-1' restock (in) and the member (out).
    const restockRow = flow.find((r) => r.staff_id === ADMIN_STAFF_ID);
    const [s] = await repos.staff.listActive();
    const memberRow = flow.find((r) => r.staff_id === s.id);
    expect(restockRow).toBeDefined();
    expect(memberRow).toBeDefined();
    // Member out is all 'out' line_amount, so in_amount is 0.
    expect(memberRow!.in_amount).toBe(0);
    // The restock row's in_amount is the Σ of FROZEN line_amount snapshots after
    // the edit (touched resampled at the new price); it is NOT a current-price
    // revaluation of the original posting. Just assert it is positive and the
    // out side is zero — the cross-adapter compare (device smoke) pins the exact
    // figure, this assertion pins the direction split.
    expect(restockRow!.in_amount).toBeGreaterThan(0);
    expect(restockRow!.out_amount).toBe(0);
    expect(memberRow!.out_amount).toBeGreaterThan(0);
  });
});
