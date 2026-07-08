import { describe, expect, test } from "@jest/globals";
import { InMemoryAdapter } from "@/data/in-memory";
import { behaviorScript } from "@/data/smoke/behavior-script";
import { setupRepos } from "@/data/composition";

/**
 * The behavior script's *InMemory* half. Jest can reach this half because
 * `behavior-script.ts` imports no `expo-sqlite`; the *Expo* half (real SQL) is
 * the device smoke (`runExpoSqliteSmoke`), exercised by the Home `__DEV__` entry.
 * Together they prove behavioral parity; this test alone proves the full script
 * is well-formed and its step sequence is sound (a malformed step would otherwise
 * surface only on device). It runs the ENTIRE 23-step script per test.
 */
describe("behaviorScript (full coverage) — InMemory half", () => {
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

  test("the full stock→inventory→void chain drives the balance to 0 (void propagation)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    for (const step of behaviorScript) await step.run(repos);
    // After step 21 voids the only stock record, the derived balance is 0 — this
    // pins the whole sequence (create → read → price change → update → void) on
    // the InMemory side; the device smoke proves Expo matches it step by step.
    const [s] = await repos.staff.listActive();
    const [p] = await repos.products.list();
    const bal = await repos.inventory.balance(s.id, p.id);
    expect(bal.qty).toBe(0);
  });

  test("the dailyFlow step reflects Σ frozen line_amount (not current-price revalued)", async () => {
    const repos = setupRepos(new InMemoryAdapter());
    // Run up to and including the dailyFlow step (it sits just before the void).
    const dailyFlowIdx = behaviorScript.findIndex((s) => s.name.startsWith("dailyFlow"));
    for (let i = 0; i <= dailyFlowIdx; i++) await behaviorScript[i].run(repos);
    const [s] = await repos.staff.listActive();
    const flow = await repos.dailyFlow.flow({ staff_id: s.id });
    expect(flow).toHaveLength(1);
    expect(flow[0].out_amount).toBe(0);
    // touched qty7@2495 (17465) + new qty2@2495 (4990) + untouched qty3@1995 (5985)
    // = 28440 — frozen snapshots, NOT a current-price (2495) revaluation.
    expect(flow[0].in_amount).toBe(28440);
  });
});
