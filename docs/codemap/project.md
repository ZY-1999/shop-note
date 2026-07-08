# shop-note CodeMap (project)

## 1. Orientation

- Last updated: `2026-07-08`
- Updated: `2026-07-08` — production `expo-sqlite` adapter landed (spec #01–#03, ADR-0003/0004). The adapter is **no longer a stub**, `expo-sqlite` is now a dependency, and a cross-adapter device smoke runs from Home `__DEV__`. Only the production composition root is still missing.
- Project: `shop-note` — Expo SDK 57 / React Native app (name from [app.json](../../../app.json), slug `shop-note`, scheme `shopnote`).
- Role / responsibility: **Template UI + data foundation.** The Expo default UI (two demo tabs) is unchanged, but the pure-TypeScript local-first data layer under `src/data/` is now production-grade: typed storage port, in-memory **and real `expo-sqlite`** adapters, versioned migrations, repositories (staff / product / stock-record / audit / derived inventory), and a cross-adapter device smoke. What's still missing is a production composition root — no business screen consumes the repositories yet; the Home `__DEV__` smoke entry is the sole UI touchpoint.
- Main languages / frameworks: TypeScript + React 19.2, React Native 0.86, Expo SDK 57 (`expo-router` file-based routing, `expo-image`, `expo-symbols`, `expo-web-browser`, `expo-sqlite`, `react-native-reanimated` 4.5, `react-native-worklets`, `react-native-safe-area-context`).
- Runtime / deployment shape: client-only RN app; iOS / Android / web (`web.output: static`). No backend, no network calls; persistence is on-device SQLite via `expo-sqlite` (production adapter) — no cloud sync.
- Primary entry types: app route screens (`src/app/*.tsx`) consumed by `expo-router/entry` ([package.json:3](../../../package.json#L3)).
- Confidence:
  - confirmed: app structure, routing, theme system, component set, scripts, config, and the full `src/data/` layer — storage port, repositories, audit, derived inventory, **`sql-logic.ts` builders, `expo-sqlite-migration.ts` DDL, the real `ExpoSqliteAdapter`, and the cross-adapter device smoke** (pure logic Jest-covered; adapter behavior device-verified per ADR-0004).
  - inferred: product UI for shop management is greenfield (no business screen consumes the repos).
  - unknown: UI for shop management, navigation beyond two tabs, and the production composition root (who constructs the repos + which adapter at app boot).

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
  -> Node: Feature CodeMap Backlog
```

### Node: shop-note

- Type: `project`
- Status: `confirmed`
- Purpose: orient any agent entering the repo — where routes, theme, and components live before real features are built.
- Read First:
  - [src/app/_layout.tsx](../../../src/app/_layout.tsx): root layout — ThemeProvider + splash + tabs.
  - [src/app/index.tsx](../../../src/app/index.tsx): Home screen (now also hosts the `__DEV__` smoke entry).
  - [src/constants/theme.ts](../../../src/constants/theme.ts): colors, fonts, spacing — the styling substrate.
  - [app.json](../../../app.json): expo config + experiments (`typedRoutes`, `reactCompiler`).
  - [src/data/port.ts](../../../src/data/port.ts): the storage contract every repository is built on (single test seam).
- Edges / Children: the nine nodes below.
- Evidence: source files listed throughout; [package.json](../../../package.json) dependency set.
- Unknowns: none — domain vocabulary is captured in [CONTEXT.md](../../../CONTEXT.md); key decisions in [docs/adr/](../../../docs/adr/).
- Next Drill-Down: read the **Module Index** for layout, **Domain And Data** for the data layer, **Entry Index** for route semantics, **Risk Areas** for the unstable APIs and the adapter's reentrancy constraint.

### Node: Capability Index

- Type: `capability`
- Status: `confirmed` (template capabilities only) / `inferred` (no product capabilities exist)
- Purpose: what the app *does* today, to distinguish scaffolding from real features.
- Children:
  - `home-screen` — welcome + dev hints, plus a `__DEV__` smoke trigger (see Cross-Module Flows). Main module: [src/app/index.tsx](../../../src/app/index.tsx). Entry: `index` route. Feature CodeMap: pending. Status: `confirmed` (template demo + dev-only smoke entry).
  - `explore-screen` — collapsible info sections + external links. Main module: [src/app/explore.tsx](../../../src/app/explore.tsx). Entry: `explore` route. Feature CodeMap: pending. Status: `confirmed` (template demo).
  - `tab-navigation` — two-tab native navigator. Main module: [src/components/app-tabs.tsx](../../../src/components/app-tabs.tsx). Feature CodeMap: pending. Status: `confirmed`.
  - `splash-animation` — keyframe boot animation + logo. Main module: [src/components/animated-icon.tsx](../../../src/components/animated-icon.tsx). Feature CodeMap: pending. Status: `confirmed`.
- Evidence: route files + component imports traced from `_layout.tsx`.
- Unknowns: no shop/note/listing/cart/etc. capability exists — anything product-shaped is greenfield.
- Validation: `expo start` → app boots to Home tab with splash animation.
- Next Drill-Down: when a real feature lands, promote it to its own `docs/codemap/<feature>.md`.

### Node: Module Index

- Type: `module`
- Status: `confirmed`
- Purpose: physical code layout under `src/`.
- Children:
  - `src/app/` — expo-router screens + root layout. Responsibility: routing + top-level providers. Key deps: `expo-router`, `react-native-safe-area-context`. Risk: `app-tabs.tsx` imports `expo-router/unstable_native_tabs` (see Risk Areas).
  - `src/components/` — presentational + themed components. Responsibility: reusable UI (`ThemedText`, `ThemedView`, `Collapsible`, `ExternalLink`, `HintRow`, `WebBadge`, `AnimatedIcon`). Key deps: `react-native-reanimated`, `expo-image`, `expo-symbols`, `expo-web-browser`. Risk: several `.web.tsx` platform variants exist — editing the base file may need a matching web edit.
  - `src/constants/theme.ts` — theme tokens. Responsibility: `Colors` (light/dark), `Fonts` (per-platform), `Spacing`, `BottomTabInset`, `MaxContentWidth`; side-effect imports `@/global.css`. Key deps: `react-native` (`Platform`).
  - `src/hooks/` — `use-theme.ts` (scheme → `Colors`), `use-color-scheme.ts` (re-exports RN `useColorScheme`). Responsibility: theme resolution.
  - `src/data/` — local-first data layer (see **Domain And Data** node). Responsibility: storage port + two adapters, pure SQL logic, versioned migrations, repositories (staff/product/stock-record), audit log, derived inventory, and a cross-adapter device smoke. Key deps: `jest`/`ts-jest` (dev), `expo-sqlite` (runtime, production adapter only). Risk: production adapter's `withTransaction` is not reentrant (see Risk Areas).
  - `scripts/reset-project.js` — one-off template reset (moves `src`/`scripts` to `/example`, writes blank `src/app`). Responsibility: scaffolding utility; deletable once real dev starts.
- Evidence: `find ./src ./scripts` + source reads.
- Unknowns: none for layout.
- Validation: `expo lint` ([package.json:13](../../../package.json#L13)).
- Next Drill-Down: read a component before extending it; check for a sibling `.web.tsx`.

### Node: Entry Index

- Type: `entry`
- Status: `confirmed`
- Purpose: where execution / rendering begins.
- Entries:
  - App boot: `expo-router/entry` ([package.json:3](../../../package.json#L3)) → file routes in `src/app/`.
  - UI / routes:
    - `src/app/_layout.tsx` — root layout, wraps everything in `ThemeProvider`, mounts `AnimatedSplashOverlay` + `AppTabs`.
    - `src/app/index.tsx` → `index` tab ("Home") — also hosts the `__DEV__` smoke trigger (`SmokeEntry`).
    - `src/app/explore.tsx` → `explore` tab ("Explore").
  - Device smoke (dev-only): Home `SmokeEntry` → dynamic `import('@/data/smoke/run-smoke')` → `runExpoSqliteSmoke()` (see Cross-Module Flows).
  - CLI / commands: `npm start` (`expo start`), `npm run android|ios|web`, `npm run lint`, `npm run reset-project` ([package.json:12-19](../../../package.json#L12-L19)).
- Evidence: [package.json](../../../package.json) scripts + route files.
- Unknowns: none.
- Validation: `npm start` then press `a`/`i`/`w`.
- Next Drill-Down: expo-router file conventions (https://docs.expo.dev/versions/v57.0.0/) before adding routes — `typedRoutes` is on, so route names are type-checked.

### Node: Domain And Data

- Type: `object`
- Status: `confirmed` (data layer) / `inferred` (no business UI consumes it yet)
- Purpose: domain objects, persistence, and the derived read model for shop management.
- Children:
  - **Storage port** — [src/data/port.ts](../../../src/data/port.ts): `StoragePort`, the single test seam — a dumb typed row-store (`withTransaction` / `insert` / `findById` / `update` / `find`), plus `HasId` and `Query`. No `remove` on the surface (PRD invariant: no hard deletes). All business logic lives in pure-TS repos above the port; resist pushing query/aggregation logic down here. `withTransaction` is **not reentrant** (see Risk Areas).
  - **Adapters** — [src/data/in-memory.ts](../../../src/data/in-memory.ts): `InMemoryAdapter` (used by every test; transactional rollback via snapshots). [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts): `ExpoSqliteAdapter` — the **production** adapter (spec #02), a thin executor over `sql-logic.ts`. `static open(name)` opens the DB, sets WAL, and runs migrations; `withTransaction` is hand-written `BEGIN`/`COMMIT`/`ROLLBACK`; `insert`/`findById`/`update`/`find` bind `{sql, params}` from the builders and deserialize JSON columns on read. Verified by the device smoke (ADR-0004), **not** by Jest — the port is the single test seam (PRD testing decision).
  - **SQL logic** — [src/data/sql-logic.ts](../../../src/data/sql-logic.ts): pure SQL generation + (de)serialization (spec #01). `SCHEMA` is the single source of truth for the 5 domain tables (`staff`/`product`/`stock_record`/`stock_record_item`/`audit_log`); provides `buildInsert`/`buildUpdate`/`buildFind` + `serializeRow`/`deserializeRow` (JSON-column round-trips) + `assertKnownKeys`. Zero `expo-sqlite` import → fully Jest-covered on host.
  - **Migrations** — [src/data/expo-sqlite-migration.ts](../../../src/data/expo-sqlite-migration.ts): versioned DDL (spec #02). Column *names* derive from `SCHEMA`; this module adds only SQLite types/nullability/CHECK constraints (ADR-0003) — no `FOREIGN KEY`, no `UNIQUE` (`PRAGMA foreign_keys` off; references enforced in the repository layer). `COLUMNS`/`createTableSql`/`MIGRATIONS` (v1 = 5 tables + `idx_item_record_id`) are Jest-covered; `runMigrations` is device-only (bumps `PRAGMA user_version`, idempotent via `IF NOT EXISTS`).
  - **Device smoke** — [src/data/smoke/](../../../src/data/smoke/): cross-adapter equivalence proof (spec #02/#03, ADR-0004). [behavior-script.ts](../../../src/data/smoke/behavior-script.ts) holds the shared ordered `behaviorScript` (22 steps covering every repository public path) + `setupRepos`; imports no `expo-sqlite`, so its InMemory half is Jest-covered. [run-smoke.ts](../../../src/data/smoke/run-smoke.ts) is the device-only runner: runs the script against an `ExpoSqliteAdapter` repo set and an `InMemoryAdapter` repo set, deep-comparing `stable(step.run(...))` per step. [stable.ts](../../../src/data/smoke/stable.ts) is the pure normalizer that collapses volatile fields (`id`/`*_id`→`<id>`, `*_at`/`timestamp`→`<time>`, drops null keys, scrubs id tokens embedded in serialized strings, classifies `FieldDiff.old/new` by sibling field name) so the compare reflects *behavior*, not mint marks.
  - **Primitives** — [src/data/primitives.ts](../../../src/data/primitives.ts): `Cents` brand int (money as integer cents via `cents()`); qty is a plain int.
  - **Repositories** — [src/data/staff.ts](../../../src/data/staff.ts) + [src/data/product.ts](../../../src/data/product.ts): CRUD with soft-delete (`voided_at`) + restore, search, audit-wired via a shared `mutate()` template (read → compute patch → persist → audit, inside `withTransaction`). [src/data/stock-record.ts](../../../src/data/stock-record.ts): posting freezes each line's `title` + `unit_price` snapshot from the product; edit resnapshots touched lines (stable-id merge — untouched lines keep their original snapshot; UPSERT semantics, never drops unmentioned stored lines); void sets `voided_at` (items never erased).
  - **Audit** — [src/data/audit.ts](../../../src/data/audit.ts): `AuditProvider` — field-level diff on each mutate; read-only timeline query. Stock-record **create** is intentionally NOT audited (only edit/void are).
  - **Derived inventory** — [src/data/inventory.ts](../../../src/data/inventory.ts): `Inventory` — read-only projection; `balance` / `staffInventory` / `shopAggregate` recomputed from the unvoided ledger every call (never stored → no drift; instant cost revaluation against current price; negative qty allowed = 欠货).
  - Config namespaces: `expo.*` in [app.json](../../../app.json) only.
- Evidence: the `src/data/` layer (port + 2 adapters + sql-logic + migrations + repos + audit + inventory + `smoke/` subpackage) with 11 Jest suites; real-adapter equivalence proven by the device smoke (spec #03 PASS, ADR-0004); [port.ts](../../../src/data/port.ts) doc-comment records the DESIGN-IT-TWICE port decision.
- Unknowns: the production composition root (who constructs the repos + which adapter at app boot) is still undecided — only tests and the device-smoke runner self-build repos; no screen/provider wires them yet. (Domain vocabulary: [CONTEXT.md](../../../CONTEXT.md); key decisions: [docs/adr/](../../../docs/adr/).)
- Validation: `npm test` covers every pure module against `InMemoryAdapter` (incl. sql-logic + migration DDL + smoke's stable/script); the real `ExpoSqliteAdapter` is verified by the **manually-triggered device smoke** (ADR-0004), not by Jest.
- Next Drill-Down: read [port.ts](../../../src/data/port.ts) first (the contract), then [stock-record.ts](../../../src/data/stock-record.ts) (the core write module) and [inventory.ts](../../../src/data/inventory.ts) (the deepest read module); for the production store, [sql-logic.ts](../../../src/data/sql-logic.ts) → [expo-sqlite-migration.ts](../../../src/data/expo-sqlite-migration.ts) → [expo-sqlite.ts](../../../src/data/expo-sqlite.ts) → [smoke/run-smoke.ts](../../../src/data/smoke/run-smoke.ts).

### Node: External Dependencies

- Type: `dependency`
- Status: `confirmed`
- Purpose: what the app reaches outside its own code for — the Expo/RN platform, the OS browser, and on-device SQLite.
- Children:
  - Third-party SDKs (all Expo-managed, SDK 57 pinned): `expo-router`, `expo-image`, `expo-symbols`, `expo-web-browser`, `expo-sqlite`, `expo-device`, `expo-glass-effect`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-constants`, `expo-linking`; RN community: `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`. See [package.json](../../../package.json).
  - External web links: opened via `expo-web-browser` in-app browser — [src/components/external-link.tsx](../../../src/components/external-link.tsx) (`ExternalLink`).
  - Storage / filesystem: on-device SQLite via `expo-sqlite` (`~57.0.0`, [package.json:16](../../../package.json#L16)) — the production adapter `ExpoSqliteAdapter.open()` (WAL + versioned migrations) is the device store. Tests and the smoke's InMemory half use `InMemoryAdapter`; the device smoke uses a dedicated `shop_note_smoke.db` so production data is never touched.
  - Auth / network: none.
  - Observability: none.
- Edges:
  - used by: `ExternalLink` → `expo-web-browser`; `animated-icon.tsx` → `react-native-worklets` (`scheduleOnRN`); themed components → `Colors` from [theme.ts](../../../src/constants/theme.ts); `ExpoSqliteAdapter` → `expo-sqlite` (`openDatabaseAsync` / `runAsync` / `getFirstAsync` / `getAllAsync` / `execAsync` / `closeAsync`).
  - failure surfaces: splash hide relies on `expo-splash-screen` + `onLayout`; external links fall back to OS browser when `EXPO_OS === 'web'`.
- Evidence: import statements in source + dependency list.
- Unknowns: none for current surface.
- Validation: boot animation completes → `AnimatedSplashOverlay` unmounts via `scheduleOnRN(setVisible, false)`; device smoke PASS confirms real SQLite round-trips (JSON columns, `ROLLBACK`, CHECK, WAL).
- Next Drill-Down: when adding a backend/cloud-sync, add a row here and an ADR in `docs/adr/`.

### Node: Cross-Module Flows

- Type: `flow`
- Status: `confirmed`
- Purpose: the runtime chains worth knowing before editing.
- Major Flows:
  - **App boot → splash → tabs**
    - Modules: `expo-router/entry` → `src/app/_layout.tsx` → `AnimatedSplashOverlay` ([animated-icon.tsx](../../../src/components/animated-icon.tsx)) + `AppTabs` ([app-tabs.tsx](../../../src/components/app-tabs.tsx)) → `index`/`explore` routes.
    - Entry: `SplashScreen.preventAutoHideAsync()` in `_layout.tsx:8`.
    - Effect: splash overlay plays keyframe, hides on layout, tabs render.
    - Drill-Down: [src/components/animated-icon.tsx](../../../src/components/animated-icon.tsx) (splash keyframes + `scheduleOnRN` callback).
  - **Theme resolution**
    - Modules: `useColorScheme()` (RN) → `useTheme()` ([use-theme.ts](../../../src/hooks/use-theme.ts)) → `Colors[theme]` ([theme.ts](../../../src/constants/theme.ts)) → `ThemedText`/`ThemedView`/`Collapsible`/`explore.tsx`.
    - Entry: `ThemeProvider value` in `_layout.tsx:13` (`DarkTheme`/`DefaultTheme`).
    - Effect: every themed component picks light/dark tokens; `unspecified` scheme falls back to `light`.
    - Drill-Down: [src/constants/theme.ts](../../../src/constants/theme.ts).
  - **Cross-adapter device smoke (dev-only)** — ADR-0004
    - Modules: Home `SmokeEntry` ([src/app/index.tsx](../../../src/app/index.tsx)) → dynamic `import('@/data/smoke/run-smoke')` → `runExpoSqliteSmoke()` ([run-smoke.ts](../../../src/data/smoke/run-smoke.ts)) → `ExpoSqliteAdapter.open("shop_note_smoke.db")` + `setupRepos()` ([behavior-script.ts](../../../src/data/smoke/behavior-script.ts)) vs an `InMemoryAdapter` repo set → per-step `stable()` compare ([stable.ts](../../../src/data/smoke/stable.ts)).
    - Entry: `__DEV__ && <SmokeEntry/>`, press "run expo-sqlite smoke".
    - Effect: 22 behavior-script steps run against both adapters; each step's normalized snapshot is deep-compared, drift localizes to the diverging operation. Per-step result rendered on screen + full log to Metro terminal.
    - Drill-Down: [src/data/smoke/stable.ts](../../../src/data/smoke/stable.ts) (why volatile fields collapse) + [docs/adr/0004-adapter-verification-device-smoke.md](../../../docs/adr/0004-adapter-verification-device-smoke.md).
- Evidence: traced import/call chains in source.
- Unknowns: none.
- Validation: toggle device dark mode → colors flip across all screens; run the smoke on a device/sim → expect 22/22 PASS.
- Next Drill-Down: only if touching theme, splash, or the adapter's verification regime.

### Node: Validation

- Type: `validation`
- Status: `confirmed`
- Purpose: how to prove the app still works — note the gaps.
- Validation Entry:
  - Test commands: `npm test` (`jest`) and `npm run typecheck` (`tsc --noEmit`) — [package.json:44-45](../../../package.json#L44-L45).
  - Test directories: `src/data/*.test.ts` + `src/data/smoke/*.test.ts` — 11 suites covering storage port, primitives, in-memory adapter, audit, staff, product, stock-record, inventory, **sql-logic** (builders + JSON-column serialize round-trips + `assertKnownKeys`), **expo-sqlite-migration** (pure DDL + `COLUMNS`/`SCHEMA` name parity), and the smoke's **stable normalizer + InMemory half of the behavior script**.
  - Lint: `npm run lint` (`expo lint`).
  - Local run: `npm start` → `a` (Android) / `i` (iOS) / `w` (web).
  - Smoke paths: boot → splash hides → Home tab renders welcome + hints + `__DEV__` smoke trigger; Explore tab renders collapsibles; dark/light switch correct.
  - Device smoke: on a device/sim, press Home's "run expo-sqlite smoke" → expect 22/22 PASS (full log on Metro terminal). This is the **only** coverage of real `expo-sqlite` execution (JSON columns, `ROLLBACK`, CHECK, WAL) — not CI, must be run manually before release (ADR-0004).
  - Logs / metrics: none.
  - Known CI checks: none in repo.
- Edges:
  - proves: app boots, routes resolve, theme switches, splash completes; the `src/data/` layer's pure behaviour (posting, snapshots, voids, audit diffs, derived balances, SQL generation, DDL, smoke normalization) via Jest against `InMemoryAdapter`; the production adapter's **behavioral equivalence** to `InMemoryAdapter` via the device smoke.
  - does not prove: the real-adapter executor's runtime correctness is proven only by the manually-triggered device smoke, not by automated Jest; and no UI other than the dev smoke entry consumes the data layer.
- Evidence: [package.json](../../../package.json) `test` + `typecheck` scripts; [jest.config.js](../../../jest.config.js) (ts-jest, diagnostics off, `@/` alias → `./src/*`); ADR-0004 records the split (pure logic → Jest, adapter execution → device smoke).
- Unknowns: device/UI test strategy (React Native Testing Library / detox) — not yet set up; only the pure-TS data layer is unit-tested, and the adapter is smoke-verified by hand.
- Next Drill-Down: Jest test imports come from `@jest/globals` (Expo's `moduleDetection:force` breaks `@types/jest` env globals); time-dependent tests use `jest.useFakeTimers` + `setSystemTime`; `expo-sqlite-migration.ts` uses `import type` so Jest can load it without the native module.

### Node: Risk Areas

- Type: `risk`
- Status: `confirmed`
- Purpose: terrain facts that can bite the next edit.
- Risks:
  - **Unstable native tabs API** — [src/components/app-tabs.tsx:1](../../../src/components/app-tabs.tsx#L1) imports `expo-router/unstable_native_tabs`. Source: import path carries `unstable_`. Affected: tab navigation across all platforms. Suggested Feature CodeMap: `docs/codemap/tab-navigation.md` when customizing tabs.
  - **React Compiler experiment enabled** — [app.json](../../../app.json) `experiments.reactCompiler: true`. Affected: all components (compiler transforms run). Verify components follow rules-of-react before assuming manual memo is needed.
  - **Typed routes on** — `experiments.typedRoutes: true`; route names are type-checked, so a renamed file must update all `Href`/`Link` references.
  - **`.web.tsx` platform variants** — `app-tabs`, `animated-icon`, `use-color-scheme` each have a web sibling; editing one without the other creates platform drift.
  - **Template not yet customized** — risk of treating demo screens as product behavior.
  - **`ExpoSqliteAdapter.withTransaction` is not reentrant** — [src/data/expo-sqlite.ts:52](../../../src/data/expo-sqlite.ts#L52) hand-writes `BEGIN`/`COMMIT`/`ROLLBACK` on a single connection; `BEGIN` cannot nest (no `SAVEPOINT`). Repos must never call `withTransaction` from inside another `withTransaction` — the in-memory adapter happens to nest via snapshot/restore, but that is beyond the port contract. Source: `withTransaction` doc-comment in [port.ts](../../../src/data/port.ts).
  - **Real adapter covered only by manual device smoke** — the executor (`bind` params, `withTransaction`) has no automated Jest; bugs surface only via the Home `__DEV__` smoke. Mitigation: the executor is deliberately kept thin (all logic lives in Jest-covered `sql-logic.ts`). Run the smoke before any release (ADR-0004).
  - **Data layer has no production consumer** — repositories are constructed only inside test `setup()` and the device-smoke runner; the Home `__DEV__` smoke entry is the sole UI touchpoint. No screen/hook/app composition root wires them yet, so DI is undecided.
- Unknowns: whether `expo-glass-effect` / `expo-symbols` APIs will be used by planned features.
- Validation: after editing a component, run on all three platforms (`a`/`i`/`w`); after editing the adapter or `sql-logic.ts`, run `npm test` then the device smoke.
- Next Drill-Down: re-read the specific unstable/experimental API's v57 docs before extending; re-read ADR-0004 before changing the adapter's verification split.

### Node: Feature CodeMap Backlog

- Type: `capability`
- Status: `inferred`
- Purpose: features implied by the project name but not yet built — candidates for depth-first maps once started.
- Backlog:
  - `note-taking` — Why: "shop-note" name implies notes/lists. Likely entry: new route under `src/app/`. Likely files: new `src/app/notes*.tsx`, a store/persistence module (none exists). Priority: high (first real feature).
  - `shopping-list-or-items` — Why: "shop" half of the name. Likely entry: list screen + item components. Likely files: under `src/components/` + a data layer. Priority: high.
  - `persistence` — **Mostly built.** The typed `StoragePort` + `InMemoryAdapter` + the real `ExpoSqliteAdapter` (with `sql-logic.ts` + `expo-sqlite-migration.ts` + device smoke) are landed (ADR-0003/0004). Remaining: a production **composition root** that wires repositories into the app at boot (provider/DI + which adapter). Priority: unblocks UI for shop management.
- Evidence: project name + specs under `.scratch/2026-07-08-shop-management-system/` + the `src/data/` layer + [CONTEXT.md](../../../CONTEXT.md) glossary + [docs/adr/](../../../docs/adr/).
- Unknowns: UI scope for the shop-management screens; offline/sync needs (PRD is local-first, no sync planned).
- Next Drill-Down: run `/to-prd` on the first feature; create `CONTEXT.md` via `/domain-modeling` when terms settle.

## 3. Compact Indexes

### Capability Index Table

| Capability        | Main Modules                                              | Entry                  | Feature CodeMap          | Status    |
| ----------------- | --------------------------------------------------------- | ---------------------- | ------------------------ | --------- |
| home-screen       | [index.tsx](../../../src/app/index.tsx)                   | `index` route (+ `__DEV__` smoke) | pending                  | confirmed |
| explore-screen    | [explore.tsx](../../../src/app/explore.tsx)               | `explore` route        | pending                  | confirmed |
| tab-navigation    | [app-tabs.tsx](../../../src/components/app-tabs.tsx)      | `AppTabs` in `_layout` | pending                  | confirmed |
| splash-animation  | [animated-icon.tsx](../../../src/components/animated-icon.tsx) | `_layout` mount        | pending                  | confirmed |
| note-taking       | — (not built)                                             | —                      | `docs/codemap/notes.md`  | inferred  |
| shopping-items    | — (not built)                                             | —                      | `docs/codemap/items.md`  | inferred  |

### Module Index Table

| Module / Package | Path                                       | Responsibility                          | Key Dependencies                                              | Risk Notes                                |
| ---------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| routes           | [src/app/](../../../src/app/)              | screens + root layout                   | expo-router, react-native-safe-area-context                  | `unstable_native_tabs` in `app-tabs.tsx`  |
| components       | [src/components/](../../../src/components/) | reusable themed UI                      | reanimated, expo-image, expo-symbols, expo-web-browser       | `.web.tsx` siblings for 3 components       |
| theme tokens     | [theme.ts](../../../src/constants/theme.ts) | Colors/Fonts/Spacing                    | react-native (`Platform`)                                    | side-effect imports `@/global.css`         |
| hooks            | [src/hooks/](../../../src/hooks/)          | theme/scheme resolution                 | react-native                                                 | web variant of `use-color-scheme`         |
| data layer       | [src/data/](../../../src/data/)            | storage port + 2 adapters + sql-logic + migrations + repos + audit + derived inventory + device smoke | jest/ts-jest (dev); expo-sqlite (runtime) | adapter `withTransaction` not reentrant; covered only by manual device smoke; no production composition root |
| reset script     | [scripts/reset-project.js](../../../scripts/reset-project.js) | template reset utility                  | node fs/path                                                 | deletable after real dev starts            |

### Cross-Module Flow Table

| Flow                | Modules                                                            | Entry                                  | Effect                              | Drill-Down                                   |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------- | ----------------------------------- | -------------------------------------------- |
| app boot → tabs     | entry → `_layout` → `AnimatedSplashOverlay` + `AppTabs` → routes   | `preventAutoHideAsync()` (`_layout:8`) | splash plays, hides, tabs render    | [animated-icon.tsx](../../../src/components/animated-icon.tsx) |
| theme resolution    | RN `useColorScheme` → `useTheme` → `Colors` → themed components    | `ThemeProvider` (`_layout:13`)         | light/dark tokens applied app-wide  | [theme.ts](../../../src/constants/theme.ts)   |
| device smoke (dev)  | Home `SmokeEntry` → `run-smoke` → `ExpoSqliteAdapter` vs `InMemoryAdapter` → `stable()` compare | `__DEV__` press "run expo-sqlite smoke" | 22 steps deep-compared across adapters | [run-smoke.ts](../../../src/data/smoke/run-smoke.ts) + [ADR-0004](../../../docs/adr/0004-adapter-verification-device-smoke.md) |

### Quick File Index

- [src/app/_layout.tsx](../../../src/app/_layout.tsx): root layout / providers — start here.
- [src/components/app-tabs.tsx](../../../src/components/app-tabs.tsx): tab navigator (uses unstable API).
- [src/constants/theme.ts](../../../src/constants/theme.ts): all theme tokens.
- [src/hooks/use-theme.ts](../../../src/hooks/use-theme.ts): scheme → colors.
- [src/data/port.ts](../../../src/data/port.ts): storage contract — the single test seam under the data layer.
- [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts): production adapter — `open()` (WAL + migrations) → thin SQL executor.
- [src/data/smoke/run-smoke.ts](../../../src/data/smoke/run-smoke.ts): device smoke runner — Home `__DEV__` entry, 22-step cross-adapter compare.
- [app.json](../../../app.json): expo config + experiments.
- [package.json](../../../package.json): scripts + dependency pins.

## 4. Maintenance Notes

- Refresh this Project CodeMap when module boundaries, entry types, external dependencies, or validation commands change (e.g. a test runner is added, a backend/cloud-sync layer lands, routes grow beyond two tabs, or a production composition root wires repositories into the app).
- Do **not** refresh the whole map for a narrow feature edit — update or create the relevant Feature CodeMap (`docs/codemap/<feature>.md`) instead, via `/codemap` in `feature` mode.
- Re-run `/codemap` drift-check before trusting this map if `src/app/`, `src/components/`, `src/constants/theme.ts`, or `src/data/` have changed since `Last updated`.
