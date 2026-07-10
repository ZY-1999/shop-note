# shop-note CodeMap (project)

## 1. Orientation

- Last updated: `2026-07-10`
- Updated: `2026-07-10` — summary day-collapse: each 流水 day section is now a **nested container card** mirroring the 库存卡 — the day card (`styles.card`) contains its header + staff cards, each staff card (`styles.staffCard`) contains its header + record lines; default collapsed (`openDays` set), header tap toggles, card height grows with `gap` when open. staff-row expand + batching unchanged. See `.scratch/2026-07-10-summary-day-collapse/`.
- Updated: `2026-07-10` — staff-detail containment: the 库存 section + each day section in `staff-detail.tsx` are now container cards (same `card`/`cardHead`/`cardTitle`/`subRow` family as summary), and day sections are collapsible (default collapsed, `openDays`) mirroring summary. See `.scratch/2026-07-10-staff-detail-containment/`.
- Updated: `2026-07-10` — nav-tweak: icon-only bottom tab bar + Chinese top headers driven by a single `src/navigation/tab-config.ts`; also retires the stale `unstable_native_tabs` risk note (the code already used stable `Tabs`).
- Updated: `2026-07-10` — page-refactor (#01–#05): shared `date-format.ts` helpers; bookkeeping row merged + 出单 copy; record-form chip/stepper/时间按钮化; staff-detail rebuilt (collapsible 库存 + day-grouped FlatList); **summary rewritten** from a four-segment switcher to a single time-range-scoped view (时间段 selector + as-of-now 库存卡 + day×staff 流水). See `.scratch/2026-07-10-page-refactor/`.
- Updated: `2026-07-09` — the production UI landed (specs #04–#09). The app is no longer the Expo template: a composition root opens `expo-sqlite` at boot (#04), and three real tabs consume the repositories through React Query — 记账 (bookkeeping: staff list + posting + staff/record detail / edit / void, #05–#07), 汇总 (summary: overview + daily flow + by-staff / by-product, #08), and 管理 (manage: staff & product CRUD + price revaluation, #09). Both ADR-0005 (UI layer architecture) and ADR-0006 (RNTL component testing) are recorded.
- Project: `shop-note` — Expo SDK 57 / React Native app (name from [app.json](../../../app.json), slug `shop-note`, scheme `shopnote`).
- Role / responsibility: **Production local-first shop management app.** A pure-TypeScript data layer (typed storage port, in-memory **and real `expo-sqlite`** adapters, versioned migrations, repositories, audit, derived inventory) is consumed by a React Query + RNTL UI across three tabs. On-device SQLite via `expo-sqlite`; no backend, no network calls, no cloud sync. Soft-delete everywhere (`voided_at`); history/snapshots are never erased (PRD: no hard delete).
- Main languages / frameworks: TypeScript + React 19.2, React Native 0.86, Expo SDK 57 (`expo-router` file-based routing, `expo-sqlite`, `expo-image`, `expo-symbols`, `expo-web-browser`, `react-native-reanimated` 4.5, `react-native-worklets`, `react-native-safe-area-context`); `@tanstack/react-query` v5 (read/write cache + serialization gate).
- Runtime / deployment shape: client-only RN app; iOS / Android / web (`web.output: static`). Persistence is on-device SQLite via `expo-sqlite` — no cloud sync.
- Primary entry types: app route screens (`src/app/*.tsx`) consumed by `expo-router/entry` ([package.json:3](../../../package.json#L3)).
- Confidence:
  - confirmed: app structure + 3-tab routing, theme system, composition root (`AppProvider`), the full `src/data/` layer, the React Query data-flow layer (`src/hooks/`, `src/providers/`), and the RNTL component test harness (`src/testing/`) — 26 Jest suites (ADR-0006).
  - inferred: device-confirmed-pending — jest/RNTL prove behavior through the real data stack, but on-device interaction (segmented controls, drill-downs, forms) is not yet device-verified (same posture across #04–#09).
  - unknown: none structural — domain vocabulary in [CONTEXT.md](../../../CONTEXT.md), decisions in [docs/adr/](../../../docs/adr/).

## 2. Context Tree

```text
Node: shop-note
  -> Node: Capability Index
  -> Node: Module Index
  -> Node: Entry Index
  -> Node: Domain And Data
  -> Node: External Dependencies
  -> Node: Cross-Module Flows
  -> Node: Validation
  -> Node: Risk Areas
```

### Node: shop-note

- Type: `project`
- Status: `confirmed`
- Purpose: orient any agent entering the repo — where routes, the composition root, the data-flow layer, and the data layer live.
- Read First:
  - [src/app/_layout.tsx](../../../src/app/_layout.tsx): root layout — ThemeProvider → `AppProvider` (composition root) → splash + `AppTabs`.
  - [src/providers/app-provider.tsx](../../../src/providers/app-provider.tsx): production composition root — opens `shop_note.db`, builds `Repos`, boot/error/retry shell (#04).
  - [src/providers/providers.tsx](../../../src/providers/providers.tsx): `AppProviders` — QueryClient + ReposProvider + MutationQueue (ADR-0005).
  - [src/hooks/query-keys.ts](../../../src/hooks/query-keys.ts): the single query-key registry — every read takes its key here, every mutation invalidates by family root.
  - [src/data/port.ts](../../../src/data/port.ts): the storage contract every repository is built on (single test seam).
- Edges / Children: the eight nodes below.
- Evidence: source files listed throughout; [package.json](../../../package.json) dependency set.
- Unknowns: none — domain vocabulary is captured in [CONTEXT.md](../../../CONTEXT.md); key decisions in [docs/adr/](../../../docs/adr/).
- Next Drill-Down: **Module Index** for layout, **Domain And Data** for the data + data-flow layers, **Cross-Module Flows** for the write→invalidation→refetch chain, **Risk Areas** for the adapter reentrancy constraint + the RNTL act lesson.

### Node: Capability Index

- Type: `capability`
- Status: `confirmed`
- Purpose: what the app *does* — three tabs of real shop-management capability over the repos.
- Children:
  - `bookkeeping` (#05–#07) — staff list + per-staff summary + posting form + staff/record detail (view / edit / void). Main modules: [staff-list-tracer.tsx](../../../src/components/staff-list-tracer.tsx), [record-form.tsx](../../../src/components/record-form.tsx), [staff-detail.tsx](../../../src/components/staff-detail.tsx), [record-detail.tsx](../../../src/components/record-detail.tsx). Entries: `bookkeeping` tab + `bookkeeping/staff/[id]` + `bookkeeping/record/[id]`. Feature CodeMap: pending. Status: `confirmed`.
  - `summary` (#08, rewritten #05/page-refactor) — a single time-range-scoped view: 时间段 selector (本月/上月/本周/上周) → 库存卡 (as-of-now `useShopAggregate`, range-independent) → 流水 (range-scoped `useDailyFlow` day×staff; each **day section is a collapsible card** default-collapsed, `openDays` set toggles on header tap; staff rows then expand to records via `useStockRecords`). Replaced the old four-segment switcher (overview/dailyFlow/byStaff/byProduct). Main module: [summary-tab.tsx](../../../src/components/summary-tab.tsx). Entry: `summary` tab. Feature CodeMap: pending. Status: `confirmed`.
  - `manage` (#09) — staff & product CRUD (search / create / edit / soft-delete / restore) + cost-price revaluation. Main module: [manage-tab.tsx](../../../src/components/manage-tab.tsx). Entry: `manage` tab. Feature CodeMap: pending. Status: `confirmed`.
  - `boot-shell` (#04) — production composition root: open DB → build Repos → splash/error/retry. Main module: [app-provider.tsx](../../../src/providers/app-provider.tsx). Status: `confirmed`.
  - `tab-navigation` — three-tab native navigator, icon-only bottom bar with Chinese top headers (nav-tweak). Main modules: [src/components/app-tabs.tsx](../../../src/components/app-tabs.tsx) + [src/navigation/tab-config.ts](../../../src/navigation/tab-config.ts). Status: `confirmed`.
  - `device-smoke` (dev-only) — cross-adapter equivalence proof, relocated under the 管理 tab (#04). Main module: [smoke-entry.tsx](../../../src/components/smoke-entry.tsx). Status: `confirmed` (ADR-0004).
- Evidence: route files + component imports traced from `_layout.tsx` → `AppTabs`.
- Validation: `npx jest` (26 suites); `expo start` → app boots through splash to 记账 tab.
- Next Drill-Down: when a feature needs its own map, promote it to `docs/codemap/<feature>.md`.

### Node: Module Index

- Type: `module`
- Status: `confirmed`
- Purpose: physical code layout under `src/`.
- Children:
  - `src/app/` — expo-router screens + root layout. Responsibility: routing; thin adapters over router-agnostic components. Three tab groups: `bookkeeping/` (index + `record-form` + `staff/[id]` + `record/[id]`), `summary/`, `manage/`. Each tab's `_layout.tsx` sets its screens' Chinese Stack-header titles (nav-tweak #2). Key deps: `expo-router`, `react-native-safe-area-context`. Tab identity + Chinese titles live in `src/navigation/tab-config.ts` (single source for the icon-only bar + top headers).
  - `src/navigation/` — [tab-config.ts](../../../src/navigation/tab-config.ts): the single source of truth for tab identity (name / Chinese title / Ionicons icon) + `recordFormTitle()`. Consumed by `AppTabs` (icon-only bottom bar, nav-tweak #1) and each tab's `_layout.tsx` (top Stack header). Key dep: `@expo/vector-icons`. Drift-tested by [tab-config.test.ts](../../../src/navigation/tab-config.test.ts) without rendering native `<Tabs>`/`<Stack>`.
  - `src/components/` — screen-level + presentational components. Responsibility: the business UI (`staff-list-tracer`, `staff-row`, `record-form`, `record-detail`, `staff-detail`, `summary-tab`, `manage-tab`, `money-text`, `smoke-entry`) + themed primitives (`ThemedText`, `ThemedView`, `animated-icon`). Components are router-agnostic (props for nav callbacks) so RNTL can test them with no router context (ADR-0006). Risk: several `.web.tsx` platform variants exist.
  - `src/providers/` — composition + DI. Responsibility: [app-provider.tsx](../../../src/providers/app-provider.tsx) (production: async-open `ExpoSqliteAdapter`, `setupRepos`, boot/error/retry) + [providers.tsx](../../../src/providers/providers.tsx) (`AppProviders`: QueryClient + ReposProvider + MutationQueue, adapter-agnostic, the test/prod seam). Key deps: `@tanstack/react-query`, `expo-sqlite`.
  - `src/hooks/` — the data-flow layer (ADR-0005). Responsibility: [reads.ts](../../../src/hooks/reads.ts) (one `useQuery` per read), [mutations.ts](../../../src/hooks/mutations.ts) (gate-serialized writes, family-root invalidation), [query-keys.ts](../../../src/hooks/query-keys.ts) (the single registry), [mutation-queue.ts](../../../src/hooks/mutation-queue.ts) (serialization gate), `use-theme.ts`. Key deps: `@tanstack/react-query`.
  - `src/testing/` — RNTL harness (ADR-0006). Responsibility: [render.tsx](../../../src/testing/render.tsx) (`renderWithProviders` — real `InMemoryAdapter`, never mocked Repos) + [async.ts](../../../src/testing/async.ts) (`waitForSync` / `flushPending` — the RNTL v14 + React 19 async helpers).
  - `src/constants/theme.ts` — theme tokens. Responsibility: `Colors` (light/dark), `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth`; side-effect imports `@/global.css`.
  - `src/data/` — local-first data layer (see **Domain And Data** node).
- Evidence: `find ./src` + source reads.
- Validation: `npx tsc --noEmit`; `expo lint`.
- Next Drill-Down: read a component before extending it; check for a sibling `.web.tsx`.

### Node: Entry Index

- Type: `entry`
- Status: `confirmed`
- Purpose: where execution / rendering begins.
- Entries:
  - App boot: `expo-router/entry` ([package.json:3](../../../package.json#L3)) → file routes in `src/app/`.
  - UI / routes:
    - `src/app/_layout.tsx` — root layout: `ThemeProvider` → `AppProvider` (opens `shop_note.db`, builds Repos) → `AnimatedSplashOverlay` + `AppTabs`.
    - `src/app/bookkeeping/index.tsx` → `bookkeeping` tab ("记账") — staff list + per-staff summary.
    - `src/app/bookkeeping/record-form.tsx` → posting form route.
    - `src/app/bookkeeping/staff/[id].tsx` → staff detail (holdings + history).
    - `src/app/bookkeeping/record/[id].tsx` → record detail (view / edit / void).
    - `src/app/summary/index.tsx` → `summary` tab ("汇总").
    - `src/app/manage/index.tsx` → `manage` tab ("管理").
  - Device smoke (dev-only): `SmokeEntry` ([smoke-entry.tsx](../../../src/components/smoke-entry.tsx), rendered under `__DEV__` inside `ManageTab`) → dynamic `import('@/data/smoke/run-smoke')` (see Cross-Module Flows).
  - CLI / commands: `npm start` (`expo start`), `npm run android|ios|web`, `npm run lint` ([package.json](../../../package.json)).
- Evidence: [package.json](../../../package.json) scripts + route files.
- Validation: `npm start` then press `a`/`i`/`w`.
- Next Drill-Down: expo-router file conventions (https://docs.expo.dev/versions/v57.0.0/) before adding routes — `typedRoutes` is on, so route names are type-checked.

### Node: Domain And Data

- Type: `object`
- Status: `confirmed`
- Purpose: domain objects, persistence, the derived read model, and the React Query data-flow layer that exposes them to the UI.
- Children:
  - **Storage port** — [src/data/port.ts](../../../src/data/port.ts): `StoragePort`, the single test seam — a dumb typed row-store (`withTransaction` / `insert` / `findById` / `update` / `find`), plus `HasId` and `Query`. No `remove` on the surface (PRD invariant: no hard deletes). `withTransaction` is **not reentrant** (see Risk Areas).
  - **Adapters** — [src/data/in-memory.ts](../../../src/data/in-memory.ts): `InMemoryAdapter` (used by every test; transactional rollback via snapshots). [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts): `ExpoSqliteAdapter` — the **production** adapter (spec #02), a thin executor over `sql-logic.ts`. `static open(name)` opens the DB, sets WAL, runs migrations. Verified by the device smoke (ADR-0004), **not** by Jest — the port is the single test seam.
  - **SQL logic + migrations** — [sql-logic.ts](../../../src/data/sql-logic.ts) (pure SQL generation; `SCHEMA` is the source of truth for the 5 tables) + [expo-sqlite-migration.ts](../../../src/data/expo-sqlite-migration.ts) (versioned DDL; no `FOREIGN KEY`/`UNIQUE` — ADR-0003). Zero `expo-sqlite` import → Jest-covered.
  - **Repositories** — [staff.ts](../../../src/data/staff.ts) + [product.ts](../../../src/data/product.ts): CRUD with soft-delete (`voided_at`) + restore, search, audit-wired via a shared `mutate()` template. [stock-record.ts](../../../src/data/stock-record.ts): posting freezes each line's `title` + `unit_price` snapshot; edit resnapshots touched lines (stable-id merge); void sets `voided_at` (items never erased).
  - **Audit** — [audit.ts](../../../src/data/audit.ts): `AuditProvider` — field-level diff on each mutate; read-only timeline query. Stock-record **create** is intentionally NOT audited (only edit/void are).
  - **Derived inventory** — [inventory.ts](../../../src/data/inventory.ts): `Inventory` — read-only projection; `balance` / `staffInventory` / `shopAggregate` / `staffSummaries` recomputed from the unvoided ledger every call (never stored → ADR-0002; instant cost revaluation against current price; negative qty allowed = 欠货). Reads product price via `getById` (returns voided products) so a voided product's historical balance persists.
  - **dailyFlow** — [daily-flow.ts](../../../src/data/daily-flow.ts): per-(day × staff) in/out flow from frozen `line_amount` snapshots (NOT current-price-revalued — the one place 汇总 diverges from the cost view).
  - **Composition** — [composition.ts](../../../src/data/composition.ts): `setupRepos(adapter)` — builds the repo set from an adapter; the one constructor path used by both `AppProvider` (production, `ExpoSqliteAdapter`) and tests (InMemoryAdapter).
  - **Data-flow layer (ADR-0005)** — [query-keys.ts](../../../src/hooks/query-keys.ts) (the single key registry; family roots for prefix invalidation), [reads.ts](../../../src/hooks/reads.ts) (one `useQuery` per read — standalone, rules-of-react clean), [mutations.ts](../../../src/hooks/mutations.ts) (each `mutationFn` runs through `MutationQueue` then invalidates by family root; `useUpdateProduct` is the one cross-entity invalidation — also hits `qk.inventory` so a price edit revalues 记账/汇总), [mutation-queue.ts](../../../src/hooks/mutation-queue.ts) (serializes writes so concurrent mutations never nest a `BEGIN`).
  - Config namespaces: `expo.*` in [app.json](../../../app.json) only.
- Evidence: the `src/data/` layer (port + 2 adapters + sql-logic + migrations + repos + audit + inventory + dailyFlow + composition + `smoke/`) + the `src/hooks/` + `src/providers/` data-flow layer; 26 Jest suites.
- Validation: `npx jest` covers every pure module against `InMemoryAdapter` AND every component through the real data stack (ADR-0006); the real `ExpoSqliteAdapter` is verified by the manually-triggered device smoke (ADR-0004).
- Next Drill-Down: read [port.ts](../../../src/data/port.ts) (the contract), then [query-keys.ts](../../../src/hooks/query-keys.ts) (the invalidation map), then [stock-record.ts](../../../src/data/stock-record.ts) (core write) + [inventory.ts](../../../src/data/inventory.ts) (deepest read).

### Node: External Dependencies

- Type: `dependency`
- Status: `confirmed`
- Purpose: what the app reaches outside its own code for — the Expo/RN platform, on-device SQLite, and React Query.
- Children:
  - Third-party SDKs (all Expo-managed, SDK 57 pinned): `expo-router`, `expo-image`, `expo-symbols`, `expo-web-browser`, `@expo/vector-icons`, `expo-sqlite`, `expo-device`, `expo-glass-effect`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-constants`, `expo-linking`; RN community: `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`. Data-flow: `@tanstack/react-query` v5, `@tanstack/query-core`. Test: `jest` (30), `jest-expo`, `@testing-library/react-native` v14, `ts-jest`. See [package.json](../../../package.json).
  - Storage / filesystem: on-device SQLite via `expo-sqlite` — `ExpoSqliteAdapter.open()` (WAL + versioned migrations) is the device store. Tests use `InMemoryAdapter`; the device smoke uses a dedicated `shop_note_smoke.db` so production data is never touched (ADR-0004).
  - Auth / network: none.
  - Observability: none.
- Edges:
  - used by: `AppProvider` → `expo-sqlite` (`openDatabaseAsync`); components → `useTheme` → `Colors` from [theme.ts](../../../src/constants/theme.ts); reads/mutations → `@tanstack/react-query`.
  - failure surfaces: boot hide relies on `expo-splash-screen` + `onLayout`; `AppProvider.onError` reveals a retryable error screen if the DB open fails (#04).
- Evidence: import statements in source + dependency list.
- Validation: boot animation completes → splash hides → 记账 renders; device smoke PASS confirms real SQLite round-trips.
- Next Drill-Down: when adding a backend/cloud-sync, add a row here and an ADR.

### Node: Cross-Module Flows

- Type: `flow`
- Status: `confirmed`
- Purpose: the runtime chains worth knowing before editing.
- Major Flows:
  - **App boot → composition root → splash → tabs** (#04)
    - Modules: `expo-router/entry` → `src/app/_layout.tsx` → `AppProvider` ([app-provider.tsx](../../../src/providers/app-provider.tsx)) opens `shop_note.db` + `setupRepos(ExpoSqliteAdapter)` ([composition.ts](../../../src/data/composition.ts)) → `AppProviders` ([providers.tsx](../../../src/providers/providers.tsx)) mounts QueryClient + ReposProvider + MutationQueue → `AnimatedSplashOverlay` + `AppTabs` ([app-tabs.tsx](../../../src/components/app-tabs.tsx)) → `bookkeeping`/`summary`/`manage` routes.
    - Entry: `SplashScreen.preventAutoHideAsync()` in `_layout.tsx`.
    - Effect: splash stays up through the async DB open (no blank flash); on error, `onError` hides the splash to reveal the retry screen.
    - Drill-Down: [src/providers/app-provider.tsx](../../../src/providers/app-provider.tsx).
  - **Write → invalidation → refetch (ADR-0005)** — the one data-flow pattern
    - Modules: a component's `useXxx().mutate(...)` ([mutations.ts](../../../src/hooks/mutations.ts)) → `MutationQueue.run(() => repo.<op>(...))` → onSuccess `queryClient.invalidateQueries({ queryKey: qk.<family>.all })` → every `useQuery` under that family prefix refetches on its own setTimeout → components rerender with new data. No caller-side refetch anywhere.
    - Entry: any mutation (e.g. `useCreateStockRecord` invalidates `qk.records` + `qk.inventory` + `qk.dailyFlow`; `useUpdateProduct` adds `qk.inventory` — the cost-revalue path).
    - Effect: a post/edit/void/price-change in one tab reflows every open view (汇总, staff detail) with no manual refresh.
    - Drill-Down: [src/hooks/query-keys.ts](../../../src/hooks/query-keys.ts) (the invalidation map) + [mutations.ts](../../../src/hooks/mutations.ts).
  - **Cross-adapter device smoke (dev-only)** — ADR-0004
    - Modules: `SmokeEntry` ([smoke-entry.tsx](../../../src/components/smoke-entry.tsx), under `__DEV__` in `ManageTab`) → dynamic `import('@/data/smoke/run-smoke')` → `runExpoSqliteSmoke()` ([run-smoke.ts](../../../src/data/smoke/run-smoke.ts)) → `ExpoSqliteAdapter.open("shop_note_smoke.db")` + `setupRepos()` vs an `InMemoryAdapter` repo set → per-step `stable()` compare.
    - Entry: 管理 tab → press "run expo-sqlite smoke".
    - Effect: behavior-script steps run against both adapters; each normalized snapshot is deep-compared, drift localizes to the diverging operation.
    - Drill-Down: [src/data/smoke/stable.ts](../../../src/data/smoke/stable.ts) + [docs/adr/0004-adapter-verification-device-smoke.md](../../../docs/adr/0004-adapter-verification-device-smoke.md).
- Evidence: traced import/call chains in source.
- Validation: post a record in 记账 → 汇总 revalues live; run the smoke on a device/sim → expect all PASS.
- Next Drill-Down: only if touching boot, the invalidation map, or the adapter's verification regime.

### Node: Validation

- Type: `validation`
- Status: `confirmed`
- Purpose: how to prove the app still works.
- Validation Entry:
  - Test commands: `npx jest` and `npx tsc --noEmit`.
  - Test projects (ADR-0006, [jest.config.js](../../../jest.config.js)): **data** (ts-jest, node env, `*.test.ts`) — the pure data layer; **ui** (jest-expo + RNTL, `*.test.tsx`) — components through the real `InMemoryAdapter`. 27 suites / 180 tests total.
  - RNTL harness: [render.tsx](../../../src/testing/render.tsx) mounts components under the real providers backed by a real `InMemoryAdapter` (never mocked Repos — only `expo-router` + native pickers are mocked). [async.ts](../../../src/testing/async.ts) provides `waitForSync` / `flushPending` — RNTL v14's `findBy*`/`waitFor` wrap each poll in `act`, which overlaps the next `fireEvent`'s act and leaks timers across tests; these helpers poll without act (see Risk Areas).
  - Lint: `npm run lint` (`expo lint`).
  - Local run: `npm start` → `a` / `i` / `w`.
  - Device smoke: 管理 tab → "run expo-sqlite smoke" → expect all PASS. The **only** coverage of real `expo-sqlite` execution — not CI, must be run manually before release (ADR-0004).
- Edges:
  - proves: the `src/data/` layer's pure behaviour + every UI component's behavior through the real data stack via Jest; the production adapter's behavioral equivalence via the device smoke.
  - does not prove: real-adapter execution is proven only by the manual device smoke; on-device interaction (segmented controls, drill-downs, forms) is device-confirmed-pending.
- Evidence: [jest.config.js](../../../jest.config.js); ADR-0004 (pure logic → Jest, adapter execution → device smoke) + ADR-0006 (component testing through the real adapter).
- Next Drill-Down: Jest test imports come from `@jest/globals` (Expo's `moduleDetection:force` breaks `@types/jest` env globals); `waitForSync` / `flushPending` are the sanctioned async helpers — see [async.ts](../../../src/testing/async.ts) header for the RNTL v14 + React 19 rationale.

### Node: Risk Areas

- Type: `risk`
- Status: `confirmed`
- Purpose: terrain facts that can bite the next edit.
- Risks:
  - **Tab bar is icon-only; identity lives in config (nav-tweak)** — [src/components/app-tabs.tsx](../../../src/components/app-tabs.tsx) renders the stable `expo-router` `Tabs` (NOT `unstable-native-tabs` — SDK57 `NativeTabs` couldn't host a per-tab Stack), with `tabBarShowLabel: false` + one `@expo/vector-icons` Ionicons glyph per tab. Tab name / Chinese title / icon come from [src/navigation/tab-config.ts](../../../src/navigation/tab-config.ts), the single source shared with each tab's top Stack header title (configured in each `_layout.tsx`). Affected: tab navigation across all platforms.
  - **React Compiler experiment enabled** — [app.json](../../../app.json) `experiments.reactCompiler: true`. Verify components follow rules-of-react (one hook = one useQuery, never several behind a callable) before assuming manual memo is needed.
  - **Typed routes on** — `experiments.typedRoutes: true`; route names are type-checked, so a renamed file must update all `Href`/`router.push` references.
  - **`ExpoSqliteAdapter.withTransaction` is not reentrant** — hand-writes `BEGIN`/`COMMIT`/`ROLLBACK` on a single connection; `BEGIN` cannot nest. The `MutationQueue` (ADR-0005) serializes writes so concurrent mutations never nest a `BEGIN`. Source: `withTransaction` doc-comment in [port.ts](../../../src/data/port.ts).
  - **RNTL v14 `fireEvent.*` are async** — each wraps `await act(...)`. Two consecutive un-awaited `fireEvent` calls open overlapping act scopes that corrupt the NEXT test's render ("overlapping act() calls" → empty trees). Always `await fireEvent.*`. See [manage-tab.test.tsx](../../../src/components/manage-tab.test.tsx) AC2 + [async.ts](../../../src/testing/async.ts).
  - **React Query notifyManager has no public cancel** — notifications are scheduled via `setTimeout(0)`; a mutation whose onSuccess unmounts its own host can leave a scheduled timer. The sanctioned guard is `await fireEvent.*` (so acts don't overlap) + `queryClient.clear()` in afterEach; do NOT set `IS_REACT_ACT_ENVIRONMENT` globally (it deadlocks RNTL's waitFor — see [jest-setup.js](../../../jest-setup.js)).
  - **Real adapter covered only by manual device smoke** — the executor has no automated Jest; bugs surface only via the 管理 dev smoke. Run it before any release (ADR-0004).
- Validation: after editing a component, run `npx jest`; after editing the adapter or `sql-logic.ts`, run `npx jest` then the device smoke.
- Next Drill-Down: re-read the specific unstable/experimental API's v57 docs before extending; re-read ADR-0004/0005/0006 before changing the verification split, the data-flow layer, or the test harness.

## 3. Compact Indexes

### Capability Index Table

| Capability     | Main Modules                                              | Entry                                  | Status    |
| -------------- | --------------------------------------------------------- | -------------------------------------- | --------- |
| bookkeeping    | [staff-list-tracer](../../../src/components/staff-list-tracer.tsx), [record-form](../../../src/components/record-form.tsx), [staff-detail](../../../src/components/staff-detail.tsx), [record-detail](../../../src/components/record-detail.tsx) | `bookkeeping` tab + `staff/[id]` + `record/[id]` | confirmed |
| summary        | [summary-tab.tsx](../../../src/components/summary-tab.tsx) | `summary` tab                          | confirmed |
| manage         | [manage-tab.tsx](../../../src/components/manage-tab.tsx)   | `manage` tab                           | confirmed |
| boot-shell     | [app-provider.tsx](../../../src/providers/app-provider.tsx) | root `_layout`                         | confirmed |
| tab-navigation | [app-tabs.tsx](../../../src/components/app-tabs.tsx)       | `AppTabs` in `_layout`                 | confirmed |
| device-smoke   | [smoke-entry.tsx](../../../src/components/smoke-entry.tsx) | 管理 tab `__DEV__`                      | confirmed |

### Module Index Table

| Module / Package | Path                                       | Responsibility                          | Key Dependencies                                              | Risk Notes                                |
| ---------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| routes           | [src/app/](../../../src/app/)              | thin screen adapters + root layout      | expo-router, react-native-safe-area-context                  | icon-only `Tabs`; identity in `navigation/tab-config.ts`  |
| components       | [src/components/](../../../src/components/) | business UI + themed primitives (router-agnostic) | react-native, @tanstack/react-query                          | `.web.tsx` siblings for some components   |
| providers        | [src/providers/](../../../src/providers/)  | composition root + QueryClient/Repos/queue DI | @tanstack/react-query, expo-sqlite                           | AppProvider async-opens the DB            |
| hooks            | [src/hooks/](../../../src/hooks/)          | data-flow layer: reads / mutations / keys / gate + theme | @tanstack/react-query                                 | family-root invalidation; gate-required   |
| testing          | [src/testing/](../../../src/testing/)      | RNTL harness + async helpers            | @testing-library/react-native                                | use `waitForSync`, not `findBy*`          |
| theme tokens     | [theme.ts](../../../src/constants/theme.ts) | Colors/Fonts/Spacing                    | react-native (`Platform`)                                    | side-effect imports `@/global.css`         |
| data layer       | [src/data/](../../../src/data/)            | storage port + 2 adapters + sql-logic + migrations + repos + audit + derived inventory/dailyFlow + composition + device smoke | jest/ts-jest (dev); expo-sqlite (runtime) | adapter `withTransaction` not reentrant; real adapter only device-smoke-covered |

### Cross-Module Flow Table

| Flow                | Modules                                                            | Entry                                  | Effect                              | Drill-Down                                   |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------- | ----------------------------------- | -------------------------------------------- |
| app boot → tabs     | entry → `_layout` → `AppProvider` (open DB + setupRepos) → `AppProviders` → splash + `AppTabs` | `preventAutoHideAsync()` | splash plays through async open, hides, tabs render | [app-provider.tsx](../../../src/providers/app-provider.tsx) |
| write → refetch     | `useXxx().mutate` → `MutationQueue` → repo → invalidate `qk.<family>.all` → refetch | any mutation | every open view under that family refetches live | [query-keys.ts](../../../src/hooks/query-keys.ts) + [mutations.ts](../../../src/hooks/mutations.ts) |
| device smoke (dev)  | `SmokeEntry` → `run-smoke` → `ExpoSqliteAdapter` vs `InMemoryAdapter` → `stable()` compare | 管理 `__DEV__` press | steps deep-compared across adapters | [run-smoke.ts](../../../src/data/smoke/run-smoke.ts) + [ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md) |

### Quick File Index

- [src/app/_layout.tsx](../../../src/app/_layout.tsx): root layout — theme → `AppProvider` → splash + tabs.
- [src/providers/app-provider.tsx](../../../src/providers/app-provider.tsx): production composition root — open DB, build Repos, boot/error/retry.
- [src/providers/providers.tsx](../../../src/providers/providers.tsx): `AppProviders` — QueryClient + Repos + MutationQueue.
- [src/hooks/query-keys.ts](../../../src/hooks/query-keys.ts): the single query-key registry / invalidation map.
- [src/hooks/mutations.ts](../../../src/hooks/mutations.ts): gate-serialized writes + family-root invalidation.
- [src/testing/render.tsx](../../../src/testing/render.tsx): RNTL harness — real InMemoryAdapter, no mocked Repos.
- [src/testing/async.ts](../../../src/testing/async.ts): `waitForSync` / `flushPending` (RNTL v14 + React 19).
- [src/data/port.ts](../../../src/data/port.ts): storage contract — the single test seam.
- [src/data/composition.ts](../../../src/data/composition.ts): `setupRepos` — the one repo-constructor path (prod + test).
- [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts): production adapter — `open()` (WAL + migrations) → thin SQL executor.
- [app.json](../../../app.json): expo config + experiments.
- [package.json](../../../package.json): scripts + dependency pins.

## 4. Maintenance Notes

- Refresh this Project CodeMap when module boundaries, entry types, external dependencies, or validation commands change.
- Do **not** refresh the whole map for a narrow feature edit — update or create the relevant Feature CodeMap (`docs/codemap/<feature>.md`) instead.
- Re-run a drift-check before trusting this map if `src/app/`, `src/components/`, `src/hooks/`, `src/providers/`, `src/testing/`, or `src/data/` have changed since `Last updated`.
