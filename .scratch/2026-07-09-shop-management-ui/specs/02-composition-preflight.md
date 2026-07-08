# Composition preflight — extract setupRepos/Repos to a shared module + wire dailyFlow + sync smoke

Type: spec
Status: ready-for-agent # Gate A approved 2026-07-09 — adversarial review PASS (cfd1fa6), human approved the 9-spec breakdown; entering Stage 2 (/tdd)
Parent: #01
Blocked by: #1

## Goal

"Make the change easy, then make the easy change": lift the repo-set assembly (`setupRepos` + the `Repos` type) out of the device-smoke subpackage into a shared data-layer module, add `dailyFlow` (#1) to the set, and keep the existing 11 Jest suites + the 22-step cross-adapter smoke green — so both the UI composition root (#3/#4) and the smoke import one wiring, and the PRD-flagged smoke ripple is de-risked before any UI lands.

## Acceptance criteria

- [ ] `setupRepos` + `Repos` are defined once in `src/data/composition.ts`; `src/data/smoke/behavior-script.ts` imports them from there (no duplicate definition) — proves single-source wiring (ADR-0005).
- [ ] `Repos` includes `dailyFlow: DailyFlow`; `setupRepos` constructs it — proves the new read model is part of the standard repo set.
- [ ] The 22-step `behaviorScript` still runs unchanged against both adapters (InMemory Jest half passes) — proves the move is behavior-preserving.
- [ ] A new smoke step asserts a `dailyFlow.flow()` result (e.g. the posted record's day appears with the right in/out amount), and its InMemory Jest half passes — proves dailyFlow is exercised cross-adapter like the other reads.
- [ ] `npm test` (all suites, incl. smoke's InMemory half) and `npm run typecheck` are green after the move — proves nothing else broke.

## Scope

- **In**: new `src/data/composition.ts` (`Repos` interface + `setupRepos`, including `dailyFlow`); re-export or import-update in `src/data/smoke/behavior-script.ts`; add one `dailyFlow` assertion step to `behaviorScript`; `src/data/smoke/behavior-script.test.ts` updated for the new step count.
- **Out**: any React/Context/React Query (that is #3); any UI; changing repo internals; changing `run-smoke.ts`'s device-runner mechanics (it already takes `behaviorScript` as default — unaffected by a new step); moving other smoke helpers (`stable.ts` stays put).

## Context

- `Repos` + `setupRepos` today live in [src/data/smoke/behavior-script.ts](../../../../src/data/smoke/behavior-script.ts) (lines ~25-43) — built for the cross-adapter smoke; ADR-0005 lifts them to a shared module (`src/data/composition.ts`) so UI and smoke share one wiring.
- PRD 补充说明 flags the ripple: "`setupRepos` / `Repos` 类型改动（接入 `dailyFlow`）会波及 smoke 的 22 步 behaviorScript——spec 同步（至少编译通过，酌情加 dailyFlow 断言步）". This spec does exactly that.
- The smoke runner ([src/data/smoke/run-smoke.ts](../../../../src/data/smoke/run-smoke.ts)) takes `behaviorScript` as its default and is agnostic to step count — adding a step needs no runner change (confirmed in behavior-script.ts doc-comment).
- `dailyFlow` is built in #1; this spec wires it in.

## Design

- **Interface delta** — a new shared module is the single assembly point:
  ```ts
  // src/data/composition.ts
  export interface Repos {
    storage: StoragePort;
    audit: AuditProvider;
    products: ProductRepository;
    staff: StaffRepository;
    stockRecords: StockRecordRepository;
    inventory: Inventory;
    dailyFlow: DailyFlow;          // NEW (#1)
  }
  export function setupRepos(storage: StoragePort): Repos  // one wiring for UI + smoke
  ```
  `setupRepos` constructs `dailyFlow = new DailyFlow(stockRecords)` alongside the existing `inventory`. `behavior-script.ts` replaces its local `Repos`/`setupRepos` with `import { Repos, setupRepos } from "@/data/composition"`; the `Repos` references in its step bodies are unchanged (same field names).
- **Internal architecture** — a pure relocation + one field. `behaviorScript` gains one step **inserted BEFORE the existing `stock-record: void` step** (while the record is still unvoided, so the flow is non-empty and the assertion is meaningful). Placing it AFTER the `product: update` (price 1995→2495) step additionally proves the snapshot semantics — the day's in_amount is the frozen `line_amount` (≈1995×qty), NOT the current 2495 price:
  ```ts
  { name: "dailyFlow: per (day,staff) in/out from snapshot line_amount",
    run: async (repos) => {
      const s = await activeStaff(repos);
      const flow = await repos.dailyFlow.flow({ staff_id: s.id });
      return flow;  // non-empty here — the 'in' record is still active (void step runs later)
    } }
  ```
  The step runs against both adapters in the device smoke; its InMemory half is Jest-covered (same as every other step). `stable()` ([src/data/smoke/stable.ts](../../../../src/data/smoke/stable.ts)) already scrubs `*_at`/`timestamp` → `<time>`; the `date` string on `DailyFlowRow` is derived from a timestamp, so it is volatile across runs — note for the step: `stable()` must also collapse the `date` field (or the compare will flake on day boundaries). **Design note**: either extend `stable()` to map `date`→`<date>`, or have the step return only the in/out amounts (not the date) so the cross-adapter compare is stable. Prefer extending `stable()` to normalize `date` (consistent with how it already normalizes `*_at`).
  - Trivial internals beyond the above — this is a refactor, not new logic. The risk is the smoke ripple, contained by the green-test acceptance criteria.

## Rework on failure

Failure is isolated to the assembly wiring — no business logic changes. If the move breaks the smoke, revert the import in `behavior-script.ts`; `composition.ts` is additive and can land independently of the smoke step.
