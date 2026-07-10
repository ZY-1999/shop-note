import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRepos } from "@/providers/providers";
import type { Aggregate } from "@/data/inventory";
import type { Product } from "@/data/product";
import type { Staff } from "@/data/staff";
import type { DailyFlowRow } from "@/data/daily-flow";
import type { DailyFlowFilter } from "@/data/daily-flow";
import type { RecordFilter, RecordWithItems } from "@/data/stock-record";
import { qk } from "@/hooks/query-keys";

/**
 * Read hooks — each a standalone `useQuery` over its query key (ADR-0005).
 *
 * Rules-of-React clean: one hook = one `useQuery`, never several bundled behind
 * a callable object (React Compiler is on). Every later UI screen is just a
 * consumer of these + `useRepos()`. Derived reads (inventory / dailyFlow) stay
 * unstored (ADR-0002) — they recompute on every fetch because the QueryClient is
 * configured staleTime:Infinity + refetch-on-nothing, so a value is recomputed
 * only when a mutate invalidates its family.
 */

export function useStaff(opts?: { search?: string; includeVoided?: boolean }): UseQueryResult<Staff[]> {
  const repos = useRepos();
  return useQuery<Staff[]>({
    queryKey: qk.staff.list(opts),
    queryFn: () => {
      // search() always excludes voided (active-only); the unfiltered list honors
      // includeVoided so 管理 (#09) can show voided rows + a restore affordance.
      if (opts?.search) return repos.staff.search({ text: opts.search });
      return repos.staff.list({ includeVoided: opts?.includeVoided });
    },
  });
}

/** Single staff by id — the record form (#6) shows the name; staff detail (#7) reuses it. */
export function useStaffById(staffId: string): UseQueryResult<Staff | null> {
  const repos = useRepos();
  return useQuery<Staff | null>({
    queryKey: qk.staff.byId(staffId),
    queryFn: () => repos.staff.getById(staffId),
  });
}

export function useProducts(
  opts?: { search?: { text?: string; code?: string; category?: string }; includeVoided?: boolean },
): UseQueryResult<Product[]> {
  const repos = useRepos();
  return useQuery<Product[]>({
    queryKey: qk.products.list(opts),
    queryFn: () => {
      // search() always excludes voided; the unfiltered list honors includeVoided
      // so 管理 (#09) can show voided products + a restore affordance.
      if (opts?.search) return repos.products.search(opts.search);
      return repos.products.list({ includeVoided: opts?.includeVoided });
    },
  });
}

export function useStockRecords(filter?: RecordFilter): UseQueryResult<RecordWithItems[]> {
  const repos = useRepos();
  return useQuery<RecordWithItems[]>({
    queryKey: qk.records.list(filter),
    queryFn: () => repos.stockRecords.list(filter),
  });
}

/**
 * One record by id — the record detail view (#7). `getById` returns EVEN voided
 * records (so the detail stays viewable after a void), so this hook does too.
 * Invalidated under `qk.records.all` (prefix) by the update/void mutations.
 */
export function useStockRecordById(recordId: string): UseQueryResult<RecordWithItems | null> {
  const repos = useRepos();
  return useQuery<RecordWithItems | null>({
    queryKey: qk.records.byId(recordId),
    queryFn: () => repos.stockRecords.getById(recordId),
  });
}

export function useShopAggregate(): UseQueryResult<Aggregate[]> {
  const repos = useRepos();
  return useQuery<Aggregate[]>({
    queryKey: qk.inventory.shopAggregate(),
    queryFn: () => repos.inventory.shopAggregate(),
  });
}

export function useDailyFlow(filter?: DailyFlowFilter): UseQueryResult<DailyFlowRow[]> {
  const repos = useRepos();
  return useQuery<DailyFlowRow[]>({
    queryKey: qk.dailyFlow.flow(filter),
    queryFn: () => repos.dailyFlow.flow(filter),
  });
}
