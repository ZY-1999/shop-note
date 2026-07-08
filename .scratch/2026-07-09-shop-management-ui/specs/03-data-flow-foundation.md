# Data-flow foundation — Repos Context + React Query + read hooks + write-serialization gate + RNTL harness

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-09 — adversarial review PASS (cfd1fa6), human approved the 9-spec breakdown; entering Stage 2 (/tdd)
Parent: #01
Blocked by: #2

## Goal

The vertical tracer bullet that proves the entire data-flow stack: a React Context holds the `Repos` (#2), React Query drives reads/writes, and a serialization gate keeps concurrent mutates from nesting the non-reentrant `withTransaction` — all testable through a new React Native Testing Library + jest-expo harness backed by the real `InMemoryAdapter`. After this spec, every later UI screen is "just" a consumer of `useRepos()` + a hook, and every UI spec has a working component-test layer.

## Acceptance criteria

- [ ] A consumer rendered via `renderWithProviders` (real `InMemoryAdapter`, seeded) that calls `useStaff()` shows the seeded staff name — proves the full vertical: `ReposProvider` → `useRepos()` → React Query → repo → render (stories 1, 3, 5; ADR-0005).
- [ ] Firing `useCreateStaff` (the pattern mutation) then waiting → the staff list re-renders with the new name, with no manual refetch — proves the write→`invalidateQueries`→refresh loop (stories 12, 25; ADR-0005).
- [ ] The serialization gate, unit-tested directly: two async tasks enqueued together never run concurrently (the second starts only after the first resolves) — proves mutates serialize, the preventive guard for `withTransaction`'s non-reentrancy (ADR-0005/codemap risk).
- [ ] `renderWithProviders` gives each test a fresh `InMemoryAdapter` + fresh `QueryClient` (no state, no cache leakage between tests) — proves test isolation; a second test sees no first test's data (ADR-0006).
- [ ] Jest coexistence: the 11 existing data-layer suites still run under the node/ts-jest project; the new UI suite runs under the jest-expo project — `npm test` runs both, all green (ADR-0006).
- [ ] QueryClient defaults reflect local-only data: a focus/visibility event does NOT trigger a refetch (no network, data changes only via our mutates) — proves the no-spurious-refetch config (ADR-0005).

## Scope

- **In**: `src/data/composition.ts` is consumed (from #2); a React provider module (`src/app/providers.tsx` or `src/hooks/providers.tsx`) — `AppProviders` (wraps `ReposProvider` + `QueryClientProvider`), `useRepos()`, a `createQueryClient()` factory, a query-key factory; read hooks (`useStaff` / `useProducts` / `useStockRecords` / `useShopAggregate` / `useStaffInventory` / `useBalance` / `useDailyFlow`) with list/search/filter/staff variants; a write-serialization gate + `useCreateStaff` as the canonical mutation pattern (create + invalidate); the jest-expo/RNTL test harness (`renderWithProviders` + jest config `projects` split); a tracer component + its RNTL test.
- **Out**: production DB boot / splash / error screen (that is #4 — this provider takes an already-built `Repos` prop, adapter-agnostic); navigation / tabs (#4); any feature screen beyond the tracer; feature-specific mutations beyond `useCreateStaff` (each feature spec owns its own — e.g. #6 owns `useCreateStockRecord`); UI styling / `MoneyText` (#5).

## Context

- ADR-0005 (Accepted): composition root = React Context (`useRepos()`) + React Query (`useQuery`/`useMutation` + `onSuccess` invalidate); derived reads stay pure/unstored (ADR-0002); `ExpoSqliteAdapter.withTransaction` is **not reentrant** → hook-triggered writes must serialize.
- ADR-0006 (Accepted): UI component tests via RNTL + real `InMemoryAdapter` (do NOT mock Repos), driven from user actions; needs `jest-expo` + `@testing-library/react-native` (not yet installed); version compat with React 19.2 / RN 0.86 / Expo 57 is a spec-stage task.
- Repos + `setupRepos` live in `src/data/composition.ts` after #2; repo API surfaces: `StaffRepository` / `ProductRepository` / `StockRecordRepository` / `Inventory` / `DailyFlow` ([src/data/](../../../../src/data/)).
- Current [jest.config.js](../../../../jest.config.js) is node-only ts-jest (`testMatch src/**/*.test.ts`) for the data layer; RNTL needs the jest-expo preset (RN test environment). PRD flags the version-compat risk.
- `@expo/ui` is installed; `@tanstack/react-query`, `@testing-library/react-native`, `jest-expo` are the dependency increments (PRD 补充说明).
- React Compiler is on ([app.json](../../../../app.json)) — hooks/components follow rules-of-react; React Query is compatible.

## Design

- **Interface delta** — the shared seam every UI consumer reads through:
  ```ts
  // providers
  <AppProviders repos={repos} queryClient?: QueryClient>{children}</AppProviders>
  useRepos(): Repos                      // throws if used outside AppProviders
  createQueryClient(): QueryClient       // shared defaults (see below)

  // query keys — ONE factory (the single registry); invalidation is by prefix
  // (invalidateQueries({ queryKey: qk.inventory._ }) covers every inventory-family key).
  // Later specs EXTEND this registry — e.g. #5 adds qk.inventory.staffSummaries().
  qk.staff.list({ search }) / qk.products.list({ search }) / qk.records.list(filter) /
  qk.records.staffHistory(staffId) / qk.inventory.shopAggregate() / qk.inventory.staff(staffId) /
  qk.inventory.balance(staffId, productId) / qk.dailyFlow.flow(filter)

  // read hooks — each a STANDALONE useQuery over the matching key (rules-of-react clean;
  // do NOT bundle several useQuery calls behind one callable object — React Compiler is on).
  useStaff(opts?: { search?: string }): UseQueryResult<Staff[]>
  useProducts(opts?: { search?: { text?; code?; category? } }): UseQueryResult<Product[]>
  useStockRecords(filter?: RecordFilter): UseQueryResult<RecordWithItems[]>
  useShopAggregate(): UseQueryResult<Aggregate[]>
  useStaffInventory(staffId): UseQueryResult<Balance[]>
  useBalance(staffId, productId): UseQueryResult<{ qty: number; cost_amount: number }>
  useDailyFlow(filter?: DailyFlowFilter): UseQueryResult<DailyFlowRow[]>

  // write path — serialized
  useCreateStaff(): UseMutationResult  // mutationFn runs through the gate; onSuccess invalidates qk.staff.*
  ```
- **Internal architecture**:
  - **Provider** — `ReposProvider` holds the `Repos` (passed in, already built) in a Context; `useRepos()` reads it. `AppProviders` wraps `ReposProvider` + `QueryClientProvider`. **Deliberate split**: this provider is adapter-agnostic and synchronous (repos as a prop); the production async-open/splash/error wiring lives in #04's `AppProvider`, which builds the ExpoSqlite `Repos` and renders `<AppProviders repos={...}>`. Tests do the same with an InMemory `Repos`. One Context, two ways to populate it — no test/prod seam drift.
  - **QueryClient defaults** — local-only data changes solely through our mutations (which invalidate), so: `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnMount: false`, `retry: false`. Rationale: there is no remote source to refetch from; a value is fresh until a local mutate invalidates it. This is what lets derived reads (inventory/dailyFlow) stay "pure + recomputed" (ADR-0002) without stale windows.
  - **Write-serialization gate** — a serial queue (a promise chain) owned by the provider context (`useMutationQueue()` / threaded through `useSerializedMutation`). Each mutation's `mutationFn` awaits the queue before touching the repo, so two rapid mutates execute strictly in order — never nesting `BEGIN`. React Query runs concurrent `useMutation`s by default, so this gate is mandatory, not optional. The gate is **unit-tested directly** as a serializing primitive (enqueue two tasks that record overlap, assert zero overlap) — because `InMemoryAdapter.withTransaction` happens to nest safely ([codemap](../../../../docs/codemap/project.md) risk note), the adapter-level failure it prevents is only observable on the real adapter (device smoke / ADR-0004); the gate's own contract (serial execution) is what's Jest-provable here.
  - **`useCreateStaff` pattern** — the one concrete mutation: `mutationFn = (input) => gate.run(() => repos.staff.create(input))`; `onSuccess` → `queryClient.invalidateQueries({ queryKey: qk.staff.all })`. Every feature-spec mutation (#6/#7/#9) follows this exact shape; this spec proves it once.
  - **Tracer** — a tiny `<StaffListTracer/>` reading `useStaff()` + a button firing `useCreateStaff`; its RNTL test is the acceptance proof above.

  **DESIGN-IT-TWICE (applied, not spawned) — the two real decisions:**
  1. *DI shape* — React Context (chosen, ADR-0005) vs module-level singleton. Singleton rejected: untestable, unreplaceable, splits test/prod wiring. Context wins: one `useRepos()`, InMemory in tests / ExpoSqlite in prod, no drift.
  2. *Jest coexistence* — `projects: [...]` split (data-layer node/ts-jest project + UI jest-expo project) vs one config with a universal preset. Single-config rejected: jest-expo's RN environment would force every data-layer suite into it (heavier, and the data layer is deliberately node-only per its harness doc-comment). `projects` split keeps the 11 suites untouched and adds RNTL alongside — each test file runs in its right environment by path.

  **Version lock (spec-stage task, PRD-flagged)**: pin `@tanstack/react-query`, `@testing-library/react-native`, `jest-expo` to versions compatible with React 19.2 / RN 0.86 / Expo 57 (resolve exact ranges before #03 build; if a compatible combination does not exist, surface it — it blocks every UI spec).

## Rework on failure

The foundation is additive (no existing UI to break; the data layer is untouched). If jest-expo/RNTL cannot coexist with the node data-layer config, isolate the UI tests behind the jest-expo project only and keep the data layer on its current config — the `projects` split makes that a config revert, not a redesign. If React Query's concurrency model changes the gate's necessity, the gate is one helper behind `useSerializedMutation` — localize there.
