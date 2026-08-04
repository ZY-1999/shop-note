import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useMutationQueue, useRepos } from "@/providers/providers";
import { useToast } from "@/components/toast";
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
import type { Cents } from "@/data/primitives";
import type { SummaryExportSheets } from "@/data/config";
import { qk } from "@/hooks/query-keys";

/**
 * Mutations (ADR-0005). Each mutation's `mutationFn` runs through the
 * write-serialization gate (`useMutationQueue`) so concurrent `useMutation`s
 * never nest a `BEGIN` inside `ExpoSqliteAdapter.withTransaction`'s
 * non-reentrant transaction. `onSuccess` invalidates the family root, so every
 * read hook under it refetches — no caller-side refetch anywhere.
 *
 * Every mutation also surfaces outcome feedback via the toast bubble
 * ([toast.tsx](../components/toast.tsx)): a success message on commit, and the
 * repo's own error message on throw — so a failed save is never silent.
 *
 * This file owns `useCreateStaff` as the canonical pattern. Each feature spec
 * adds its own mutation in the same shape (e.g. #6 → `useCreateStockRecord`).
 */

export function useCreateStaff(): UseMutationResult<Staff, Error, StaffCreateInput> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Staff, Error, StaffCreateInput>({
    mutationFn: (input) => queue.run(() => repos.staff.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
      toast.success("会员已创建");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<Staff, Error, { staffId: string; patch: StaffUpdatePatch }>({
    mutationFn: ({ staffId, patch }) => queue.run(() => repos.staff.update(staffId, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
      toast.success("会员已更新");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<Staff, Error, string>({
    mutationFn: (staffId) => queue.run(() => repos.staff.void(staffId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
      toast.success("会员已作废");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Restore a voided staff (spec #09) — clears voided_at; reappears in selectors. */
export function useRestoreStaff(): UseMutationResult<Staff, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Staff, Error, string>({
    mutationFn: (staffId) => queue.run(() => repos.staff.restore(staffId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.staff.all });
      toast.success("会员已恢复");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<Product, Error, ProductCreateInput>({
    mutationFn: (input) => queue.run(() => repos.products.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
      toast.success("商品已创建");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<Product, Error, { productId: string; patch: ProductUpdatePatch }>({
    mutationFn: ({ productId, patch }) => queue.run(() => repos.products.update(productId, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      toast.success("商品已更新");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Void a product (spec #09) — drops from pickers; record snapshots stay intact. */
export function useVoidProduct(): UseMutationResult<Product, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Product, Error, string>({
    mutationFn: (productId) => queue.run(() => repos.products.void(productId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      toast.success("商品已作废");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Restore a voided product (spec #09) — re-selectable in pickers. */
export function useRestoreProduct(): UseMutationResult<Product, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Product, Error, string>({
    mutationFn: (productId) => queue.run(() => repos.products.restore(productId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      toast.success("商品已恢复");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<RecordWithItems, Error, StockRecordCreateInput>({
    mutationFn: (input) => queue.run(() => repos.stockRecords.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.records.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
      toast.success("记录已保存");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<RecordWithItems, Error, { recordId: string; patch: StockRecordUpdatePatch }>({
    mutationFn: ({ recordId, patch }) => queue.run(() => repos.stockRecords.update(recordId, patch)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.records.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
      toast.success("记录已保存");
    },
    onError: (e: Error) => toast.error(e.message),
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
  const toast = useToast();
  return useMutation<RecordWithItems, Error, string>({
    mutationFn: (recordId) => queue.run(() => repos.stockRecords.void(recordId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.records.all });
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
      toast.success("记录已作废");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Top up a member (stock-balance-refactor). Money-in is audited; onSuccess
 * invalidates the member's balance + the top-up history + the综合流水
 * (dailyFlow now includes top-ups, spec 05) so 记账 / staff-detail / 汇总
 * re-read immediately.
 */
export function useCreateTopup(): UseMutationResult<Topup, Error, TopupCreateInput> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Topup, Error, TopupCreateInput>({
    mutationFn: (input) => queue.run(() => repos.topups.create(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.topups.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
      toast.success("充值成功");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Void a top-up (soft-delete + audit); balance + 综合流水 recompute on the next read. */
export function useVoidTopup(): UseMutationResult<Topup, Error, string> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Topup, Error, string>({
    mutationFn: (topupId) => queue.run(() => repos.topups.void(topupId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.topups.all });
      void queryClient.invalidateQueries({ queryKey: qk.balance.all });
      void queryClient.invalidateQueries({ queryKey: qk.dailyFlow.all });
      toast.success("充值已作废");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Update the global unit price (stock-balance-refactor). Audited; invalidates
 * qk.config so `useUnitPrice` refetches. New checkouts freeze the new price;
 * existing records keep their own snapshots (snapshot铁律 — no re-freeze).
 */
export function useUpdateUnitPrice(): UseMutationResult<void, Error, Cents> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<void, Error, Cents>({
    mutationFn: (amount) => queue.run(() => repos.config.setUnitPrice(amount)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.config.all });
      toast.success("单价已保存");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Persist summary-export sheet selection (no success toast — silent instant save). */
export function useUpdateSummaryExportSheets(): UseMutationResult<
  void,
  Error,
  SummaryExportSheets
> {
  const repos = useRepos();
  const queue = useMutationQueue();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (sheets) =>
      queue.run(() => repos.config.setSummaryExportSheets(sheets)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.config.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
