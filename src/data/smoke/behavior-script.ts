import type { Repos } from "@/data/composition";
import { cents } from "@/data/primitives";

/**
 * The shared behavior script for the cross-adapter device smoke (spec #02/#03).
 *
 * An ordered list of steps; each step mutates a repo set cumulatively and
 * returns a snapshot. `runExpoSqliteSmoke` runs the same steps against an Expo
 * repo set and an InMemory repo set, deep-comparing `stable(step.run(expo))`
 * vs `stable(step.run(mem))` per step — so drift localizes to the diverging
 * operation (DESIGN-IT-TWICE in spec #02). This file holds the *script*; the
 * runner lives in `run-smoke.ts` (device-only — it imports `expo-sqlite`).
 *
 * This module imports **no** `expo-sqlite` (only the `Repos` type + `cents`), so
 * Jest can run the script's InMemory half — see `behavior-script.test.ts`. The
 * `Repos` set and `setupRepos` wiring live in `src/data/composition.ts` (lifted
 * here in spec #02-composition-preflight) so the UI composition root and the
 * smoke share one assembly. Spec #02 seeded the tracer bullet (steps 1–5);
 * spec #03 appended the full-coverage steps (6+). The runner is untouched by
 * that growth — it takes `behaviorScript` as the default.
 */

/** One named behavior; its snapshot is compared across adapters after `stable()`. */
export interface SmokeStep {
  readonly name: string;
  run: (repos: Repos) => Promise<unknown>;
}

/** First active staff, or throw — there is always exactly one by the time later steps run. */
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
 * The full behavior script. Steps 1–5 are the tracer bullet (spec #02): staff
 * CRUD loop, the create audit diff, and a transaction rollback. Steps 6+ are the
 * full-coverage thickening (spec #03): product CRUD + void/restore, the
 * `voided_at:null` filter, master-data void/restore round-trips, the stock-record
 * snapshot/update/void paths (touched resample, untouched snapshot kept, UPSERT
 * never drops lines, void never erases items), the derived balance/cost/aggregate
 * reads (incl. cost revaluation and void propagation), and the full audit timeline.
 *
 * Steps find earlier state dynamically (list[0]) rather than by hardcoded id,
 * because the two repo sets mint independent ids.
 */
export const behaviorScript: readonly SmokeStep[] = [
  // ── tracer bullet (spec #02) ──────────────────────────────────────────────
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

  // ── full coverage (spec #03) ──────────────────────────────────────────────
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
      const excluded = await repos.staff.listActive(); // voided → excluded by the null filter
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
    name: "stock-record: create 'in' (line snapshot of title + unit_price)",
    run: async (repos) => {
      const s = await activeStaff(repos);
      const p = await activeProduct(repos);
      return repos.stockRecords.create({
        staff_id: s.id,
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
    name: "inventory: balance (active record: qty=8, cost=8×price)",
    run: async (repos) => {
      const s = await activeStaff(repos);
      const p = await activeProduct(repos);
      return repos.inventory.balance(s.id, p.id);
    },
  },
  {
    name: "inventory: staffInventory + shopAggregate",
    run: async (repos) => {
      const s = await activeStaff(repos);
      return {
        staffInventory: await repos.inventory.staffInventory(s.id),
        shopAggregate: await repos.inventory.shopAggregate(),
      };
    },
  },
  {
    name: "product: update (price 1995→2495; cost-reval + resample baseline)",
    run: async (repos) => repos.products.update((await activeProduct(repos)).id, {
      purchase_price: cents(2495),
    }),
  },
  {
    name: "inventory: balance after price change (cost revaluation, no record change)",
    run: async (repos) => {
      const s = await activeStaff(repos);
      const p = await activeProduct(repos);
      return repos.inventory.balance(s.id, p.id);
    },
  },
  {
    name: "stock-record: update (touched resample + untouched keep + UPSERT keep)",
    run: async (repos) => {
      const [entry] = await repos.stockRecords.list();
      const p = await activeProduct(repos);
      // touch items[0] (qty 5→7 → resnapshot at the new price), add a new line
      // (qty 2), and leave items[1] UNMENTIONED — it must survive with its
      // original posting-time snapshot (upsert never drops stored lines).
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
      const s = await activeStaff(repos);
      // Runs BEFORE the void step — the 'in' record is still active, so the flow
      // is non-empty. Placed AFTER the price update (1995→2495) and the record
      // edit (touched lines resampled at 2495; the unmentioned line keeps its
      // 1995 snapshot), so in_amount is the Σ of FROZEN line_amounts — NOT a
      // current-price (2495) revaluation. stable() collapses `date`→`<date>`.
      return repos.dailyFlow.flow({ staff_id: s.id });
    },
  },
  {
    name: "stock-record: void (items retained, never erased)",
    run: async (repos) => {
      const [entry] = await repos.stockRecords.list();
      await repos.stockRecords.void(entry.record.id);
      // getById returns even voided rows → confirm items are still all there.
      return repos.stockRecords.getById(entry.record.id);
    },
  },
  {
    name: "audit: timeline (create + edit + void + restore diffs)",
    run: (repos) => repos.audit.queryTimeline(),
  },
  {
    name: "inventory: balance after record void (void propagates → qty=0)",
    run: async (repos) => {
      const s = await activeStaff(repos);
      const p = await activeProduct(repos);
      return repos.inventory.balance(s.id, p.id);
    },
  },
];
