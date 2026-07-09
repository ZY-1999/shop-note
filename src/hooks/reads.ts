import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRepos } from "@/providers/providers";
import type { Aggregate, Balance, StaffSummary } from "@/data/inventory";
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

export function useStaff(opts?: { search?: string }): UseQueryResult<Staff[]> {
  const repos = useRepos();
  return useQuery<Staff[]>({
    queryKey: qk.staff.list(opts),
    queryFn: () => (opts?.search ? repos.staff.search({ text: opts.search }) : repos.staff.list()),
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
  opts?: { search?: { text?: string; code?: string; category?: string } },
): UseQueryResult<Product[]> {
  const repos = useRepos();
  return useQuery<Product[]>({
    queryKey: qk.products.list(opts),
    queryFn: () => (opts?.search ? repos.products.search(opts.search) : repos.products.list()),
  });
}

export function useStockRecords(filter?: RecordFilter): UseQueryResult<RecordWithItems[]> {
  const repos = useRepos();
  return useQuery<RecordWithItems[]>({
    queryKey: qk.records.list(filter),
    queryFn: () => repos.stockRecords.list(filter),
  });
}

export function useShopAggregate(): UseQueryResult<Aggregate[]> {
  const repos = useRepos();
  return useQuery<Aggregate[]>({
    queryKey: qk.inventory.shopAggregate(),
    queryFn: () => repos.inventory.shopAggregate(),
  });
}

/** Per-staff holding rollup for the 记账 list + 汇总 by-staff view (one ledger pass). */
export function useStaffSummaries(): UseQueryResult<StaffSummary[]> {
  const repos = useRepos();
  return useQuery<StaffSummary[]>({
    queryKey: qk.inventory.staffSummaries(),
    queryFn: () => repos.inventory.staffSummaries(),
  });
}

export function useStaffInventory(staffId: string): UseQueryResult<Balance[]> {
  const repos = useRepos();
  return useQuery<Balance[]>({
    queryKey: qk.inventory.staff(staffId),
    queryFn: () => repos.inventory.staffInventory(staffId),
  });
}

export function useBalance(
  staffId: string,
  productId: string,
): UseQueryResult<{ qty: number; cost_amount: number }> {
  const repos = useRepos();
  return useQuery({
    queryKey: qk.inventory.balance(staffId, productId),
    queryFn: () => repos.inventory.balance(staffId, productId),
  });
}

export function useDailyFlow(filter?: DailyFlowFilter): UseQueryResult<DailyFlowRow[]> {
  const repos = useRepos();
  return useQuery<DailyFlowRow[]>({
    queryKey: qk.dailyFlow.flow(filter),
    queryFn: () => repos.dailyFlow.flow(filter),
  });
}
