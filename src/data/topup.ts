import { AuditProvider, type AuditAction } from "@/data/audit";
import type { HasId, StoragePort } from "@/data/port";
import { type Cents, id, now } from "@/data/primitives";

/**
 * Top-up ledger entity (stock-balance-refactor). A member's money-in event —
 * `amount` is integer Cents; no product, no item lines (it is cash flow, not
 * stock). `voided_at` drives soft-delete (history preserved, like every entity).
 */
export interface Topup extends HasId {
  staff_id: string;
  amount: Cents;
  timestamp: number; // user-settable (defaults to now) — backdatable
  note: string | null;
  voided_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TopupCreateInput {
  staff_id: string;
  amount: Cents;
  note?: string;
  timestamp?: number;
}

/**
 * Top-up repository — the member money-in ledger. create + void are both audited
 * (money actions) inside a single transaction, mirroring the staff/product
 * mutate template. There is no update/restore — a top-up is corrected by voiding
 * and re-entering, never by editing (preserves the money trail). No hard delete.
 */
export class TopupRepository {
  constructor(
    private storage: StoragePort,
    private audit: AuditProvider,
  ) {}

  async create(input: TopupCreateInput): Promise<Topup> {
    const ts = now();
    const topup: Topup = {
      id: id(),
      staff_id: input.staff_id,
      amount: input.amount,
      timestamp: input.timestamp ?? ts,
      note: input.note ?? null,
      voided_at: null,
      created_at: ts,
      updated_at: ts,
    };
    await this.storage.withTransaction(async () => {
      await this.storage.insert("topup", topup);
      await this.audit.logEvent({
        action: "create",
        entity_type: "topup",
        entity_id: topup.id,
        after: auditable(topup),
      });
    });
    return topup;
  }

  /** Return one top-up by id, INCLUDING voided (so detail/history stays viewable). */
  async getById(topupId: string): Promise<Topup | null> {
    return this.storage.findById<Topup>("topup", topupId);
  }

  /** List top-ups, voided excluded. Optional staff_id and date_range filters; newest timestamp first. */
  async list(opts?: {
    staff_id?: string;
    date_range?: { from?: number; to?: number };
  }): Promise<Topup[]> {
    const rows = await this.storage.find<Topup>("topup", {
      orderBy: { field: "timestamp", dir: "desc" },
    });
    return rows
      .filter((t) => t.voided_at == null)
      .filter((t) => matchesTopupFilter(t, opts));
  }

  /** Void a top-up — sets voided_at; never removes data. Audited atomically. */
  async void(topupId: string): Promise<Topup> {
    return this.mutate(topupId, "void", (current) => {
      const ts = now();
      return {
        persist: { voided_at: ts, updated_at: ts },
        next: { ...current, voided_at: ts, updated_at: ts },
      };
    });
  }

  private async mutate(
    topupId: string,
    action: AuditAction,
    compute: (current: Topup) => { persist: Partial<Topup>; next: Topup },
  ): Promise<Topup> {
    return this.storage.withTransaction(async () => {
      const current = await this.storage.findById<Topup>("topup", topupId);
      if (!current) throw new Error(`topup ${topupId} not found`);
      const { persist, next } = compute(current);
      await this.storage.update<Topup>("topup", topupId, persist);
      await this.audit.logEvent({
        action,
        entity_type: "topup",
        entity_id: topupId,
        before: auditable(current),
        after: auditable(next),
      });
      return next;
    });
  }
}

/**
 * Fields worth auditing — user-visible state + voided_at. Excludes
 * id/created_at/updated_at (system metadata; updated_at would pollute diffs).
 */
function auditable(topup: Topup): Record<string, unknown> {
  return {
    staff_id: topup.staff_id,
    amount: topup.amount,
    timestamp: topup.timestamp,
    note: topup.note,
    voided_at: topup.voided_at,
  };
}

function matchesTopupFilter(
  topup: Topup,
  filter?: { staff_id?: string; date_range?: { from?: number; to?: number } },
): boolean {
  if (!filter) return true;
  if (filter.staff_id !== undefined && topup.staff_id !== filter.staff_id) return false;
  const range = filter.date_range;
  if (range?.from != null && topup.timestamp < range.from) return false;
  if (range?.to != null && topup.timestamp > range.to) return false;
  return true;
}
