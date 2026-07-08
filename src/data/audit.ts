import type { HasId, StoragePort } from "@/data/port";
import { id, now } from "@/data/primitives";

/**
 * Audit log provider — captures field-level old→new diffs for any entity
 * change and exposes a read-only, filterable timeline.
 *
 * A provider: consumed (not re-implemented) by every entity repository
 * (#03 staff, #04 product, #06 stock edit/void). Generic and entity-agnostic —
 * it computes diffs over plain key→value objects and knows no entity shapes.
 */
export type AuditAction = "create" | "update" | "void" | "restore";

export interface FieldDiff {
  field: string;
  old: unknown;
  new: unknown;
}

export interface AuditEntry extends HasId {
  actor: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  timestamp: number; // real now — audit/system time, not user-settable
  diff: FieldDiff[]; // only changed fields, in iteration order
}

export interface LogEventInput {
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  actor?: string; // defaults to "owner" (single-operator assumption)
}

export interface TimelineFilter {
  entity_type?: string;
  action?: AuditAction;
  date_range?: { from?: number; to?: number };
}

export class AuditProvider {
  constructor(private storage: StoragePort) {}

  async logEvent(input: LogEventInput): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: id(),
      actor: input.actor ?? "owner",
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      timestamp: now(),
      diff: computeDiff(input.before, input.after),
    };
    await this.storage.insert("audit_log", entry);
    return entry;
  }

  async queryTimeline(filter?: TimelineFilter): Promise<AuditEntry[]> {
    // entity_type/action are field equality → push down to the storage where-filter.
    const where: Partial<AuditEntry> = {};
    if (filter?.entity_type) where.entity_type = filter.entity_type;
    if (filter?.action) where.action = filter.action;
    const rows = await this.storage.find<AuditEntry>("audit_log", {
      where,
      orderBy: { field: "timestamp", dir: "asc" },
    });
    // date_range is a comparison, not equality → filter in memory after the read.
    const range = filter?.date_range;
    if (!range) return rows;
    return rows.filter((entry) => {
      if (range.from != null && entry.timestamp < range.from) return false;
      if (range.to != null && entry.timestamp > range.to) return false;
      return true;
    });
  }
}

/**
 * Generic, entity-agnostic diff: iterate the union of before/after keys in
 * insertion order (before's keys first, then any new keys in after), emit
 * {field, old, new} only where old !== new. Primitives compared by value;
 * undefined→value counts as a change (create), value→undefined as a change (void).
 */
function computeDiff(
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): FieldDiff[] {
  const diff: FieldDiff[] = [];
  const seen = new Set<string>();
  for (const field of Object.keys(before ?? {})) seen.add(field);
  for (const field of Object.keys(after ?? {})) seen.add(field);
  for (const field of seen) {
    const oldVal = before?.[field];
    const newVal = after?.[field];
    if (oldVal !== newVal) {
      diff.push({ field, old: oldVal, new: newVal });
    }
  }
  return diff;
}
