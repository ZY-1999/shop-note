import type { Repos } from "@/data/composition";
import { cents } from "@/data/primitives";
import { ADMIN_STAFF_ID } from "@/data/staff";

/**
 * The shared behavior script for the cross-adapter device smoke.
 *
 * An ordered list of steps; each step mutates a repo set cumulatively and
 * returns a snapshot. `runExpoSqliteSmoke` runs the same steps against an Expo
 * repo set and an InMemory repo set, deep-comparing `stable(step.run(expo))`
 * vs `stable(step.run(mem))` per step — so drift localizes to the diverging
 * operation. This file holds the *script*; the runner lives in `run-smoke.ts`
 * (device-only — it imports `expo-sqlite`). The `Repos` set and `setupRepos`
 * wiring live in `src/data/composition.ts`.
 *
 * This module imports **no** `expo-sqlite` (only the `Repos` type + `cents` +
 * `ADMIN_STAFF_ID`), so Jest can run the script's InMemory half — see
 * `behavior-script.test.ts`. The Expo half (real SQL) is the device smoke.
 *
 * stock-balance-refactor: the script drives the new global-inventory model —
 * restock (`direction: 'in'`) is owned by the admin `-1`, members only check out
 * (`direction: 'out'`), and the derived read is `shopAggregate` (global stock).
 * The old per-staff `balance` / `staffInventory` reads are gone. The sequence
 * exercises: restock → global up; member out → global down + balance decrement
 * (spec 03); price change → cost reval; record edit (snapshot merge); dailyFlow;
 * void → global drops (negative 欠货 when out exceeds restock).
 */

/** One named behavior; its snapshot is compared across adapters after `stable()`. */
export interface SmokeStep {
  readonly name: string;
  run: (repos: Repos) => Promise<unknown>;
}

/** First active member, or throw — there is always exactly one by the time later steps run. */
async function activeStaff(repos: Repos) {
  const [s] = await repos.staff.listActive();
  if (!s) throw new Error("smoke: no active staff");
  return s;
}

/** First active product, or throw. (ProductRepository has no `listActive`;
 *  `list()` already filters out voided rows in memory — same active set.) */
async function activeProduct(repos: Repos) {
  const [p] = await repos.products.list();
  if (!p) throw new Error("smoke: no active product");
  return p;
}

/**
 * The full behavior script. Steps find earlier state dynamically (list[0])
 * rather than by hardcoded id, because the two repo sets mint independent ids.
 */
export const behaviorScript: readonly SmokeStep[] = [
  // ── tracer bullet ─────────────────────────────────────────────────────────
  {
    name: "staff: create",
    run: (repos) => repos.staff.create({ name: "张三", phone: "138", notes: "n" }),
  },
  {
    name: "staff: getById",
    run: async (repos) => {
      const list = await repos.staff.list();
      return repos.staff.getById(list[0].id);
    },
  },
  {
    name: "staff: update (rename)",
    run: async (repos) => {
      const [s] = await repos.staff.listActive();
      return repos.staff.update(s.id, { name: "李四" });
    },
  },
  {
    name: "audit: timeline (create diff old=undefined)",
    run: (repos) => repos.audit.queryTimeline({ entity_type: "staff" }),
  },
  {
    name: "tx: rollback leaves no row",
    run: async (repos) => {
      await repos.storage
        .withTransaction(async () => {
          await repos.staff.create({ name: "应回滚", phone: "x", notes: "" });
          throw new Error("force rollback");
        })
        .catch(() => {
          /* expected — the step must not reject */
        });
      return repos.staff.list();
    },
  },

  // ── full coverage ─────────────────────────────────────────────────────────
  {
    name: "product: create",
    run: (repos) => repos.products.create({ title: "可乐", purchase_price: cents(1995) }),
  },
  {
    name: "product: getById",
    run: async (repos) => repos.products.getById((await activeProduct(repos)).id),
  },
  {
    name: "product: list + search (voided_at:null filter)",
    run: async (repos) => ({
      // list() filters voided in memory; search({}) pushes voided_at:null to SQL.
      list: await repos.products.list(),
      active: await repos.products.search({}),
    }),
  },
  {
    name: "product: search (by text)",
    run: (repos) => repos.products.search({ text: "可" }),
  },
  {
    name: "staff: listActive (voided_at:null) + search",
    run: async (repos) => ({
      listActive: await repos.staff.listActive(),
      search: await repos.staff.search({ text: "李四" }),
    }),
  },
  {
    name: "staff: void then restore (excluded then re-included)",
    run: async (repos) => {
      const s = await activeStaff(repos);
      await repos.staff.void(s.id);
      const excluded = await repos.staff.listActive(); // voided → excluded
      await repos.staff.restore(s.id);
      const restored = await repos.staff.listActive(); // restored → back
      return { excluded, restored };
    },
  },
  {
    name: "product: void then restore (excluded then re-included)",
    run: async (repos) => {
      const p = await activeProduct(repos);
      await repos.products.void(p.id);
      const excluded = await repos.products.search({}); // voided_at:null → excluded
      await repos.products.restore(p.id);
      const restored = await repos.products.search({}); // restored → back
      return { excluded, restored };
    },
  },
  {
    name: "restock: create 'in' under admin -1 (line snapshot of title + unit_price)",
    run: async (repos) => {
      const p = await activeProduct(repos);
      return repos.stockRecords.create({
        staff_id: ADMIN_STAFF_ID,
        direction: "in",
        items: [
          { product_id: p.id, qty: 5 },
          { product_id: p.id, qty: 3 },
        ],
      });
    },
  },
  {
    name: "stock-record: getById (snapshot preserved)",
    run: async (repos) => {
      const [entry] = await repos.stockRecords.list();
      return repos.stockRecords.getById(entry.record.id);
    },
  },
  {
    name: "shopAggregate: global stock after restock (qty=8)",
    run: (repos) => repos.inventory.shopAggregate(),
  },
  {
    name: "checkout: member 'out' (direction guard: out allowed for a member)",
    run: async (repos) => {
      const s = await activeStaff(repos);
      const p = await activeProduct(repos);
      return repos.stockRecords.create({
        staff_id: s.id,
        direction: "out",
        items: [{ product_id: p.id, qty: 2 }],
      });
    },
  },
  {
    name: "shopAggregate: global stock after member out (qty=6)",
    run: (repos) => repos.inventory.shopAggregate(),
  },
  {
    name: "product: update (price 1995→2495; cost-reval baseline)",
    run: async (repos) => repos.products.update((await activeProduct(repos)).id, {
      purchase_price: cents(2495),
    }),
  },
  {
    name: "shopAggregate: cost revaluation after price change (qty unchanged)",
    run: (repos) => repos.inventory.shopAggregate(),
  },
  {
    name: "stock-record: update (touched resample + untouched keep + UPSERT keep)",
    run: async (repos) => {
      // The restock record is the first record; edit its lines (direction stays
      // 'in', staff_id stays '-1' — the update guard's effective-direction check
      // holds). Touch items[0] (qty 5→7 → resnapshot at the new price), add a new
      // line (qty 2), leave items[1] UNMENTIONED — it survives with its original
      // posting-time snapshot (upsert never drops stored lines).
      const [entry] = await repos.stockRecords.list();
      const p = await activeProduct(repos);
      return repos.stockRecords.update(entry.record.id, {
        items: [
          { id: entry.items[0].id, product_id: p.id, qty: 7 },
          { product_id: p.id, qty: 2 },
        ],
      });
    },
  },
  {
    name: "dailyFlow: per (day,staff) in/out from snapshot line_amount",
    run: async (repos) => {
      // No staff filter — both the '-1' restock and the member 'out' appear, each
      // under its own (day, staff) row. Runs AFTER the price update + record edit
      // so amounts are FROZEN line_amount snapshots, NOT current-price revalued.
      // stable() collapses `date`→`<date>`.
      return repos.dailyFlow.flow();
    },
  },
  {
    name: "stock-record: void (items retained, never erased)",
    run: async (repos) => {
      // Void the restock record (list[0]) — the member 'out' stays active, so the
      // global stock goes negative (欠货), exercising invariant #5.
      const [entry] = await repos.stockRecords.list();
      await repos.stockRecords.void(entry.record.id);
      return repos.stockRecords.getById(entry.record.id);
    },
  },
  {
    name: "audit: timeline (create + edit + void + restore diffs)",
    run: (repos) => repos.audit.queryTimeline(),
  },
  {
    name: "shopAggregate: global stock after restock void (negative = 欠货)",
    run: (repos) => repos.inventory.shopAggregate(),
  },
];
