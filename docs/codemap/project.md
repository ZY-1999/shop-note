# shop-note CodeMap (project)

## 1. Orientation

- Last updated: `2026-07-08`
- Project: `shop-note` — Expo SDK 57 / React Native app (name from [app.json](../../../app.json), slug `shop-note`, scheme `shopnote`).
- Role / responsibility: **Template UI + data foundation.** The Expo default UI (two demo tabs) is unchanged, but a pure-TypeScript local-first data layer now exists under `src/data/` (staff / product / stock-record / audit / derived inventory over a typed storage port). No screen consumes it yet — the surface is "data layer ready, UI greenfield".
- Main languages / frameworks: TypeScript + React 19.2, React Native 0.86, Expo SDK 57 (`expo-router` file-based routing, `expo-image`, `expo-symbols`, `expo-web-browser`, `react-native-reanimated` 4.5, `react-native-worklets`, `react-native-safe-area-context`).
- Runtime / deployment shape: client-only RN app; iOS / Android / web (`web.output: static`). No backend, no persistence, no network calls.
- Primary entry types: app route screens (`src/app/*.tsx`) consumed by `expo-router/entry` ([package.json:3](../../../package.json#L3)).
- Confidence:
  - confirmed: app structure, routing, theme system, component set, scripts, config, and the `src/data/` layer (storage port, repositories, audit, derived inventory — all Jest-covered).
  - inferred: nothing at the UI/product level — no screen consumes the data layer yet.
  - unknown: UI for shop management, the real `expo-sqlite` adapter (stub only), navigation beyond two tabs.

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
  - [src/app/index.tsx](../../../src/app/index.tsx): Home screen.
  - [src/constants/theme.ts](../../../src/constants/theme.ts): colors, fonts, spacing — the styling substrate.
  - [app.json](../../../app.json): expo config + experiments (`typedRoutes`, `reactCompiler`).
  - [src/data/port.ts](../../../src/data/port.ts): the storage contract every repository is built on (single test seam).
- Edges / Children: the nine nodes below.
- Evidence: source files listed throughout; [package.json](../../../package.json) dependency set.
- Unknowns: none — domain vocabulary is captured in [CONTEXT.md](../../../CONTEXT.md); key decisions in [docs/adr/](../../../docs/adr/).
- Next Drill-Down: read the **Module Index** for layout, **Domain And Data** for the data layer, **Entry Index** for route semantics, **Risk Areas** for the unstable APIs.

### Node: Capability Index

- Type: `capability`
- Status: `confirmed` (template capabilities only) / `inferred` (no product capabilities exist)
- Purpose: what the app *does* today, to distinguish scaffolding from real features.
- Children:
  - `home-screen` — welcome + dev hints. Main module: [src/app/index.tsx](../../../src/app/index.tsx). Entry: `index` route. Feature CodeMap: pending. Status: `confirmed` (template demo).
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
  - `src/data/` — local-first data layer (see **Domain And Data** node). Responsibility: storage port + adapters, repositories (staff/product/stock-record), audit log, derived inventory. Key deps: `jest`/`ts-jest` (dev only). Risk: `expo-sqlite` adapter is a compiling stub — no device store wired yet.
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
    - `src/app/index.tsx` → `index` tab ("Home").
    - `src/app/explore.tsx` → `explore` tab ("Explore").
  - CLI / commands: `npm start` (`expo start`), `npm run android|ios|web`, `npm run lint`, `npm run reset-project` ([package.json:12-19](../../../package.json#L12-L19)).
- Evidence: [package.json](../../../package.json) scripts + route files.
- Unknowns: none.
- Validation: `npm start` then press `a`/`i`/`w`.
- Next Drill-Down: expo-router file conventions (https://docs.expo.dev/versions/v57.0.0/) before adding routes — `typedRoutes` is on, so route names are type-checked.

### Node: Domain And Data

- Type: `object`
- Status: `confirmed` (data layer) / `inferred` (no UI consumes it yet)
- Purpose: domain objects, persistence, and the derived read model for shop management.
- Children:
  - **Storage port** — [src/data/port.ts](../../../src/data/port.ts): `StoragePort`, the single test seam — a dumb typed row-store (`withTransaction` / `insert` / `findById` / `update` / `find`), plus `HasId` and `Query`. No `remove` on the surface (PRD invariant: no hard deletes). All business logic lives in pure-TS repos above the port; resist pushing query/aggregation logic down here.
  - **Adapters** — [src/data/in-memory.ts](../../../src/data/in-memory.ts): `InMemoryAdapter` (used by every test; transactional rollback via snapshots). [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts): `ExpoSqliteAdapter` — compiling stub only, every method throws; the `expo-sqlite` package is not in dependencies yet (separate non-TDD task + device smoke).
  - **Primitives** — [src/data/primitives.ts](../../../src/data/primitives.ts): `Cents` brand int (money as integer cents via `cents()`); qty is a plain int.
  - **Repositories** — [src/data/staff.ts](../../../src/data/staff.ts) + [src/data/product.ts](../../../src/data/product.ts): CRUD with soft-delete (`voided_at`) + restore, search, audit-wired via a shared `mutate()` template (read → compute patch → persist → audit, inside `withTransaction`). [src/data/stock-record.ts](../../../src/data/stock-record.ts): posting freezes each line's `title` + `unit_price` snapshot from the product; edit resnapshots touched lines (stable-id merge — untouched lines keep their original snapshot; UPSERT semantics, never drops unmentioned stored lines); void sets `voided_at` (items never erased).
  - **Audit** — [src/data/audit.ts](../../../src/data/audit.ts): `AuditProvider` — field-level diff on each mutate; read-only timeline query. Stock-record **create** is intentionally NOT audited (only edit/void are).
  - **Derived inventory** — [src/data/inventory.ts](../../../src/data/inventory.ts): `Inventory` — read-only projection; `balance` / `staffInventory` / `shopAggregate` recomputed from the unvoided ledger every call (never stored → no drift; instant cost revaluation against current price; negative qty allowed = 欠货).
  - Config namespaces: `expo.*` in [app.json](../../../app.json) only.
- Evidence: 9 modules under `src/data/` + 8 Jest suites (64 tests); [port.ts](../../../src/data/port.ts) doc-comment records the DESIGN-IT-TWICE port decision.
- Unknowns: the composition root (who constructs the repos + which adapter) is undecided — currently only tests wire them. (Domain vocabulary: [CONTEXT.md](../../../CONTEXT.md); key decisions: [docs/adr/](../../../docs/adr/).)
- Validation: `npm test` covers every module against `InMemoryAdapter`; the real `expo-sqlite` path has no test, by design (verified later by device smoke).
- Next Drill-Down: read [port.ts](../../../src/data/port.ts) first (the contract), then [stock-record.ts](../../../src/data/stock-record.ts) (the core write module) and [inventory.ts](../../../src/data/inventory.ts) (the deepest read module).

### Node: External Dependencies

- Type: `dependency`
- Status: `confirmed`
- Purpose: what the app reaches outside its own code for — currently only the Expo/RN platform and the OS browser.
- Children:
  - Third-party SDKs (all Expo-managed, SDK 57 pinned): `expo-router`, `expo-image`, `expo-symbols`, `expo-web-browser`, `expo-device`, `expo-glass-effect`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-constants`, `expo-linking`; RN community: `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`. See [package.json](../../../package.json).
  - External web links: opened via `expo-web-browser` in-app browser — [src/components/external-link.tsx](../../../src/components/external-link.tsx) (`ExternalLink`).
  - Storage / filesystem: none wired to a device store yet — [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts) is a compiling stub and the `expo-sqlite` package is **not** in dependencies; tests run against `InMemoryAdapter` only.
  - Auth / network: none.
  - Observability: none.
- Edges:
  - used by: `ExternalLink` → `expo-web-browser`; `animated-icon.tsx` → `react-native-worklets` (`scheduleOnRN`); themed components → `Colors` from [theme.ts](../../../src/constants/theme.ts).
  - failure surfaces: splash hide relies on `expo-splash-screen` + `onLayout`; external links fall back to OS browser when `EXPO_OS === 'web'`.
- Evidence: import statements in source + dependency list.
- Unknowns: none for current surface.
- Validation: boot animation completes → `AnimatedSplashOverlay` unmounts via `scheduleOnRN(setVisible, false)`.
- Next Drill-Down: when adding a backend/storage, add a row here and an ADR in `docs/adr/`.

### Node: Cross-Module Flows

- Type: `flow`
- Status: `confirmed`
- Purpose: the two runtime chains worth knowing before editing.
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
- Evidence: traced import/call chains in source.
- Unknowns: none.
- Validation: toggle device dark mode → colors flip across all screens.
- Next Drill-Down: only if touching theme or splash.

### Node: Validation

- Type: `validation`
- Status: `confirmed`
- Purpose: how to prove the app still works — note the gaps.
- Validation Entry:
  - Test commands: `npm test` (`jest`) and `npm run typecheck` (`tsc --noEmit`) — [package.json:44-45](../../../package.json#L44-L45).
  - Test directories: `src/data/*.test.ts` — 8 suites / 64 tests covering the storage port, primitives, in-memory adapter, audit, staff, product, stock-record (post/edit/void + FK), inventory, and the expo-sqlite stub contract.
  - Lint: `npm run lint` (`expo lint`).
  - Local run: `npm start` → `a` (Android) / `i` (iOS) / `w` (web).
  - Smoke paths: boot → splash hides → Home tab renders welcome + hints; Explore tab renders collapsibles; dark/light switch correct.
  - Logs / metrics: none.
  - Known CI checks: none in repo.
- Edges:
  - proves: app boots, routes resolve, theme switches, splash completes; the `src/data/` layer's behaviour (posting, snapshots, voids, audit diffs, derived balances) via Jest against `InMemoryAdapter`.
  - does not prove: behaviour against real `expo-sqlite` on a device (adapter is a stub), or any UI (no screen consumes the data layer yet).
- Evidence: [package.json](../../../package.json) `test` + `typecheck` scripts; [jest.config.js](../../../jest.config.js) (ts-jest, diagnostics off, `@/` alias → `./src/*`).
- Unknowns: device/UI test strategy (React Native Testing Library / detox) — not yet set up; only the pure-TS data layer is unit-tested.
- Next Drill-Down: Jest test imports come from `@jest/globals` (Expo's `moduleDetection:force` breaks `@types/jest` env globals); time-dependent tests use `jest.useFakeTimers` + `setSystemTime`.

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
  - **`expo-sqlite` adapter is a stub** — [src/data/expo-sqlite.ts](../../../src/data/expo-sqlite.ts) throws on every method and the `expo-sqlite` package is not even in dependencies. Real schema/migrations + device smoke are a separate task before any UI ships.
  - **Data layer has no UI consumer** — repositories are constructed only inside test `setup()` functions; no screen/hook/app composition root wires them yet, so DI is undecided.
- Unknowns: whether `expo-glass-effect` / `expo-symbols` APIs will be used by planned features.
- Validation: after editing a component, run on all three platforms (`a`/`i`/`w`).
- Next Drill-Down: re-read the specific unstable/experimental API's v57 docs before extending.

### Node: Feature CodeMap Backlog

- Type: `capability`
- Status: `inferred`
- Purpose: features implied by the project name but not yet built — candidates for depth-first maps once started.
- Backlog:
  - `note-taking` — Why: "shop-note" name implies notes/lists. Likely entry: new route under `src/app/`. Likely files: new `src/app/notes*.tsx`, a store/persistence module (none exists). Priority: high (first real feature).
  - `shopping-list-or-items` — Why: "shop" half of the name. Likely entry: list screen + item components. Likely files: under `src/components/` + a data layer. Priority: high.
  - `persistence` — **Partially built.** The typed `StoragePort` + `InMemoryAdapter` are landed and Jest-covered ([src/data/](../../../src/data/)); the production `expo-sqlite` adapter is still a stub (see Risk Areas). Remaining: real SQL schema/migrations + a composition root that wires repositories into the app. Priority: unblocks UI for shop management.
- Evidence: project name + specs under `.scratch/2026-07-08-shop-management-system/` + the `src/data/` layer + [CONTEXT.md](../../../CONTEXT.md) glossary + [docs/adr/](../../../docs/adr/).
- Unknowns: UI scope for the shop-management screens; offline/sync needs (PRD is local-first, no sync planned).
- Next Drill-Down: run `/to-prd` on the first feature; create `CONTEXT.md` via `/domain-modeling` when terms settle.

## 3. Compact Indexes

### Capability Index Table

| Capability        | Main Modules                                              | Entry                  | Feature CodeMap          | Status    |
| ----------------- | --------------------------------------------------------- | ---------------------- | ------------------------ | --------- |
| home-screen       | [index.tsx](../../../src/app/index.tsx)                   | `index` route          | pending                  | confirmed |
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
| data layer       | [src/data/](../../../src/data/)            | storage port + repos + audit + derived inventory | jest/ts-jest (dev only)                              | `expo-sqlite` adapter is a stub; no UI consumer |
| reset script     | [scripts/reset-project.js](../../../scripts/reset-project.js) | template reset utility                  | node fs/path                                                 | deletable after real dev starts            |

### Cross-Module Flow Table

| Flow                | Modules                                                            | Entry                                  | Effect                              | Drill-Down                                   |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------- | ----------------------------------- | -------------------------------------------- |
| app boot → tabs     | entry → `_layout` → `AnimatedSplashOverlay` + `AppTabs` → routes   | `preventAutoHideAsync()` (`_layout:8`) | splash plays, hides, tabs render    | [animated-icon.tsx](../../../src/components/animated-icon.tsx) |
| theme resolution    | RN `useColorScheme` → `useTheme` → `Colors` → themed components    | `ThemeProvider` (`_layout:13`)         | light/dark tokens applied app-wide  | [theme.ts](../../../src/constants/theme.ts)   |

### Quick File Index

- [src/app/_layout.tsx](../../../src/app/_layout.tsx): root layout / providers — start here.
- [src/components/app-tabs.tsx](../../../src/components/app-tabs.tsx): tab navigator (uses unstable API).
- [src/constants/theme.ts](../../../src/constants/theme.ts): all theme tokens.
- [src/hooks/use-theme.ts](../../../src/hooks/use-theme.ts): scheme → colors.
- [src/data/port.ts](../../../src/data/port.ts): storage contract — the single test seam under the data layer.
- [app.json](../../../app.json): expo config + experiments.
- [package.json](../../../package.json): scripts + dependency pins.

## 4. Maintenance Notes

- Refresh this Project CodeMap when module boundaries, entry types, external dependencies, or validation commands change (e.g. a test runner is added, a backend/persistence layer lands, routes grow beyond two tabs).
- Do **not** refresh the whole map for a narrow feature edit — update or create the relevant Feature CodeMap (`docs/codemap/<feature>.md`) instead, via `/codemap` in `feature` mode.
- Re-run `/codemap` drift-check before trusting this map if `src/app/`, `src/components/`, `src/constants/theme.ts`, or `src/data/` have changed since `Last updated`.
