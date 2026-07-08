import { AuditProvider } from "@/data/audit";
import { DailyFlow } from "@/data/daily-flow";
import { Inventory } from "@/data/inventory";
import { ProductRepository } from "@/data/product";
import { StaffRepository } from "@/data/staff";
import { StockRecordRepository } from "@/data/stock-record";
import type { StoragePort } from "@/data/port";

/**
 * The single composition root — assembles a repo set over one storage adapter.
 *
 * Both the UI app boot (#3/#4) and the cross-adapter device smoke import this
 * one wiring, so the smoke proves exactly what the UI runs (ADR-0005: no second
 * wiring to drift). Pure construction — no React, no `expo-sqlite` — safe to
 * call from any runtime (Jest, RN boot, the device smoke).
 */
export interface Repos {
  storage: StoragePort;
  audit: AuditProvider;
  products: ProductRepository;
  staff: StaffRepository;
  stockRecords: StockRecordRepository;
  inventory: Inventory;
  dailyFlow: DailyFlow;
}

/** Build a fresh repo set over `storage` — identical wiring for Expo and InMemory. */
export function setupRepos(storage: StoragePort): Repos {
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit);
  const inventory = new Inventory(stockRecords, products);
  const dailyFlow = new DailyFlow(stockRecords);
  return { storage, audit, products, staff, stockRecords, inventory, dailyFlow };
}
