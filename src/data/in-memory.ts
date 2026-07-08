import type { HasId, Query, StoragePort } from "@/data/port";

/**
 * In-memory test adapter — a trivial row-store over nested Maps.
 *
 * This is the adapter the Jest suite runs against (PRD testing decision: the
 * repository is the single seam, exercised through the in-memory port). It
 * holds no business logic; it stores exactly what the repository gives it.
 */
export class InMemoryAdapter implements StoragePort {
  /** table name → (id → row) */
  private tables = new Map<string, Map<string, unknown>>();

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const snapshot = this.snapshot();
    try {
      return await fn();
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  private snapshot(): Map<string, Map<string, unknown>> {
    const snap = new Map<string, Map<string, unknown>>();
    for (const [table, rows] of this.tables) {
      const copy = new Map<string, unknown>();
      for (const [rowId, row] of rows) copy.set(rowId, cloneValue(row));
      snap.set(table, copy);
    }
    return snap;
  }

  private restore(snap: Map<string, Map<string, unknown>>): void {
    this.tables = snap;
  }

  private table(name: string): Map<string, unknown> {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = new Map();
      this.tables.set(name, rows);
    }
    return rows;
  }

  async insert<T extends HasId>(table: string, row: T): Promise<T> {
    this.table(table).set(row.id, row);
    return row;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    return (this.table(table).get(id) as T | undefined) ?? null;
  }

  async update<T extends object>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
    const rows = this.table(table);
    const current = rows.get(id) as T | undefined;
    if (!current) return null;
    const next = { ...current, ...patch } as T;
    rows.set(id, next);
    return next;
  }

  async find<T>(table: string, query?: Query<T>): Promise<T[]> {
    let rows = Array.from(this.table(table).values()) as T[];
    const where = query?.where;
    if (where) rows = rows.filter((r) => matches(r, where));
    if (query?.orderBy) {
      const { field, dir = "asc" } = query.orderBy;
      rows = rows.sort((a, b) => compare(a[field], b[field]) * (dir === "desc" ? -1 : 1));
    }
    if (query?.limit != null) rows = rows.slice(0, query.limit);
    return rows;
  }
}

/** Field-equality matcher; null and undefined both count as "absent" (equal). */
function matches<T>(row: T, where: Partial<T>): boolean {
  for (const [key, value] of Object.entries(where)) {
    const rowValue = (row as unknown as Record<string, unknown>)[key];
    if (rowValue === value) continue;
    if (rowValue == null && value == null) continue;
    return false;
  }
  return true;
}

/** Three-way compare that handles null/undefined (sorted first, ascending). */
function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deep clone of a JSON-serializable row (rows never hold functions/dates). */
function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
