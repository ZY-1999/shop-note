import { AuditProvider, type AuditAction } from "@/data/audit";
import type { HasId, StoragePort } from "@/data/port";
import { id, now } from "@/data/primitives";

/** Staff master-data entity. voided_at drives soft-delete (history preserved). */
export interface Staff extends HasId {
  name: string;
  phone: string;
  notes: string;
  voided_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface StaffCreateInput {
  name: string;
  phone: string;
  notes: string;
}

export interface StaffUpdatePatch {
  name?: string;
  phone?: string;
  notes?: string;
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
    const rows = await this.storage.find<Staff>("staff", {
      orderBy: { field: "created_at", dir: "asc" },
    });
    if (opts?.includeVoided) return rows;
    return rows.filter((s) => s.voided_at == null);
  }

  async listActive(): Promise<Staff[]> {
    return this.storage.find<Staff>("staff", {
      where: { voided_at: null },
      orderBy: { field: "created_at", dir: "asc" },
    });
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
    voided_at: staff.voided_at,
  };
}
