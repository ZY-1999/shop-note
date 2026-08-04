import { AuditProvider } from "@/data/audit";
import type { HasId, StoragePort } from "@/data/port";
import { type Cents, cents, now } from "@/data/primitives";

/**
 * Generic key-value config entity (stock-balance-refactor). `id` IS the config
 * key — the first (and so far only) key is {@link UNIT_PRICE_KEY}. `value` is
 * integer cents for unit_price; future keys may carry other integer domains.
 */
export interface ConfigRow extends HasId {
  value: number;
  updated_at: number;
}

/** The global unit-price config key (¥ per "bundle" — splits an out amount into 单数 + 零售). */
export const UNIT_PRICE_KEY = "unit_price";

/** Bitmask key for which summary-export sheets are included (summary-range-export). */
export const SUMMARY_EXPORT_SHEETS_KEY = "summary_export_sheets";

export type SummaryExportSheets = {
  inventory: boolean;
  inbound: boolean;
  topupCheckout: boolean;
  topupCheckoutDetail: boolean;
};

const SHEET_BITS = {
  inventory: 1 << 0,
  inbound: 1 << 1,
  topupCheckout: 1 << 2,
  topupCheckoutDetail: 1 << 3,
} as const;

const ALL_SHEETS_MASK =
  SHEET_BITS.inventory |
  SHEET_BITS.inbound |
  SHEET_BITS.topupCheckout |
  SHEET_BITS.topupCheckoutDetail;

export function encodeSummaryExportSheets(sheets: SummaryExportSheets): number {
  let mask = 0;
  if (sheets.inventory) mask |= SHEET_BITS.inventory;
  if (sheets.inbound) mask |= SHEET_BITS.inbound;
  if (sheets.topupCheckout) mask |= SHEET_BITS.topupCheckout;
  if (sheets.topupCheckoutDetail) mask |= SHEET_BITS.topupCheckoutDetail;
  return mask;
}

export function decodeSummaryExportSheets(mask: number): SummaryExportSheets {
  return {
    inventory: (mask & SHEET_BITS.inventory) !== 0,
    inbound: (mask & SHEET_BITS.inbound) !== 0,
    topupCheckout: (mask & SHEET_BITS.topupCheckout) !== 0,
    topupCheckoutDetail: (mask & SHEET_BITS.topupCheckoutDetail) !== 0,
  };
}

/**
 * A small, deep config repository — get/set one key at a time, hiding the
 * key-value store's shape behind a tiny interface. setUnitPrice upserts (insert
 * on first set, update after) + audit-logs the change inside one transaction;
 * getUnitPrice returns 0 on cold start (key absent) so callers never special-case
 * "unconfigured". Generic on purpose so the next config key is one method here.
 */
export class ConfigRepository {
  constructor(
    private storage: StoragePort,
    private audit: AuditProvider,
  ) {}

  /** Current unit price in Cents; 0 if never set (cold start — does not throw). */
  async getUnitPrice(): Promise<Cents> {
    const row = await this.storage.findById<ConfigRow>("config", UNIT_PRICE_KEY);
    return cents(row?.value ?? 0);
  }

  /** Set the unit price (upsert) + audit the change atomically. */
  async setUnitPrice(amount: Cents): Promise<void> {
    const existing = await this.storage.findById<ConfigRow>("config", UNIT_PRICE_KEY);
    const ts = now();
    await this.storage.withTransaction(async () => {
      if (existing) {
        await this.storage.update<ConfigRow>("config", UNIT_PRICE_KEY, { value: amount, updated_at: ts });
      } else {
        await this.storage.insert<ConfigRow>("config", { id: UNIT_PRICE_KEY, value: amount, updated_at: ts });
      }
      await this.audit.logEvent({
        action: existing ? "update" : "create",
        entity_type: "config",
        entity_id: UNIT_PRICE_KEY,
        before: existing ? { value: existing.value } : undefined,
        after: { value: amount },
      });
    });
  }

  /**
   * Which summary-export sheets are selected. Missing key → all four true
   * (`0b1111`). Stored as an integer bitmask on {@link SUMMARY_EXPORT_SHEETS_KEY}.
   */
  async getSummaryExportSheets(): Promise<SummaryExportSheets> {
    const row = await this.storage.findById<ConfigRow>(
      "config",
      SUMMARY_EXPORT_SHEETS_KEY,
    );
    return decodeSummaryExportSheets(row?.value ?? ALL_SHEETS_MASK);
  }

  /** Persist sheet selection (upsert) + audit atomically. */
  async setSummaryExportSheets(sheets: SummaryExportSheets): Promise<void> {
    const existing = await this.storage.findById<ConfigRow>(
      "config",
      SUMMARY_EXPORT_SHEETS_KEY,
    );
    const value = encodeSummaryExportSheets(sheets);
    const ts = now();
    await this.storage.withTransaction(async () => {
      if (existing) {
        await this.storage.update<ConfigRow>("config", SUMMARY_EXPORT_SHEETS_KEY, {
          value,
          updated_at: ts,
        });
      } else {
        await this.storage.insert<ConfigRow>("config", {
          id: SUMMARY_EXPORT_SHEETS_KEY,
          value,
          updated_at: ts,
        });
      }
      await this.audit.logEvent({
        action: existing ? "update" : "create",
        entity_type: "config",
        entity_id: SUMMARY_EXPORT_SHEETS_KEY,
        before: existing ? { value: existing.value } : undefined,
        after: { value },
      });
    });
  }
}
