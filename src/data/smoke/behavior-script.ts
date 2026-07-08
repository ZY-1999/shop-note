import { AuditProvider } from "@/data/audit";
import { Inventory } from "@/data/inventory";
import { ProductRepository } from "@/data/product";
import { StaffRepository } from "@/data/staff";
import { StockRecordRepository } from "@/data/stock-record";
import type { StoragePort } from "@/data/port";

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
 * This module imports **no** `expo-sqlite` (only repos + port), so Jest can run
 * the script's InMemory half — see `behavior-script.test.ts`. Spec #02 seeds the
 * tracer bullet (staff CRUD + audit round-trip + tx rollback); spec #03 appends
 * full-coverage steps. The runner is untouched by that growth.
 */

/** A composed repo set over a single storage adapter — mirrors `inventory.test.ts`'s setup(). */
export interface Repos {
  storage: StoragePort;
  audit: AuditProvider;
  products: ProductRepository;
  staff: StaffRepository;
  stockRecords: StockRecordRepository;
  inventory: Inventory;
}

/** Build a fresh repo set over `storage` — identical wiring for Expo and InMemory. */
export function setupRepos(storage: StoragePort): Repos {
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit);
  const inventory = new Inventory(stockRecords, products);
  return { storage, audit, products, staff, stockRecords, inventory };
}

/** One named behavior; its snapshot is compared across adapters after `stable()`. */
export interface SmokeStep {
  readonly name: string;
  run: (repos: Repos) => Promise<unknown>;
}

/**
 * The tracer bullet (spec #02 minimal subset):
 * 1. staff CRUD loop — create → getById → update;
 * 2. audit round-trip — the timeline incl. the create diff (`old: undefined`);
 * 3. transaction rollback — a thrown tx leaves the earlier write intact.
 *
 * Steps find earlier state dynamically (list[0]) rather than by hardcoded id,
 * because the two repo sets mint independent ids. Spec #03 appends to this list.
 */
export const behaviorScript: readonly SmokeStep[] = [
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
];
