# 管理 tab — staff & product CRUD (search, soft-delete/restore, price revaluation)

Type: spec
Status: ready-for-human # Stage 2 implemented 2026-07-09 — RED→GREEN via /tdd; evidence below
Parent: #01
Blocked by: #3, #4

## Goal

The management tab: a staff|product toggle over two CRUD domains — staff (create/edit/search/soft-delete/restore) and products (same, plus ~1000-entry search and cost-price editing that instantly revalues all current inventory). This is where master data is maintained; everything created here becomes selectable in 记账 (#5/#6), and a price change here reflows through 记账 summaries (#5) and 汇总 (#8) automatically.

## Acceptance criteria

- [ ] A staff|product toggle switches the two domains; each shows a searchable list + create entry — proves the 管理 information architecture (stories 22, 27; PRD).
- [ ] **Staff**: create (name/phone/notes) → the staff appears in 记账 search/selectors; edit → changes reflected app-wide; **void** → the staff disappears from new-transaction selectors but history is preserved; **restore** → reappears — proves the full staff CRUD + soft-delete/restore loop (stories 22–26).
- [ ] **Product**: create (title/price/optional code/category) → appears and is selectable in the record form (#6); searchable by title/code/category across ~1000 entries (FlatList + repo `search`) — proves product CRUD + multi-axis search (stories 27, 28, 32).
- [ ] Editing a product's `purchase_price` → 记账 staff summaries (#5) and 汇总 amounts (#8) reflect the new price × balance on the next read, with no manual recompute — proves instant cost revaluation driven from 管理 (stories 9, 29).
- [ ] **Product void** → excluded from new records' product pickers; existing record snapshots stay intact; **restore** → re-selectable — proves product soft-delete/restore with snapshot preservation (stories 30, 31).

## Scope

- **In**: the 管理 screen + staff|product toggle; staff list/search + staff create/edit form + void/restore; product list/search + product create/edit form + void/restore; the staff/product mutation hooks (`useCreateStaff` reused from #3; add `useUpdateStaff` / `useVoidStaff` / `useRestoreStaff` and the four product equivalents) — all serialized via #3's gate, invalidating the right keys; `MoneyText` reuse (#5); preserves the 管理 dev-only smoke region (#4).
- **Out**: the record form / edit / void (#6/#7); 汇总 (#8); the repos' CRUD internals (already shipped); adding a hard delete (forbidden — PRD); the audit-log viewing screen (out of scope).

## Context

- `StaffRepository` + `ProductRepository` ([src/data/staff.ts](../../../../src/data/staff.ts) / [product.ts](../../../../src/data/product.ts)): `create` / `update` / `void` / `restore` / `search`, all audit-wired, soft-delete via `voided_at`. **Staff** excludes voided via `listActive()` / `search()` / `list()` (the latter two filter in memory); **ProductRepository has no `listActive()`** (see the note at [behavior-script.ts:58](../../../../src/data/smoke/behavior-script.ts#L58)) — products exclude voided via `list()` / `search({})`, which filter `voided_at` in memory. Either way a voided staff/product drops out of selectors automatically.
- Cost revaluation is implicit (ADR-0002 / inventory.ts): derived amounts read the product's **current** price, so a `product.update({ purchase_price })` + invalidation of `qk.inventory` revalues 记账/汇总 on next read — no recompute step.
- Hooks/gate/query-keys from #3; `MoneyText`/theme from #5; nav from #4. Product search over ~1000 rows uses FlatList + the repo's in-memory `search`; FlashList only if measured slow (ADR-0005).
- The 管理 dev-only smoke entry (#4) stays put; this spec thickens the 管理 tab around it.

## Design

- **Interface delta** — two CRUD domains behind one tab:
  ```ts
  // staff mutations (useCreateStaff from #3; rest added here, same pattern)
  useUpdateStaff(), useVoidStaff(), useRestoreStaff()
  // product mutations (same pattern)
  useCreateProduct(), useUpdateProduct(), useVoidProduct(), useRestoreProduct()
  // each: gate.run(() => repo.<op>(...)); onSuccess invalidate qk.<entity>.* (staff/product) +, for a product price change, qk.inventory (prefix — covers staffSummaries, revalues 记账/汇总)
  <ManageTab />   // toggle staff|product; list+search; create/edit forms; void/restore
  ```
- **Internal architecture**:
  - **Toggle + lists** — segmented staff|product; each list is a search bar (`useStaff({search})` / `useProducts({search})`) + FlatList of rows. Rows show name/phone (staff) or title/price/code/category (product, amount via `MoneyText`), with edit / void actions; a voided-state affordance exposes restore.
  - **Forms** — staff form (name/phone/notes) and product form (title/`purchase_price` as Cents, optional code/category), controlled, pre-submit validation (title/name required; price is a Cents integer — `cents()` rejects floats at the boundary, [primitives.ts](../../../../src/data/primitives.ts)). Product price input parses user 元-input to Cents. Same form pattern as #6.
  - **Soft-delete/restore** — void sets `voided_at`; because every selector/search uses `list()`/`listActive()`/`search()` (which exclude voided), a voided staff/product automatically drops out of 记账 selectors (#5/#6) with no extra wiring — the repo's default filter is the mechanism. Restore clears `voided_at`; reappears. History/snapshots are never erased (PRD: no hard delete).
  - **Price revaluation** — `useUpdateProduct` (price change) invalidates `qk.inventory` (prefix — covers `staffSummaries`) in addition to `qk.products`; since derived amounts read current price, 记账 summaries + 汇总 revalue on next read. This is the one cross-entity invalidation (product write → inventory read) — centralize it in the product mutation's `onSuccess`.
  - **Deep-module note**: 管理 is two parallel CRUD shapes sharing one form/list pattern; the soft-delete "disappears from selectors" behavior is delegated to the repos' voided-exclusion (not reimplemented in UI). Keep the UI a thin CRUD shell over the repos.

## Rework on failure

CRUD is isolated to 管理 + its mutation hooks; repos are unchanged. A voided item still appearing in a selector means that selector isn't using a voided-excluding read — fix the selector's query, not 管理. A price change not revaluing = a missing key in `useUpdateProduct`'s invalidation — one place.

---

## Stage 2 evidence (implemented 2026-07-09)

`npx jest` → 172 passed / 26 suites (both projects); `npx tsc --noEmit` → exit 0.

- **AC1 (staff|product toggle + searchable list + create entry)** → `src/components/manage-tab.test.tsx` "toggles between the staff and product domains" (seg-staff/seg-product swap view-staff↔view-product) + "lists products and narrows by title search" (`product-search` narrows `manage-product-${id}`). GREEN.
- **AC2 (staff create/edit/void/restore)** → "creates a staff who then appears in the list" (`useCreateStaff` invalidates qk.staff → list refetches, 李四 appears) + "blocks create when the name is empty" (请输入姓名) + "voids a staff then restores them" (void → 已作废, `voided_at` set, drops from `list()` active; restore → `voided_at` null). GREEN.
- **AC3 (product create + multi-axis search)** → "creates a product (title + 元-price → Cents)" (2.5 元 → 250 分 via `cents(Math.round(yuan*100))`; code carried) + "blocks product create when the title is empty" (请输入名称). `useProducts` search uses the repo's in-memory `search({text})`. GREEN.
- **AC4 (price edit revalues inventory on next read)** → "editing a product's price reflows the open balance" (a test-only `<InventoryReader>` mounts `useBalance` under the same queryClient as ManageTab; edit 可乐 300¢→700¢ via `product-edit`→`product-price-input`; `useUpdateProduct` invalidates `qk.inventory` → balance refetches, qty stays 4). The one cross-entity invalidation (product write → inventory read) centralized in `useUpdateProduct.onSuccess`. GREEN.
- **AC5 (product void/restore + snapshot preservation)** → "voids a product then restores it; record snapshots stay intact" (void → drops from `list()` active, 已作废; the record's frozen item snapshot `title/qty/unit_price` untouched across the void; restore → re-selectable). Soft-delete is delegated to the repos' `voided_at` exclusion — no selector-side wiring. GREEN.

**Mutations added** (`src/hooks/mutations.ts`): `useUpdateStaff` / `useVoidStaff` / `useRestoreStaff` / `useCreateProduct` / `useUpdateProduct` / `useVoidProduct` / `useRestoreProduct` — all gate-serialized via `useMutationQueue`; each invalidates `qk.staff.all` / `qk.products.all`, and `useUpdateProduct` additionally invalidates `qk.inventory.all` (the cost-revalue path). `useStaff` / `useProducts` extended with `includeVoided` so the manage list can show voided rows + a restore affordance.

**RNTL v14 + React 19 act lesson (won this spec)**: `fireEvent.press`/`changeText` are `async` in RNTL v14 (each wraps `await act(...)`). Two consecutive un-awaited `fireEvent` calls open overlapping act scopes that corrupt the NEXT test's render ("overlapping act() calls" → empty trees → `Unable to find seg-staff`). Fix: `await` every `fireEvent.*` — never chain two bare. Documented in [manage-tab.test.tsx](../../../src/components/manage-tab.test.tsx) AC2.

**Device-pending**: jest/RNTL prove behavior through the real data stack (ADR-0006); the segmented-control + form + void/restore interactions on device remain device-confirmed-pending (same posture as #04–#08).

Commit: see `feat(manage): 管理 tab — staff & product CRUD + price revaluation (#09)` (this spec's Stage 2 commit).
