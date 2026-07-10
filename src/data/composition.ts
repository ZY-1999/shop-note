import { AuditProvider } from "@/data/audit";
import { ConfigRepository } from "@/data/config";
import { DailyFlow } from "@/data/daily-flow";
import { Inventory } from "@/data/inventory";
import { MemberBalance } from "@/data/member-balance";
import { ProductRepository } from "@/data/product";
import { StaffRepository } from "@/data/staff";
import { StockRecordRepository } from "@/data/stock-record";
import { TopupRepository } from "@/data/topup";
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
  topups: TopupRepository;
  memberBalance: MemberBalance;
  config: ConfigRepository;
}

/** Build a fresh repo set over `storage` — identical wiring for Expo and InMemory. */
export function setupRepos(storage: StoragePort): Repos {
  const audit = new AuditProvider(storage);
  const products = new ProductRepository(storage, audit);
  const staff = new StaffRepository(storage, audit);
  const config = new ConfigRepository(storage, audit);
  const stockRecords = new StockRecordRepository(storage, products, audit, config);
  const inventory = new Inventory(stockRecords, products);
  const dailyFlow = new DailyFlow(stockRecords);
  const topups = new TopupRepository(storage, audit);
  const memberBalance = new MemberBalance(topups, stockRecords);
  return { storage, audit, products, staff, stockRecords, inventory, dailyFlow, topups, memberBalance, config };
}
