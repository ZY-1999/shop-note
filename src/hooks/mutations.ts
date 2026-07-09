import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useMutationQueue, useRepos } from "@/providers/providers";
import type { StaffCreateInput, Staff } from "@/data/staff";
import type { StockRecordCreateInput, RecordWithItems } from "@/data/stock-record";
import { qk } from "@/hooks/query-keys";

/**
 * Mutations (ADR-0005). Each mutation's `mutationFn` runs through the
 * write-serialization gate (`useMutationQueue`) so concurrent `useMutation`s
 * never nest a `BEGIN` inside `ExpoSqliteAdapter.withTransaction`'s
 * non-reentrant transaction. `onSuccess` invalidates the family root, so every
 * read hook under it refetches — no caller-side refetch anywhere.
 *
 * This file owns `useCreateStaff` as the canonical pattern. Each feature spec
 * adds its own mutation in the same shape (e.g. #6 → `useCreateStockRecord`).
 */

export function useCreateStaff(): UseMutationResult<Staff, Error, StaffCreateInput> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Staff, Error, StaffCreateInput>({
    mutationFn: (input) => queue.run(() => repos.staff.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
    },
  });
}

/**
 * Post a movement into the ledger (spec #06). Runs the repo's atomic
 * snapshot-and-insert through the serialization gate; on success, invalidates
 * every read family a movement can change — records, inventory (covers
 * shopAggregate / staff / staffSummaries / balance) and dailyFlow — by family
 * root, so the 记账 row (#5) and 汇总 (#8) read the new balance with no manual
 * refresh. Not audited on create (PRD).
 */
export function useCreateStockRecord(): UseMutationResult<RecordWithItems, Error, StockRecordCreateInput> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<RecordWithItems, Error, StockRecordCreateInput>({
    mutationFn: (input) => queue.run(() => repos.stockRecords.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.records.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
    },
  });
}
