import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useMutationQueue, useRepos } from "@/providers/providers";
import type { StaffCreateInput, StaffUpdatePatch, Staff } from "@/data/staff";
import type {
  ProductCreateInput,
  ProductUpdatePatch,
  Product,
} from "@/data/product";
import type {
  StockRecordCreateInput,
  StockRecordUpdatePatch,
  RecordWithItems,
} from "@/data/stock-record";
import type { Topup, TopupCreateInput } from "@/data/topup";
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
 * Edit a staff's name/phone/notes (spec #09). Gate-serialized; invalidates
 * qk.staff so every staff read (selectors, summaries, the manage list) refetches
 * the new values app-wide.
 */
export function useUpdateStaff(): UseMutationResult<Staff, Error, { staffId: string; patch: StaffUpdatePatch }> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Staff, Error, { staffId: string; patch: StaffUpdatePatch }>({
    mutationFn: ({ staffId, patch }) => queue.run(() => repos.staff.update(staffId, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
    },
  });
}

/**
 * Soft-delete (void) a staff (spec #09). Because every selector/search excludes
 * voided rows, a voided staff drops out of 记账 selectors automatically — no
 * extra wiring. History/snapshots are never erased (voided_at set, not deleted).
 * Invalidates qk.staff so the manage list (which shows voided + a restore
 * affordance) and every active-only read refetch.
 */
export function useVoidStaff(): UseMutationResult<Staff, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Staff, Error, string>({
    mutationFn: (staffId) => queue.run(() => repos.staff.void(staffId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
    },
  });
}

/** Restore a voided staff (spec #09) — clears voided_at; reappears in selectors. */
export function useRestoreStaff(): UseMutationResult<Staff, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Staff, Error, string>({
    mutationFn: (staffId) => queue.run(() => repos.staff.restore(staffId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
    },
  });
}

/**
 * Create a product (spec #09). Gate-serialized; invalidates qk.products so the
 * new product appears in the manage list and in 记账's product picker (#6).
 */
export function useCreateProduct(): UseMutationResult<Product, Error, ProductCreateInput> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Product, Error, ProductCreateInput>({
    mutationFn: (input) => queue.run(() => repos.products.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
    },
  });
}

/**
 * Edit a product (spec #09) — title/code/category, or crucially purchase_price.
 * A price change is the one CROSS-ENTITY invalidation: derived amounts
 * (inventory/shopAggregate — ADR-0002) read the product's CURRENT price, so
 * invalidating qk.inventory (prefix — covers shopAggregate) revalues 汇总 (#8)
 * on the next read, with no manual recompute. qk.products refetches the picker /
 * manage list.
 */
export function useUpdateProduct(): UseMutationResult<
  Product,
  Error,
  { productId: string; patch: ProductUpdatePatch }
> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Product, Error, { productId: string; patch: ProductUpdatePatch }>({
    mutationFn: ({ productId, patch }) => queue.run(() => repos.products.update(productId, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
    },
  });
}

/** Void a product (spec #09) — drops from pickers; record snapshots stay intact. */
export function useVoidProduct(): UseMutationResult<Product, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Product, Error, string>({
    mutationFn: (productId) => queue.run(() => repos.products.void(productId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
    },
  });
}

/** Restore a voided product (spec #09) — re-selectable in pickers. */
export function useRestoreProduct(): UseMutationResult<Product, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Product, Error, string>({
    mutationFn: (productId) => queue.run(() => repos.products.restore(productId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
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
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
    },
  });
}

/**
 * Edit a posted record (spec #07). Runs the repo's resnapshot-merge through the
 * gate; invalidates the same families as create (records detail/list/history,
 * inventory, dailyFlow) so the detail re-reads the new snapshots and every
 * balance/flow view refreshes. The UI's contract is "send the edited lines, each
 * with its stable `id`" — the repo's merge decides touched (resnapshot) vs
 * untouched (keep snapshot) from those ids.
 */
export function useUpdateStockRecord(): UseMutationResult<
  RecordWithItems,
  Error,
  { recordId: string; patch: StockRecordUpdatePatch }
> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<RecordWithItems, Error, { recordId: string; patch: StockRecordUpdatePatch }>({
    mutationFn: ({ recordId, patch }) => queue.run(() => repos.stockRecords.update(recordId, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.records.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
    },
  });
}

/**
 * Void a posted record (spec #07) — soft-delete (sets voided_at; items never
 * erased). Same gate + invalidation as update: the record stays viewable via
 * `getById` (returns voided) but drops out of every derived balance/flow on the
 * next read. Audited atomically as 'void' by the repo.
 */
export function useVoidStockRecord(): UseMutationResult<RecordWithItems, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<RecordWithItems, Error, string>({
    mutationFn: (recordId) => queue.run(() => repos.stockRecords.void(recordId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.records.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
    },
  });
}

/**
 * Top up a member (stock-balance-refactor). Money-in is audited; onSuccess
 * invalidates the member's balance + the top-up history so 记账 / staff-detail
 * re-read immediately. `qk.dailyFlow` is NOT invalidated here — dailyFlow does
 * not include top-ups until spec 05 extends it, so the invalidate would be a
 * no-op now and lands with spec 05.
 */
export function useCreateTopup(): UseMutationResult<Topup, Error, TopupCreateInput> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Topup, Error, TopupCreateInput>({
    mutationFn: (input) => queue.run(() => repos.topups.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.topups.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
    },
  });
}

/** Void a top-up (soft-delete + audit); balance recomputes on the next read. */
export function useVoidTopup(): UseMutationResult<Topup, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  return useMutation<Topup, Error, string>({
    mutationFn: (topupId) => queue.run(() => repos.topups.void(topupId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.topups.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
    },
  });
}
