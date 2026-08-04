# shop-note CodeMap (project)

## 1. Orientation

- Last updated: `2026-08-04` (manage-import #01: kind-param import shell + staff import; `expo-document-picker`; `src/import/`)
- Updated: `2026-08-04` (summary-range-export #01: last10Days toolbar + white FlatList on summary/staff-detail)
- Updated: `2026-08-04` (manage-export spec #04: `buildProductWorkbook` + ProductManage 顶栏「导出」; reuses `xlsx@0.18.5`)
- Updated: `2026-08-04` (manage-export spec #03: `buildStaffWorkbook` + StaffManage 顶栏「导出」; lib `xlsx@0.18.5`)
- Updated: `2026-08-04` (manage-export spec #02: `src/export/` write+share pipeline + `formatCentsAsYuan`; `MoneyText` uses the pure helper; `useExport` mutation wrapper)
- Updated: `2026-08-04` (checkout-self-use spec #02: out form/detail/flow-row UI surfaces `self_use`; parents pass 0 bundles/retail)
- Updated: `2026-07-11` (signature-modal spec #02: SignatureModal component + rasterize seam; first `gesture-handler` import in source; new deps `react-native-svg` + `react-native-view-shot`)
- Updated: `2026-07-11` — stock-balance-refactor shipped (specs 01–05, commits `13cba51`→`098a7ee`). Inventory converged to a single global `shopAggregate` (restock `in` owned by admin `-1`; members only `out`); members carry a derived `MemberBalance` (Σ topup − Σ out line_amount); a global unit-price `ConfigRepository` freezes `unit_price_snapshot` on each checkout and splits into 单数+零售 via pure `splitBundleRetail`; dailyFlow is now a 综合流水 (restock/out/topup). **7 tables now** (added `topup`, `config`; `stock_record.unit_price_snapshot`); per-staff `balance`/`staffInventory`/`staffSummaries` + their hooks/query-keys removed; `-1` is a protected, filtered, void-guarded, restock-only row; v3 migration is a DROP+rebuild (ADR-0008). New repos: `TopupRepository`, `MemberBalance`, `ConfigRepository`; new pure helper: `splitBundleRetail`. See `.scratch/2026-07-10-stock-balance-refactor/`, [CONTEXT.md](../../../CONTEXT.md), [ADR-0008](../../../docs/adr/0008-clear-db-rebuild-migration.md).
- Updated: `2026-07-10` — direction `out` display word rolled back 「出单」→「出库」 app-wide (record-form / staff-row / staff-detail / summary-tab + their tests; CONTEXT.md + this map updated). Data-layer enum `out` still untouched — the second leg of the 出库↔出单 round-trip. Inline copy change, no feature folder.
- Updated: `2026-08-04` — display word 「金站」→「星站」 (`STAFF_LEVELS` label only; code `gold` unchanged). Living docs: CONTEXT + this map; historical `.scratch` member-rename specs left as-shipped.
- Updated: `2026-07-10` — member-rename-level: global display word 「员工」→「会员」 (code identifiers `Staff`/`staff_id`/`staff` table/routes untouched, cf. 出库↔出单 display-rename); `Staff.level` member tier (`normal`=普站 / `gold`=星站, single-source `STAFF_LEVELS`), repo lists sort 星站-first, manage-form level selector (default 普站, manually editable) + `level-badge` presentational component on manage rows / `staff-row` / staff-detail; `level` is audited; schema gains the column via a v2 `ALTER ... DEFAULT 'normal'` migration (v1 staff DDL frozen as a historical literal to dodge the dynamic-DDL duplicate-column trap; `ColDef.default` keeps `createTableSql`'s DEFAULT symmetric with the ALTER). See `.scratch/2026-07-10-member-rename-level/`.
- Updated: `2026-07-10` — summary day-collapse: each 流水 day section is now a **nested container card** mirroring the 库存卡 — the day card (`styles.card`) contains its header + staff cards, each staff card (`styles.staffCard`) contains its header + record lines; default collapsed (`openDays` set), header tap toggles, card height grows with `gap` when open. staff-row expand + batching unchanged. See `.scratch/2026-07-10-summary-day-collapse/`.
- Updated: `2026-07-10` — staff-detail containment: the 库存 section + each day section in `staff-detail.tsx` are now container cards (same `card`/`cardHead`/`cardTitle`/`subRow` family as summary), and day sections are collapsible (default collapsed, `openDays`) mirroring summary. See `.scratch/2026-07-10-staff-detail-containment/`.
- Updated: `2026-07-10` — nav-tweak: icon-only bottom tab bar + Chinese top headers driven by a single `src/navigation/tab-config.ts`; also retires the stale `unstable_native_tabs` risk note (the code already used stable `Tabs`).
- Updated: `2026-07-10` — page-refactor (#01–#05): shared `date-format.ts` helpers; bookkeeping row merged + 出库 copy; record-form chip/stepper/时间按钮化; staff-detail rebuilt (collapsible 库存 + day-grouped FlatList); **summary rewritten** from a four-segment switcher to a single time-range-scoped view (时间段 selector + as-of-now 库存卡 + day×staff 流水). See `.scratch/2026-07-10-page-refactor/`.
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
  - `summary` (#08, rewritten #05/page-refactor; summary-range-export #01) — time-range-scoped view: **toolbar first** (起止日 + 快捷下拉：近10天/本月/上月/本周/上周，默认近10天) → 库存卡 (as-of-now `useShopAggregate`, range-independent) → 流水 (range-scoped `useDailyFlow` day×staff; day sections collapsible). FlatList 白底铺满（会员详情同修）. Main module: [summary-tab.tsx](../../../src/components/summary-tab.tsx) + [date-format.ts](../../../src/components/date-format.ts) (`last10Days` / `matchRangePreset` / `normalizeDayRange`). Entry: `summary` tab. Feature CodeMap: pending. Status: `confirmed`.
  - `manage` (#09) — staff & product CRUD (search / create / edit / soft-delete / restore) + cost-price revaluation; staff 顶栏「导入｜导出」、product「包含删除」+「导出」xlsx (manage-export #01/#03/#04; manage-import #01 staff). Main modules: [manage-tab.tsx](../../../src/components/manage-tab.tsx) + [import-form.tsx](../../../src/components/import-form.tsx). Entries: `manage` tab + root Stack `import-form`. Feature CodeMap: pending. Status: `confirmed`.
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
  - `src/components/` — screen-level + presentational components. Responsibility: the business UI (`staff-list-tracer`, `staff-row`, `record-form`, `record-detail`, `staff-detail`, `summary-tab`, `manage-tab`, `import-form`, `money-text`, `smoke-entry`) + themed primitives (`ThemedText`, `ThemedView`, `animated-icon`). Components are router-agnostic (props for nav callbacks) so RNTL can test them with no router context (ADR-0006). **自用 UI**：`RecordForm` out-only Switch +「不计单数与零售」; `RecordDetail` badge + hide 单数/零售 when `self_use`; `FlowEventRow` optional `selfUse`; `staff-detail`/`summary-tab` pass `selfUse` + 0 split. Risk: several `.web.tsx` platform variants exist.
  - `src/providers/` — composition + DI. Responsibility: [app-provider.tsx](../../../src/providers/app-provider.tsx) (production: async-open `ExpoSqliteAdapter`, `setupRepos`, boot/error/retry) + [providers.tsx](../../../src/providers/providers.tsx) (`AppProviders`: QueryClient + ReposProvider + MutationQueue, adapter-agnostic, the test/prod seam). Key deps: `@tanstack/react-query`, `expo-sqlite`.
  - `src/hooks/` — the data-flow layer (ADR-0005). Responsibility: [reads.ts](../../../src/hooks/reads.ts) (one `useQuery` per read), [mutations.ts](../../../src/hooks/mutations.ts) (gate-serialized writes incl. `useImportStaff`, family-root invalidation), [query-keys.ts](../../../src/hooks/query-keys.ts) (the single registry), [mutation-queue.ts](../../../src/hooks/mutation-queue.ts) (serialization gate), [use-export.ts](../../../src/hooks/use-export.ts) (`useMutation` over `runExport`), `use-theme.ts`. Key deps: `@tanstack/react-query`.
  - `src/export/` — shared export pipeline (manage-export #02/#03/#04). Responsibility: [types.ts](../../../src/export/types.ts) (`ExportJob`, `XLSX_MIME`), [run-export.ts](../../../src/export/run-export.ts) (availability gate → build → `expo-file-system/legacy` cache write → `expo-sharing`; swallows `User canceled`), [build-staff-workbook.ts](../../../src/export/build-staff-workbook.ts) (`buildStaffWorkbook` → base64 xlsx; `staffExportFilename`), [build-product-workbook.ts](../../../src/export/build-product-workbook.ts) (`buildProductWorkbook` → base64 xlsx; `productExportFilename`; 单价 via `formatCentsAsYuan`). Pipeline (`runExport`) independent of `src/data/` / UI; workbook builders import Staff/Product domain types + `labelForLevel`. Key deps: `expo-file-system/legacy`, `expo-sharing`, `xlsx@0.18.5`.
  - `src/import/` — import pure logic (manage-import #01). Responsibility: [build-staff-import-template.ts](../../../src/import/build-staff-import-template.ts) (header-only `会员导入模板.xlsx`), [parse-staff-import-workbook.ts](../../../src/import/parse-staff-import-workbook.ts), [preview-staff-import.ts](../../../src/import/preview-staff-import.ts) (trim/dedupe/admin/level). Product/restock parsers land in #02/#03. Key dep: `xlsx@0.18.5`.
  - `src/lib/` — shared pure helpers (no React). Responsibility: [format-cents-as-yuan.ts](../../../src/lib/format-cents-as-yuan.ts) (`formatCentsAsYuan` — MoneyText + xlsx builds single source).
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
    - `src/app/import-form.tsx` → kind-parameterized import shell (manage-import #01; `kind=staff|product|restock`).
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
  - **SQL logic + migrations** — [sql-logic.ts](../../../src/data/sql-logic.ts) (pure SQL generation; `SCHEMA` is the source of truth for **7 tables** — staff/product/stock_record/stock_record_item/audit_log + `topup` + `config`; `stock_record` carries `unit_price_snapshot` + `self_use`) + [expo-sqlite-migration.ts](../../../src/data/expo-sqlite-migration.ts) (versioned DDL through **v5**; v3 is a DROP+rebuild — ADR-0008; v1+v3 `stock_record` CREATE frozen pre-`self_use`, v5 `ALTER … DEFAULT 0`; no `FOREIGN KEY`/`UNIQUE` — ADR-0003). Zero `expo-sqlite` import → Jest-covered.
  - **Repositories** — [staff.ts](../../../src/data/staff.ts) (`ADMIN_STAFF_ID='-1'`: list/listActive/search filter it, void('-1') throws) + [product.ts](../../../src/data/product.ts): CRUD with soft-delete + restore, audit-wired. [stock-record.ts](../../../src/data/stock-record.ts): create guards `direction=='in'`↔`'-1'`; out freezes `unit_price_snapshot` from `ConfigRepository` (edit does NOT re-freeze); `self_use` boolean (out default false / explicit true; in forced false; boolean↔0|1 at repo boundary); line snapshots + stable-id merge as before. [topup.ts](../../../src/data/topup.ts): member money-in ledger (audited create/void). [config.ts](../../../src/data/config.ts): key-value (`id` is the key; first key `unit_price`), audited upsert, cold-start 0.
  - **Audit** — [audit.ts](../../../src/data/audit.ts): `AuditProvider` — field-level diff on each mutate; read-only timeline query. Stock-record **create** is intentionally NOT audited; topup create/void + config set ARE.
  - **Derived reads (never stored → ADR-0002)** — [inventory.ts](../../../src/data/inventory.ts): `Inventory` narrowed to **global only** — `shopAggregate` (`Σ restock in − Σ out`, 欠货 negative; **does not** filter `self_use`). [member-balance.ts](../../../src/data/member-balance.ts): `MemberBalance.balance = Σ topup − Σ out line_amount` (欠款 negative; self-use out still counts). [daily-flow.ts](../../../src/data/daily-flow.ts): 综合流水 — per-(day×staff) restock(out `-1`)/checkout `line_amount` + topup `amount`. [split-bundle.ts](../../../src/data/split-bundle.ts): pure `splitBundleRetail` + `aggregateBundleRetail` (skips `out && self_use` for 单数·零售 only). (Old per-staff `balance`/`staffInventory`/`staffSummaries` removed.)
  - **Composition** — [composition.ts](../../../src/data/composition.ts): `setupRepos(adapter)` — builds products / staff / config / stockRecords / inventory / dailyFlow / topups / memberBalance; the one constructor path used by both `AppProvider` (production, `ExpoSqliteAdapter`) and tests (InMemoryAdapter).
  - **Data-flow layer (ADR-0005)** — [query-keys.ts](../../../src/hooks/query-keys.ts) (single key registry; families: staff/products/records/inventory/dailyFlow/topups/balance/config), [reads.ts](../../../src/hooks/reads.ts) (`useShopAggregate` / `useMemberBalance` / `useTopups` / `useUnitPrice` / `useDailyFlow` …; old `useStaffSummaries`/`useStaffInventory`/`useBalance` removed), [mutations.ts](../../../src/hooks/mutations.ts) (gate-serialized; stock-record create/update/void invalidate `qk.balance` + `qk.inventory` + `qk.dailyFlow`; topup create/void invalidate `qk.balance` + `qk.dailyFlow`), [mutation-queue.ts](../../../src/hooks/mutation-queue.ts).
  - Config namespaces: `expo.*` in [app.json](../../../app.json) only.
- Evidence: the `src/data/` layer (port + 2 adapters + sql-logic + migrations + repos + audit + inventory + dailyFlow + composition + `smoke/`) + the `src/hooks/` + `src/providers/` data-flow layer; 26 Jest suites.
- Validation: `npx jest` covers every pure module against `InMemoryAdapter` AND every component through the real data stack (ADR-0006); the real `ExpoSqliteAdapter` is verified by the manually-triggered device smoke (ADR-0004).
- Next Drill-Down: read [port.ts](../../../src/data/port.ts) (the contract), then [query-keys.ts](../../../src/hooks/query-keys.ts) (the invalidation map), then [stock-record.ts](../../../src/data/stock-record.ts) (core write) + [inventory.ts](../../../src/data/inventory.ts) (deepest read).

### Node: External Dependencies

- Type: `dependency`
- Status: `confirmed`
- Purpose: what the app reaches outside its own code for — the Expo/RN platform, on-device SQLite, and React Query.
- Children:
  - Third-party SDKs (all Expo-managed, SDK 57 pinned): `expo-router`, `expo-image`, `expo-symbols`, `expo-web-browser`, `@expo/vector-icons`, `expo-sqlite`, `expo-file-system`, `expo-sharing`, `expo-document-picker`, `expo-device`, `expo-glass-effect`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-constants`, `expo-linking`; RN community: `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`, `react-native-svg` (signature pad canvas), `react-native-view-shot` (signature rasterization); spreadsheet: `xlsx@0.18.5`. Data-flow: `@tanstack/react-query` v5, `@tanstack/query-core`. Test: `jest` (30), `jest-expo`, `@testing-library/react-native` v14, `ts-jest`. See [package.json](../../../package.json).
  - Storage / filesystem: on-device SQLite via `expo-sqlite` — `ExpoSqliteAdapter.open()` (WAL + versioned migrations) is the device store. Tests use `InMemoryAdapter`; the device smoke uses a dedicated `shop_note_smoke.db` so production data is never touched (ADR-0004). Export write path uses `expo-file-system/legacy` (`cacheDirectory` + `writeAsStringAsync`) — not the SDK 57 default entry (deprecated APIs throw at runtime). Import reads picked files via the same legacy `readAsStringAsync` after `expo-document-picker` (`copyToCacheDirectory: true`).
  - Share / spreadsheet: `expo-sharing` (`shareAsync` / `isAvailableAsync`); SheetJS community `xlsx@0.18.5` for staff/product workbook builds + staff import template/parse.
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
  - Test projects (ADR-0006, [jest.config.js](../../../jest.config.js)): **data** (ts-jest, node env, `*.test.ts`) — the pure data layer; **ui** (jest-expo + RNTL, `*.test.tsx`) — components through the real `InMemoryAdapter`. 35 suites / 284 tests total.
  - RNTL harness: [render.tsx](../../../src/testing/render.tsx) mounts components under the real providers backed by a real `InMemoryAdapter` (never mocked Repos — ADR-0006). Platform / outbound IO mocks allowed: `expo-router`, native pickers, SignatureModal canvas, `expo-document-picker`, and `expo-file-system/legacy` + `expo-sharing` (or `runExport`) for export/import UI tests. [async.ts](../../../src/testing/async.ts) provides `waitForSync` / `flushPending` — RNTL v14's `findBy*`/`waitFor` wrap each poll in `act`, which overlaps the next `fireEvent`'s act and leaks timers across tests; these helpers poll without act (see Risk Areas).
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
  - **`react-native-gesture-handler` + `react-native-svg` + `react-native-view-shot` need Jest mocks** — `SignatureModal` ([signature-modal.tsx](../../../src/components/signature-modal.tsx)) is the first explicit import of `gesture-handler` in project source; its test (`signature-modal.test.tsx`) mocks `gesture-handler` (captures gesture callbacks + synthesizes pan via `cloneElement`), mocks the `rasterize` seam ([rasterize.ts](../../../src/components/rasterize.ts)) to stub `view-shot`, and lets `react-native-svg` render under jest-expo's native module mocks. The native deps' real-device compatibility under RN 0.86 new arch is NOT Jest-verified (postponed to integration PRD). When extending gesture-handler or SVG testing, re-read [signature-modal.test.tsx](../../../src/components/signature-modal.test.tsx) mock factory first.
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
