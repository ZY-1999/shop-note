import { AuditProvider, type AuditAction } from "@/data/audit";
import type { HasId, StoragePort } from "@/data/port";
import { id, now } from "@/data/primitives";

/**
 * Member level (display word: 「会员等级」). Stored as a stable English code so
 * rebranding the label (cf. the direction display-label rename precedent — 出库↔出单, enum unchanged) needs no
 * data migration; the Chinese label lives only in {@link STAFF_LEVELS}. Two
 * tiers today (普站 / 星站); the registry is the single source for both UI
 * labels and the gold-first list sort, so adding a tier is one row here.
 */
export type StaffLevel = "normal" | "gold";

export interface StaffLevelDef {
  readonly code: StaffLevel;
  readonly label: "普站" | "星站";
  /** Higher rank sorts first (星站 before 普站). */
  readonly rank: number;
}

/**
 * Single source of truth for level codes, display labels, and sort rank. Order
 * is rank-desc for display/sort consumers; UI reads labels via `labelForLevel`,
 * the repo sorts via `levelRank` — neither hardcodes 「普站/星站」.
 */
export const STAFF_LEVELS: readonly StaffLevelDef[] = [
  { code: "gold", label: "星站", rank: 1 },
  { code: "normal", label: "普站", rank: 0 },
];

/** The level a new member gets when none is specified (普站). */
export const DEFAULT_STAFF_LEVEL: StaffLevel = "normal";

/**
 * The protected virtual "admin" member — the restock (`direction: 'in'`) owner.
 * Seeded by the v3 migration as a fixed-id row (bypassing `create`'s random
 * `id()`). It is never a manageable member: `list`/`listActive`/`search` hide it,
 * and `void` refuses it. Stock records reference it (restock), and `getById`
 * still returns it so record detail can render 「管理员」. (stock-balance-refactor)
 */
export const ADMIN_STAFF_ID = "-1";

/** Display label for a level code (e.g. 'gold' → '星站'). */
export function labelForLevel(code: StaffLevel): string {
  return defForLevel(code).label;
}

/** Sort rank for a level code — higher means a more senior tier (sorts first). */
export function levelRank(code: StaffLevel): number {
  return defForLevel(code).rank;
}

function defForLevel(code: StaffLevel): StaffLevelDef {
  const def = STAFF_LEVELS.find((l) => l.code === code);
  if (!def) throw new Error(`unknown staff level "${code}"`);
  return def;
}

/** Staff master-data entity. voided_at drives soft-delete (history preserved). */
export interface Staff extends HasId {
  name: string;
  phone: string;
  notes: string;
  level: StaffLevel;
  voided_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface StaffCreateInput {
  name: string;
  phone: string;
  notes: string;
  level?: StaffLevel;
}

export interface StaffUpdatePatch {
  name?: string;
  phone?: string;
  notes?: string;
  level?: StaffLevel;
}

/**
 * Staff repository — thin master-data CRUD over the storage port, with every
 * mutation audit-wired via the audit provider (#02). Each mutation runs its
 * write + audit log inside a single transaction so the staff row and its audit
 * entry commit atomically (no audit-without-change or change-without-audit).
 */
export class StaffRepository {
  constructor(
    private storage: StoragePort,
    private audit: AuditProvider,
  ) {}

  async create(input: StaffCreateInput): Promise<Staff> {
    const ts = now();
    const staff: Staff = {
      id: id(),
      name: input.name,
      phone: input.phone,
      notes: input.notes,
      level: input.level ?? DEFAULT_STAFF_LEVEL,
      voided_at: null,
      created_at: ts,
      updated_at: ts,
    };
    await this.storage.withTransaction(async () => {
      await this.storage.insert("staff", staff);
      await this.audit.logEvent({
        action: "create",
        entity_type: "staff",
        entity_id: staff.id,
        after: auditable(staff),
      });
    });
    return staff;
  }

  async getById(staffId: string): Promise<Staff | null> {
    return this.storage.findById<Staff>("staff", staffId);
  }

  async list(opts?: { includeVoided?: boolean }): Promise<Staff[]> {
    const rows = await this.storage.find<Staff>("staff");
    const visible = rows
      .filter((s) => s.id !== ADMIN_STAFF_ID) // '-1' is never a manageable member
      .filter((s) => (opts?.includeVoided ? true : s.voided_at == null));
    // Gold-first (rank desc), then created_at asc — one sort, every list view
    // (记账, 管理) renders 星站 before 普站. rank is derived from the level
    // code, not a stored column, so this must live here, not in the port query.
    return visible.slice().sort(byLevelThenCreated);
  }

  async listActive(): Promise<Staff[]> {
    const rows = await this.storage.find<Staff>("staff", {
      where: { voided_at: null },
    });
    return rows
      .filter((s) => s.id !== ADMIN_STAFF_ID) // '-1' has voided_at=null but is not active
      .slice()
      .sort(byLevelThenCreated);
  }

  async search(q: { text?: string }): Promise<Staff[]> {
    const active = await this.listActive();
    if (!q.text) return active;
    const needle = q.text.toLowerCase();
    return active.filter(
      (s) => s.name.toLowerCase().includes(needle) || s.phone.toLowerCase().includes(needle),
    );
  }

  async update(staffId: string, patch: StaffUpdatePatch): Promise<Staff> {
    return this.mutate(staffId, "update", (current) => {
      const ts = now();
      return {
        persist: { ...patch, updated_at: ts },
        next: { ...current, ...patch, updated_at: ts },
      };
    });
  }

  async void(staffId: string): Promise<Staff> {
    if (staffId === ADMIN_STAFF_ID) {
      throw new Error(`cannot void the admin row (staff_id ${ADMIN_STAFF_ID})`);
    }
    return this.mutate(staffId, "void", (current) => {
      const ts = now();
      return {
        persist: { voided_at: ts, updated_at: ts },
        next: { ...current, voided_at: ts, updated_at: ts },
      };
    });
  }

  async restore(staffId: string): Promise<Staff> {
    return this.mutate(staffId, "restore", (current) => {
      const ts = now();
      return {
        persist: { voided_at: null, updated_at: ts },
        next: { ...current, voided_at: null, updated_at: ts },
      };
    });
  }

  /**
   * Shared mutation template: read current → compute the patch + next state →
   * persist the patch → audit before→after, all in one transaction. Throws if
   * the staff does not exist. Each caller declares only how to derive the
   * change; the transaction, not-found guard, and audit wiring live here once.
   */
  private async mutate(
    staffId: string,
    action: AuditAction,
    compute: (current: Staff) => { persist: Partial<Staff>; next: Staff },
  ): Promise<Staff> {
    return this.storage.withTransaction(async () => {
      const current = await this.storage.findById<Staff>("staff", staffId);
      if (!current) throw new Error(`staff ${staffId} not found`);
      const { persist, next } = compute(current);
      await this.storage.update<Staff>("staff", staffId, persist);
      await this.audit.logEvent({
        action,
        entity_type: "staff",
        entity_id: staffId,
        before: auditable(current),
        after: auditable(next),
      });
      return next;
    });
  }
}

/**
 * The fields worth auditing — user-visible state + the voided_at flag. Excludes
 * id/created_at/updated_at: those are system metadata, and updated_at advances
 * on every write, which would pollute every update diff with a spurious entry.
 */
function auditable(staff: Staff): Record<string, unknown> {
  return {
    name: staff.name,
    phone: staff.phone,
    notes: staff.notes,
    level: staff.level,
    voided_at: staff.voided_at,
  };
}

/**
 * Gold-first list order: higher level rank first, then created_at ascending
 * (oldest within a tier first). Applied by `list` / `listActive` (and inherited
 * by `search`) so every member list renders 星站 before 普站 with no caller-side
 * re-sort.
 */
function byLevelThenCreated(a: Staff, b: Staff): number {
  const rankDiff = levelRank(b.level) - levelRank(a.level);
  if (rankDiff !== 0) return rankDiff;
  return a.created_at - b.created_at;
}
