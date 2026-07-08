# shop-note CodeMap (project)

## 1. Orientation

- Last updated: `2026-07-08`
- Project: `shop-note` — Expo SDK 57 / React Native app (name from [app.json](../../../app.json), slug `shop-note`, scheme `shopnote`).
- Role / responsibility: **Template-stage scaffold.** No shop/note business logic exists yet — the source is the Expo default starter (two demo tabs). Treat the app surface as greenfield; the terrain below is scaffolding to build on, not a product.
- Main languages / frameworks: TypeScript + React 19.2, React Native 0.86, Expo SDK 57 (`expo-router` file-based routing, `expo-image`, `expo-symbols`, `expo-web-browser`, `react-native-reanimated` 4.5, `react-native-worklets`, `react-native-safe-area-context`).
- Runtime / deployment shape: client-only RN app; iOS / Android / web (`web.output: static`). No backend, no persistence, no network calls.
- Primary entry types: app route screens (`src/app/*.tsx`) consumed by `expo-router/entry` ([package.json:3](../../../package.json#L3)).
- Confidence:
  - confirmed: app structure, routing, theme system, component set, scripts, config (read from source).
  - inferred: nothing above template level — "shop-note" domain intent is inferred from the project name only.
  - unknown: intended shop/note features, data model, future navigation beyond two tabs.

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
- Edges / Children: the eight nodes below.
- Evidence: source files listed throughout; [package.json](../../../package.json) dependency set.
- Unknowns: no `CONTEXT.md` exists yet — domain language for "shop note" is undefined until `/domain-modeling` runs.
- Next Drill-Down: read the **Module Index** for layout, **Entry Index** for route semantics, **Risk Areas** for the unstable APIs.

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
- Status: `unknown`
- Purpose: domain objects / persistence — **none exist yet**.
- Children:
  - Core domain objects: none.
  - Database tables / models: none.
  - State / stores: none beyond local component `useState`.
  - Config namespaces: `expo.*` in [app.json](../../../app.json) only.
- Evidence: no data/import/store files under `src/`; dependency set has no DB/storage/async-storage/net client.
- Unknowns: the entire "shop note" domain model is undefined — first feature work should go through `/domain-modeling` and seed `CONTEXT.md`.
- Validation: n/a.
- Next Drill-Down: none until a feature introduces data.

### Node: External Dependencies

- Type: `dependency`
- Status: `confirmed`
- Purpose: what the app reaches outside its own code for — currently only the Expo/RN platform and the OS browser.
- Children:
  - Third-party SDKs (all Expo-managed, SDK 57 pinned): `expo-router`, `expo-image`, `expo-symbols`, `expo-web-browser`, `expo-device`, `expo-glass-effect`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-constants`, `expo-linking`; RN community: `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`, `react-native-screens`, `react-native-gesture-handler`. See [package.json](../../../package.json).
  - External web links: opened via `expo-web-browser` in-app browser — [src/components/external-link.tsx](../../../src/components/external-link.tsx) (`ExternalLink`).
  - Storage / filesystem: none.
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
  - Test commands: **none** — no test runner configured.
  - Test directories: none.
  - Lint: `npm run lint` (`expo lint`) — [package.json:13](../../../package.json#L13).
  - Local run: `npm start` → `a` (Android) / `i` (iOS) / `w` (web).
  - Smoke paths: boot → splash hides → Home tab renders welcome + hints; Explore tab renders collapsibles; dark/light switch correct.
  - Logs / metrics: none.
  - Known CI checks: none in repo.
- Edges:
  - proves: app boots, routes resolve, theme switches, splash completes.
  - does not prove: correctness of any future business logic (no unit/integration tests exist yet).
- Evidence: [package.json](../../../package.json) has only `lint` among quality scripts.
- Unknowns: whether a test runner (Jest / React Native Testing Library) is intended — `@types/react-test-renderer` and `@testing-library/user-event` appear in the lockfile but no test script or `*.test.*` files exist.
- Next Drill-Down: when adding tests, pick a runner, add a `test` script, and record the command here.

### Node: Risk Areas

- Type: `risk`
- Status: `confirmed`
- Purpose: terrain facts that can bite the next edit.
- Risks:
  - **Unstable native tabs API** — [src/components/app-tabs.tsx:1](../../../src/components/app-tabs.tsx#L1) imports `expo-router/unstable_native_tabs`. Source: import path carries `unstable_`. Affected: tab navigation across all platforms. Suggested Feature CodeMap: `docs/codemap/tab-navigation.md` when customizing tabs.
  - **React Compiler experiment enabled** — [app.json](../../../app.json) `experiments.reactCompiler: true`. Affected: all components (compiler transforms run). Verify components follow rules-of-react before assuming manual memo is needed.
  - **Typed routes on** — `experiments.typedRoutes: true`; route names are type-checked, so a renamed file must update all `Href`/`Link` references.
  - **No tests** — zero safety net for refactors; see Validation node.
  - **`.web.tsx` platform variants** — `app-tabs`, `animated-icon`, `use-color-scheme` each have a web sibling; editing one without the other creates platform drift.
  - **Template not yet customized** — risk of treating demo screens as product behavior.
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
  - `persistence` — Why: notes/lists need storage; no storage dep present. Likely entry: a hook/store wrapping a storage lib. Likely files: `src/hooks/` or `src/store/`. Priority: blocking for the above.
- Evidence: project name only — no source, no spec, no `CONTEXT.md`.
- Unknowns: scope, data model, and offline/sync needs are entirely undecided.
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
- [app.json](../../../app.json): expo config + experiments.
- [package.json](../../../package.json): scripts + dependency pins.

## 4. Maintenance Notes

- Refresh this Project CodeMap when module boundaries, entry types, external dependencies, or validation commands change (e.g. a test runner is added, a backend/persistence layer lands, routes grow beyond two tabs).
- Do **not** refresh the whole map for a narrow feature edit — update or create the relevant Feature CodeMap (`docs/codemap/<feature>.md`) instead, via `/codemap` in `feature` mode.
- Re-run `/codemap` drift-check before trusting this map if `src/app/`, `src/components/`, or `src/constants/theme.ts` have changed since `Last updated`.
