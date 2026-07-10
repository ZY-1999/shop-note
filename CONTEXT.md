# shop-note — Project Context

> Single-context glossary for the shop-management domain. Source of truth for ubiquitous language; code and specs defer to the terms here. Created 2026-07-08 during the SDD build of the data layer (specs #01–#07); extended 2026-07-09 for the UI layer (composition root + first screens + `dailyFlow` read model + RNTL component testing).

## What this is

`shop-note` is a **local-first, single-operator, offline** shop management app (Expo SDK 57 / React Native). No backend, no sync. The data layer ([src/data/](src/data/)) — staff, products, stock records, audit, and derived inventory over a typed storage port — is production-grade. The **UI layer is now in progress**: a composition root wires the repositories into React, and the first shop-management screens (bookkeeping / summary / manage) are being built on top. See the [UI 层架构](#ui-层架构) section below, [ADR-0005](docs/adr/0005-ui-layer-architecture.md), and [ADR-0006](docs/adr/0006-ui-component-testing-rntl.md).

Key decisions live in [docs/adr/](docs/adr/); the code terrain is mapped in [docs/codemap/project.md](docs/codemap/project.md).

## Ubiquitous Language

| Term | Meaning | Notes |
|---|---|---|
| **会员 Staff** | A shop member — stock records are attributed via `staff_id`; carries a 手动会员等级 `level` (`normal`=普站 / `gold`=金站, single-source `STAFF_LEVELS` registry; lists sort 金站-first). Display word renamed from 「员工」 on 2026-07-10 — code identifier `Staff`/`staff_id` unchanged (cf. the direction display-label rename precedent — 出库↔出单, enum unchanged). | Soft-deleted via `voided_at`. |
| **商品 Product** | Anything that can be moved in/out of stock. Fields: `title`, `code`, `category`, `purchase_price`. | Soft-deleted via `voided_at`. |
| **进价 purchase_price** | A product's current purchase price, in `Cents`. | Drives cost revaluation; stored on the product, not the record. |
| **库存记录 Stock Record** | One in/out event (`direction: "in" \| "out"`), attributed to a staff, carrying one or more **条目**. | `create` is not audited; `edit`/`void` are. |
| **条目 Stock Item** | A line within a stock record: product ref + qty + a frozen snapshot. | `line_amount = unit_price × qty`. |
| **快照 Snapshot** | At posting time each item freezes `title` + `unit_price` from the product. | On edit, only *touched* lines resnapshot to the current price; untouched lines keep their original snapshot. |
| **Cents** | Branded integer type for money (units = 分, not 元). Avoids float error. | See [src/data/primitives.ts](src/data/primitives.ts). |
| **line_amount** | An item's amount = `unit_price × qty`, in `Cents`. | Computed at posting, stored on the item. |
| **派生余额 Derived balance** | `balance(staff, product) = Σ(in qty, unvoided) − Σ(out qty, unvoided)`. | **Never stored** — recomputed every read (ADR-0002). |
| **成本金额 cost_amount** | `current purchase_price × balance qty`, in `Cents`. | Revalued instantly on price change (never stored). |
| **店铺汇总 shopAggregate** | Cross-staff sum of balances/cost per product. | Derived, never stored. |
| **每日流水 dailyFlow** | Per (day, staff) sum of snapshot `line_amount`, split by direction (`in`/`out`), newest day first. | Derived read model (same rule as ADR-0002 — never stored); excludes voided; amounts are **historical snapshot**, not current-price-revalued. |
| **欠货 Negative inventory** | `balance < 0` (more `out` than `in`). Allowed — returned as-is, no clamp, no error. | PRD invariant. |
| **作废 Void** | Soft-delete: set `voided_at`. The record + its items remain (never hard-removed); excluded from `list`/`staffHistory`/derivation. | No `delete` API exists anywhere (ADR-0001). |
| **审计 Audit** | Per-mutate field-level diff timeline. Actions: `create`/`update`/`void`/`restore`. | Stock-record `create` is intentionally not audited. |
| **StoragePort** | The single test seam — a dumb typed row store (`withTransaction`/`insert`/`findById`/`update`/`find`). | Two adapters: `InMemoryAdapter` (tests) / `ExpoSqliteAdapter` (production, backed by `expo-sqlite`). See ADR-0001, ADR-0003. **`withTransaction` is not reentrant.** |
| **组合根 Composition root** | The one place that constructs the repo set at app boot: `ExpoSqliteAdapter.open()` → `setupRepos()` → React Context. | UI's only entry to the data layer; see [ADR-0005](docs/adr/0005-ui-layer-architecture.md). |

## Invariants

These hold across the whole data layer; code is shaped to make breaking them hard.

1. **No hard deletes.** Everything is voided (`voided_at`), never erased. `StoragePort` has no `remove`.
2. **Money is integer `Cents`.** Never a float. Quantities are plain integers.
3. **Snapshots are frozen at posting.** An item's `title`/`unit_price` don't track the product after posting — except a *touched* line on edit, which resnapshots to the then-current price.
4. **Derived figures are never stored.** Balances/cost/aggregate/**dailyFlow** are recomputed from the ledger every read (ADR-0002).
5. **Negative inventory is allowed.** No clamp, no error — 欠货 is a real state.
6. **Every mutate is audited** (except stock-record `create`) inside a `withTransaction` — no change without an audit entry, no audit entry without a change.

## UI 层架构

The data layer is consumed by a thin UI layer (the system PRD calls UI a "thin consumer"):

- **组合根 Composition root** — at app boot, `ExpoSqliteAdapter.open("shop_note.db")` → `setupRepos(adapter)` constructs the repo set, injected via React Context. `setupRepos` (formerly smoke-only) is lifted to a shared module so UI and smoke share one wiring. DB-not-ready holds the splash; open failure shows an error screen + retry.
- **数据流** — UI reads/writes through React Query hooks (`useStaff` / `useProducts` / `useStockRecords` / `useInventory` / `useDailyFlow`); writes invalidate the affected queries so derived reads refresh automatically. Derived reads stay pure-and-recomputed (ADR-0002) — performance is controlled by precise invalidation, not by caching results.
- **导航** — three tabs: 记账 (bookkeeping, home) → 汇总 (summary) → 管理 (manage). 记账 is staff-centric (search a staff → post in/out); the `dailyFlow` report lives under 汇总.
- **样式** — RN `StyleSheet` + extended `theme.ts` semantic tokens (success/danger/warning/border/inputBg/accent); no NativeWind / component library. Native inputs (TextField/Picker/SegmentedControl) use the already-installed `@expo/ui` where it helps.
- **页面优化重构 (2026-07-10)** — 记账 / 员工详情 / 汇总三屏 UX 重构（管理页另算）：`direction: out` 的展示词现为「出库」(2026-07-10 page-refactor 曾改「出单」, 同日回滚；数据层 enum `out` 始终不变)；日期统一 `YYYY/MM/DD`（datetime 控件用 `YYYY/MM/DD HH:mm`）；长列表（员工详情历史 / 汇总流水）按天倒序 + **UI 级分批渲染**（[ADR-0007](docs/adr/0007-list-batched-rendering.md)）；汇总屏抛弃四段切换，改为时间段选择 + 库存卡 + 按天×员工流水。**口径区分**：库存卡金额 = as-of-now 现价快照（不受时间段影响），流水段金额 = 选定时间段内的历史快照 `line_amount`（与 [ADR-0002](docs/adr/0002-derived-inventory-never-stored.md) 一致）。
- **会员化改名 + 会员等级 (2026-07-10)** — 全局展示词「员工」→「会员」（代码标识符 `Staff`/`staff_id`/`staff` 表/路由不动，复刻「出库→出单」先例）；`Staff` 增手动 `level` 字段（`normal`=普站 / `gold`=金站，单源 `STAFF_LEVELS`），仓储列表金站优先排序，管理表单提供等级选择器（默认普站、可手动改），列表行/`staff-row`/会员详情展示等级徽标（金站 accent、普站省略）。`level` 走既有审计；schema 加列 + v2 迁移 `ALTER ... DEFAULT 'normal'` 回填老会员为普站（v1 staff DDL 冻结为历史字面量以规避动态 DDL 的 duplicate-column 陷阱，`ColDef.default` 使 `createTableSql` 与 ALTER 的 DEFAULT 对称）。

UI testing ([ADR-0006](docs/adr/0006-ui-component-testing-rntl.md)): derived pure logic (`dailyFlow` etc.) is Jest-covered against `InMemoryAdapter`; **screens / hooks / user-behavior flows are covered by React Native Testing Library component tests** using the real `InMemoryAdapter` (no Repos mocking), driven from user actions (search → post → observe). Real SQL execution stays with the [ADR-0004](docs/adr/0004-adapter-verification-device-smoke.md) device smoke; dark-mode / feel stay manual.

## Pointers

- **System PRD**: [.scratch/2026-07-08-shop-management-system/01-shop-management-system.md](.scratch/2026-07-08-shop-management-system/01-shop-management-system.md)
- **UI PRD**: [.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md](.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md)
- **页面重构 PRD**: [.scratch/2026-07-10-page-refactor/01-page-refactor.md](.scratch/2026-07-10-page-refactor/01-page-refactor.md)
- **Specs**: [.scratch/2026-07-08-shop-management-system/specs/](.scratch/2026-07-08-shop-management-system/specs/)
- **ADRs**: [docs/adr/](docs/adr/) (incl. [ADR-0005 UI 层架构](docs/adr/0005-ui-layer-architecture.md), [ADR-0006 UI 组件测试](docs/adr/0006-ui-component-testing-rntl.md), [ADR-0007 列表分批渲染](docs/adr/0007-list-batched-rendering.md))
- **CodeMap**: [docs/codemap/project.md](docs/codemap/project.md)
