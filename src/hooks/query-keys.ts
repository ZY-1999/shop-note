import type { DailyFlowFilter } from "@/data/daily-flow";
import type { RecordFilter } from "@/data/stock-record";

/**
 * The single query-key registry (ADR-0005). Every read hook takes its key from
 * here, and every mutation invalidates by a family root — so invalidation is
 * always a prefix match, never a hand-written key string that can drift from the
 * read side. Later specs EXTEND this object (e.g. #5 adds inventory summaries);
 * nothing here is duplicated elsewhere.
 *
 * Convention: each family exposes `all` (the root array) used for prefix
 * invalidation, plus one factory per query returning a fresh key array. Keys are
 * arrays (React Query's preferred shape) so the root prefix-matches its children.
 */
export const qk = {
  staff: {
    all: ["staff"] as const,
    list: (opts?: { search?: string }) => ["staff", "list", opts ?? {}] as const,
  },
  products: {
    all: ["products"] as const,
    list: (opts?: { search?: { text?: string; code?: string; category?: string } }) =>
      ["products", "list", opts ?? {}] as const,
  },
  records: {
    all: ["records"] as const,
    list: (filter?: RecordFilter) => ["records", "list", filter ?? {}] as const,
    staffHistory: (staffId: string) => ["records", "staffHistory", staffId] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    shopAggregate: () => ["inventory", "shopAggregate"] as const,
    staffSummaries: () => ["inventory", "staffSummaries"] as const,
    staff: (staffId: string) => ["inventory", "staff", staffId] as const,
    balance: (staffId: string, productId: string) =>
      ["inventory", "balance", staffId, productId] as const,
  },
  dailyFlow: {
    all: ["dailyFlow"] as const,
    flow: (filter?: DailyFlowFilter) => ["dailyFlow", "flow", filter ?? {}] as const,
  },
} as const;
