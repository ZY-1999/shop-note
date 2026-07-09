# Production app shell — AppProvider boot/splash/error + 3-tab nav + per-tab Stack + smoke relocation

Type: spec
Status: ready-for-human # implemented via /tdd 2026-07-09 (Stage 2). AC3 + AC4(mock-router) RNTL-green; AC1/AC2/AC5 implemented, device-confirmed pending; AC6 inspection-verified. Awaits Stage 3 review.
Parent: #01
Blocked by: #3

## Goal

The production container every shop-management screen lives in: at boot, open the real `shop_note.db` and feed the `Repos` into #3's providers (holding the splash until the DB is ready, showing a retryable error screen if open fails); restructure the template's two demo tabs into three business tabs (记账 / 汇总 / 管理) each with its own stack for detail/form sub-screens; and relocate the `__DEV__` device smoke out of the old Home into a 管理 dev-only region. After this spec the three tabs exist and navigate; later specs fill their content.

## Acceptance criteria

- [ ] Device: app boots straight to the **记账** tab (default), three tabs (记账 / 汇总 / 管理) are present and switchable, the Explore tab and template demo content are gone (stories 1, 2).
- [ ] Splash stays visible until the DB is ready (no blank/empty flash), then hides — the hide fires only when **both** DB-ready and layout-ready are true (stories 3, 36; PRD splash-coordination risk).
- [ ] `ExpoSqliteAdapter.open` rejecting (mocked to throw in RNTL) renders an error screen with a **重试** control; pressing it re-attempts open and, on success, recovers into the app — proves the no-crash error path (story 36).
- [ ] Within a tab, a detail/form screen pushes over the tab's list and **back** returns to the list (mock-router asserts the push call; device confirms the real stack) — proves per-tab Stack navigation.
- [ ] `__DEV__` smoke entry is reachable from the 管理 tab's dev-only region (not the old Home); running it hits the cross-adapter smoke against the dedicated `shop_note_smoke.db`, leaving the production `shop_note.db` untouched (ADR-0004; PRD smoke-relocation risk).
- [ ] The production DB opens with WAL + migrations (`ExpoSqliteAdapter.open`), one `setupRepos` wiring shared with the smoke (no second wiring) — proves single-source composition (ADR-0005, #2).

## Scope

- **In**: a production `AppProvider` (open DB → `setupRepos` → render `<AppProviders repos={repos}>` from #3; splash hide coordination; error + retry state); restructure navigation to three tabs with per-tab stacks; delete `src/app/explore.tsx` and strip template demo content; relocate the smoke entry to a 管理 dev-only region; tab placeholders so #5/#8/#9 can fill content.
- **Out**: the real content of 记账 (#5–#7), 汇总 (#8), 管理 (#9) — this spec ships placeholders/stubs only; repo/hook/provider internals (owned by #3); changing the smoke runner itself (#2 owns wiring; the runner is untouched).

## Context

- ADR-0005: production boot = `ExpoSqliteAdapter.open("shop_note.db")` → `setupRepos(adapter)` → React Context; DB-not-ready holds the splash; open failure → error screen + retry. `setupRepos`/`Repos` come from #2; the provider abstraction (`AppProviders`/`useRepos`) from #3.
- Current boot chain ([src/app/_layout.tsx](../../../../src/app/_layout.tsx)): `ThemeProvider` + `SplashScreen.preventAutoHideAsync()` + `AnimatedSplashOverlay` + `AppTabs`. The splash overlay ([src/components/animated-icon.tsx](../../../../src/components/animated-icon.tsx)) hides on layout via `scheduleOnRN`; DB-ready is a **second**, independent async stream — PRD flags merging the two hide triggers.
- Current tabs ([src/components/app-tabs.tsx](../../../../src/components/app-tabs.tsx)): `NativeTabs` (from `expo-router/unstable_native_tabs`) with two triggers (`index`/`explore`). PRD/codemap flag this as an **unstable API**; PRD requires verifying SDK57 `NativeTabs` can host a tab-internal Stack, else fall back to stable `Tabs` + nested routes.
- Smoke entry today: `SmokeEntry` in [src/app/index.tsx](../../../../src/app/index.tsx) (Home, `__DEV__`), dynamic-imports `@/data/smoke/run-smoke`; PRD relocates it to 管理 dev-only.
- `typedRoutes` is on — renaming/adding routes must keep `Href`/`Link` references consistent; `.web.tsx` siblings exist for `app-tabs`/`animated-icon`/`use-color-scheme` — web variants updated in lockstep (PRD 补充说明).
- Expo SDK57 docs: https://docs.expo.dev/versions/v57.0.0/ (read before writing routes / extending `NativeTabs`).

## Design

- **Interface delta** — production wiring + a three-tab shell:
  ```tsx
  <AppProvider>            // open DB → setupRepos → AppProviders(#3); splash/error states
    <AppTabs/>             // 3 tabs (记账 default / 汇总 / 管理), per-tab Stack
  </AppProvider>
  // useRepos() / hooks from #3 are now populated with the ExpoSqlite Repos
  ```
  Tab structure (behavioral, not file-prescriptive): three top-level tabs; within each, a **stack** so a list screen can push a detail/form/edit screen and `back` returns. Content = placeholders now (a `<BookkeepingTab/>`/`<SummaryTab/>`/`<ManageTab/>` stub), replaced by #5/#8/#9.
- **Internal architecture**:
  - **`AppProvider` boot** — `useEffect` on mount: `ExpoSqliteAdapter.open("shop_note.db")` → `setupRepos(adapter)` → `setRepos(...)` (ready); on throw → `setError(...)` (retryable). While `repos` is null and no error, render nothing visible (splash covers). On ready, render `<AppProviders repos={repos}>`. **Splash coordination**: expose/track a `dbReady` flag; the existing `AnimatedSplashOverlay` tracks layout-readiness; `SplashScreen.hideAsync()` fires only when both are true (merge the two async streams at one gated call) — this is the PRD's splash-coordination decision made concrete. **Error + retry**: on error state, render an error screen with a 重试 control that re-runs the open effect; the error path is what RNTL tests by mocking `open` to throw.
  - **Navigation** — the PRD-flagged risk. Build-time task (spec-stage): read the SDK57 `NativeTabs` doc and determine whether a `Trigger` can host a `Stack` (push/pop within a tab). **If yes**: three triggers (记账/汇总/管理), each wrapping its tab's stack. **If no**: fall back to the stable `expo-router` `Tabs` + a `(tabs)` route group with per-tab nested Stack layouts (the standard, stable pattern). The acceptance (per-tab push + back) holds either way; only the mechanism differs. Flag the chosen path in the evidence comment. Either way, `Explore` + template demo are removed and `typedRoutes` references are kept consistent.
  - **Smoke relocation** — move `SmokeEntry` into the 管理 tab stub's `__DEV__` region (the stub is this spec's; #9 thickens 管理 around it). The entry keeps its dynamic `import('@/data/smoke/run-smoke')` + dedicated `shop_note_smoke.db` (ADR-0004) — production `shop_note.db` is never touched.
  - **Deep-module note**: `AppProvider` hides "async DB open + migration + splash gating + error recovery" behind a "ready Repos or error" surface — the one production composition root (ADR-0005). Keep it the only place that references `ExpoSqliteAdapter` in the UI tree; everything below consumes `useRepos()`.

## Rework on failure

If `NativeTabs` cannot host a per-tab Stack, the fallback to stable `Tabs` + nested routes is a navigation-layer swap behind `AppTabs` — `AppProvider` (boot/splash/error) is unaffected. If the splash double-trigger proves racy, collapse both readiness flags into a single `useEffect`-driven gate inside `AppProvider`. The smoke relocation is independent of both and can land regardless.

## Comments

- 2026-07-09 — implemented via /tdd (sdd-flow Stage 2, spec #04). Acceptance criteria → evidence:
  - AC1 (3 tabs, boots to 记账) → `src/components/app-tabs.tsx` — stable `Tabs` with 记账/汇总/管理, `bookkeeping` listed first (default). Explore + template demo removed (`app/explore.tsx` + `app/index.tsx` deleted). **Device-confirmed pending** (tab bar renders + switches).
  - AC2 (splash coordination) → `src/app/_layout.tsx` — `AnimatedSplashOverlay` is a **child of `AppProvider`**, which renders children only once the DB is ready; the overlay's `onLayout → SplashScreen.hideAsync()` therefore fires only post-DB-ready (no flag-merging needed). On the error path children never mount, so `onError={() => SplashScreen.hideAsync()}` reveals the error screen. **Device-confirmed pending** (no blank flash, hide timing).
  - AC3 (error + retry) → `src/providers/app-provider.test.tsx` (2 tests GREEN) — `ExpoSqliteAdapter.open` mocked to reject → error screen with 重试 (`testID="retry"`); press → re-open → success → recovers into app content. `mockOpen` typed `jest.fn<(name:string)=>Promise<unknown>>`.
  - AC4 (per-tab Stack push) → `src/__tests__/bookkeeping-tab.test.tsx` (GREEN) — mocks `expo-router` `router`, presses the bookkeeping placeholder row, asserts `router.push("/bookkeeping/detail")`. `src/app/bookkeeping/_layout.tsx` = `<Stack/>`. Real stack push/back **device-confirmed pending**.
  - AC5 (smoke relocated) → `src/components/smoke-entry.tsx` (extracted from old Home) rendered in `src/app/manage/index.tsx` under `__DEV__`. Keeps the dynamic `import('@/data/smoke/run-smoke')` + dedicated `shop_note_smoke.db` (ADR-0004) — production `shop_note.db` untouched. **Device-confirmed pending** (reachable from 管理, runs against smoke db).
  - AC6 (single `setupRepos`) → `src/providers/app-provider.tsx` calls `setupRepos(adapter)` once on ready; the smoke imports the SAME `setupRepos` from `src/data/composition.ts` — no second wiring. Inspection-verified.
  - Full suite **18 suites / 116 tests GREEN**; `npx tsc --noEmit` exit 0.
- 2026-07-09 — **nav decision (flagged, spec-required)**: chose stable `expo-router` `Tabs` over `expo-router/unstable-native-tabs`. SDK57 `NativeTabs`+per-tab-Stack nesting could not be device-verified (docs unreachable; `unstable_` API); the spec sanctions this stable fallback (per-tab Stack via nested `_layout.tsx` directories is guaranteed). Bonus: `Tabs` is cross-platform, so the template's separate `app-tabs.web.tsx` is deleted (one tab bar for native + web). If a later spec wants the native tab-bar feel back, swap `AppTabs`'s `Tabs` for `NativeTabs` — `AppProvider`/routes are unaffected.
- 2026-07-09 — **relocation (prep, in #04)**: non-route modules were moved OUT of the expo-router `app/` dir so the shell bundles cleanly (only route files — with default exports — belong there): `app/providers.tsx` → `src/providers/providers.tsx`; `app/app-provider.tsx` → `src/providers/app-provider.tsx`; `app/staff-list-tracer.tsx` → `src/components/staff-list-tracer.tsx`; their tests moved alongside. Importers updated (`testing/render.tsx`, `hooks/reads.ts`, `hooks/mutations.ts`). Route-component tests live in `src/__tests__/` (expo-router scans only `app/`).
- 2026-07-09 — typedRoutes: deleted the stale local `.expo/types/router.d.ts` (gitignored build artifact; it predated the new routes and referenced deleted `/`, `/explore`). With it absent, `Href` falls back to `string | HrefObject` so `router.push("/bookkeeping/detail")` type-checks; the dev server regenerates it with the full route set (stricter, still passing) on first run.
