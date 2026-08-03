# shop-note — Project Context

> Single-context glossary for the shop-management domain. Source of truth for ubiquitous language; code and specs defer to the terms here. Created 2026-07-08 during the SDD build of the data layer (specs #01–#07); extended 2026-07-09 for the UI layer (composition root + first screens + `dailyFlow` read model + RNTL component testing).

## What this is

`shop-note` is a **local-first, single-operator, offline** shop management app (Expo SDK 57 / React Native). No backend, no sync. The data layer ([src/data/](src/data/)) — staff, products, stock records, audit, and derived inventory over a typed storage port — is production-grade. The **UI layer is now in progress**: a composition root wires the repositories into React, and the first shop-management screens (bookkeeping / summary / manage) are being built on top. See the [UI 层架构](#ui-层架构) section below, [ADR-0005](docs/adr/0005-ui-layer-architecture.md), and [ADR-0006](docs/adr/0006-ui-component-testing-rntl.md).

Key decisions live in [docs/adr/](docs/adr/); the code terrain is mapped in [docs/codemap/project.md](docs/codemap/project.md).

## Ubiquitous Language

| Term | Meaning | Notes |
|---|---|---|
| **会员 Staff** | A shop member — the money-side actor (top-up + checkout). Carries a 手动会员等级 `level` (`normal`=普站 / `gold`=金站, single-source `STAFF_LEVELS`; lists sort 金站-first). Display word 「员工」→「会员」 2026-07-10; identifier `Staff`/`staff_id` unchanged. | Soft-deleted via `voided_at`. |
| **管理员 Admin (`-1`)** | A virtual, protected member (`ADMIN_STAFF_ID = "-1"`) seeded by the v3 migration — the **restock owner**. Filtered out of `list`/`listActive`/`search` (even `includeVoided`); `void('-1')` throws; `getById('-1')` still returns it (record detail shows 「管理员」). | Never user-created, never deleted. |
| **商品 Product** | Anything that can be moved in/out of stock. Fields: `title`, `code`, `category`, `purchase_price`. | Soft-deleted via `voided_at`. |
| **进价 purchase_price** | A product's current purchase price, in `Cents` — the **line_amount basis**, not the global unit price. | Drives cost revaluation; stored on the product. |
| **补货 Restock** | `direction: "in"` — global stock-in, **owned only by admin `-1`** (`StockRecordRepository.create/update` enforce `direction=='in'` → `staff_id=='-1'`). | `create` not audited; `unit_price_snapshot` null. |
| **出库 Checkout** | `direction: "out"` — a member checking out of the **global** stock (any member). | `create` not audited; `unit_price_snapshot` frozen. |
| **自用 Self-use** | An optional mark on a **Checkout** (`self_use`). Still deducts global inventory and member balance, and counts in 出库金额; **excluded** from 单数·零售 aggregation. Default off; editable after posting. UI copy beside the control: 「不计单数与零售」. Restock (`in`) never carries it. | Flag on the stock record; not a separate direction. |
| **库存记录 Stock Record** | One restock/checkout event, carrying one or more **条目**. `in`=restock(-1), `out`=member checkout. | `create` not audited; `edit`/`void` are. |
| **条目 Stock Item** | A line within a stock record: product ref + qty + a frozen snapshot. | `line_amount = unit_price × qty`. |
| **快照 Snapshot** | At posting each item freezes `title` + `unit_price` from the product; the **record** also freezes the global `unit_price_snapshot` (out only). On edit, only *touched* item lines resnapshot; `unit_price_snapshot` is **not** re-frozen (snapshot铁律 — a later unit-price change affects only new checkouts). | invariant #3. |
| **全局库存 Global inventory** | The single shop stock = `Σ(restock in qty) − Σ(checkout out qty)` per product, across every staff (`Inventory.shopAggregate`). `in` only from `-1`, `out` from members → naturally global. | Derived, **never stored** (ADR-0002); 欠货 when negative. |
| **成本金额 total_cost** | `current purchase_price × global qty`, in `Cents`. | Revalued instantly on price change (never stored). |
| **充值 Top-up** | A member money-in event (`TopupRepository`): `amount` in Cents, no product/items. | `create` + `void` audited; soft-deleted. |
| **会员余额 Member balance** | `MemberBalance.balance(staff) = Σ(unvoided topup) − Σ(unvoided out line_amount)`, in `Cents`. | Derived, **never stored**; 欠款 when negative. |
| **欠货 / 欠款** | Negative global stock (欠货) / negative member balance (欠款). Both allowed — returned as-is, no clamp, no error, no checkout block. | invariant #5. |
| **全局单价 Unit price** | A shop-wide per-bundle price (`ConfigRepository`, key `unit_price`), independent of product `purchase_price`. Cold start = 0. | setUnitPrice audited. |
| **单数·零售 Bundles·Retail** | `splitBundleRetail(amountCents, unitPriceCents) → { bundles: floor(a/u), retail: a%u }` — pure single-source helper. Applied to a checkout's `Σ line_amount` against its own `unit_price_snapshot`. **自用** checkouts are excluded from aggregation (contribute 0 bundles / 0 retail). | invariant #4 (derived). |
| **综合流水 dailyFlow** | Per (day, staff) sum of restock(`in`/`-1`) + checkout(`out`) `line_amount` **and** top-up `amount`, newest day first. `-1` rows are restock events, not member rows. | Derived read model (ADR-0002 — never stored); excludes voided; **historical snapshot**, not current-price-revalued. |
| **作废 Void** | Soft-delete: set `voided_at`. The record/items/topup remain (never hard-removed); excluded from `list`/`staffHistory`/derivation. | No `delete` API anywhere (ADR-0001). |
| **审计 Audit** | Per-mutate field-level diff timeline. Actions: `create`/`update`/`void`/`restore`. | Stock-record `create` not audited; topup create/void + config set are. |
| **Cents** | Branded integer type for money (units = 分). The only way to mint one is `cents()`, which rejects non-integers. | See [src/data/primitives.ts](src/data/primitives.ts). |
| **StoragePort** | The single test seam — a dumb typed row store (`withTransaction`/`insert`/`findById`/`update`/`find`); every row carries `id`. | `InMemoryAdapter` (tests) / `ExpoSqliteAdapter` (prod). See ADR-0001, ADR-0003. **`withTransaction` is not reentrant.** |
| **组合根 Composition root** | `ExpoSqliteAdapter.open()` → `setupRepos()` → React Context. `setupRepos` wires products / staff / config / stockRecords / inventory / dailyFlow / topups / memberBalance. | UI's only entry to the data layer; ADR-0005. |

## Invariants

These hold across the whole data layer; code is shaped to make breaking them hard.

1. **No hard deletes.** Everything is voided (`voided_at`), never erased. `StoragePort` has no `remove`.
2. **Money is integer `Cents`.** Never a float. Quantities are plain integers.
3. **Snapshots are frozen at posting.** An item's `title`/`unit_price` and the record's `unit_price_snapshot` don't track later changes — except a *touched* item line on edit, which resnapshots to the then-current product price. `unit_price_snapshot` is **never** re-frozen on edit.
4. **Derived figures are never stored.** shopAggregate / memberBalance / dailyFlow / bundle-split / cost are recomputed from the ledger every read (ADR-0002).
5. **Negative stock AND negative balance are allowed.** No clamp, no error, no checkout block — 欠货 and 欠款 are real states.
6. **Every mutate is audited** (except stock-record `create`) inside a `withTransaction` — no change without an audit entry, no audit entry without a change. Topup create/void + config set are audited.
7. **Restock is global.** `direction: "in"` requires `staff_id == ADMIN_STAFF_ID ("-1")`; the admin row is never listed, never voided.

## UI 层架构

The data layer is consumed by a thin UI layer (the system PRD calls UI a "thin consumer"):

- **组合根 Composition root** — at app boot, `ExpoSqliteAdapter.open("shop_note.db")` → `setupRepos(adapter)` constructs the repo set, injected via React Context. `setupRepos` (formerly smoke-only) is lifted to a shared module so UI and smoke share one wiring. DB-not-ready holds the splash; open failure shows an error screen + retry.
- **数据流** — UI reads/writes through React Query hooks over a single `qk` registry (`useStaff` / `useProducts` / `useStockRecords` / `useShopAggregate` / `useMemberBalance` / `useTopups` / `useUnitPrice` / `useDailyFlow`); writes (`useCreateStockRecord` / `useCreateTopup` / `useVoidTopup` / `useUpdateUnitPrice` / …) invalidate by family root so derived reads refresh automatically. Derived reads stay pure-and-recomputed (ADR-0002) — performance is controlled by precise invalidation, not by caching results.
- **导航** — three tabs: 记账 (bookkeeping, home) → 汇总 (summary) → 管理 (manage). 记账 is member-centric (search a member → 充值/出库, see their 余额); 汇总 is the supervision view (库存卡 + 综合流水 + 单数零售聚合); 管理 has four segments (会员｜商品｜补货｜配置).
- **样式** — RN `StyleSheet` + extended `theme.ts` semantic tokens (success/danger/warning/border/inputBg/accent); no NativeWind / component library. Native inputs (TextField/Picker/SegmentedControl) use the already-installed `@expo/ui` where it helps.
- **库存/余额模型重构 stock-balance-refactor (2026-07-11)** — 核心语义变更：库存从「每会员持有」收敛为**全局唯一**（管理员 `-1` 补货 `in`，会员只 `out`，`shopAggregate` 派生）；会员改为**充值 + 出库**双动作（`TopupRepository` + `MemberBalance` 派生 = Σ充值 − Σ出库 line_amount，从不存储，欠款允许负）；新增**全局单价** config（独立于 `purchase_price`），出库 `create` 冻结 `unit_price_snapshot`，`splitBundleRetail` 单源纯函数拆「单数 + 零售」（出库记录详情 + 汇总聚合复用）。废弃 per-staff `balance`/`staffInventory`/`staffSummaries` + 其 hooks/query-keys；记账行改为 `[充值][出库] + 余额`；汇总改为综合流水（补货/出库/充值）+ 出库单数零售聚合；管理加「补货」「配置」段。**清库重来迁移**（v3 DROP+重建，偏离增量铁律，见 [ADR-0008](docs/adr/0008-clear-db-rebuild-migration.md)）；`-1` 四设施（种子 INSERT / repo 过滤 / void 守卫 / direction='in'↔'-1' 校验）。见 `.scratch/2026-07-10-stock-balance-refactor/`。
- **页面优化重构 (2026-07-10)** — 记账 / 员工详情 / 汇总三屏 UX 重构（管理页另算）：`direction: out` 的展示词现为「出库」(2026-07-10 page-refactor 曾改「出单」, 同日回滚；数据层 enum `out` 始终不变)；日期统一 `YYYY/MM/DD`（datetime 控件用 `YYYY/MM/DD HH:mm`）；长列表（员工详情历史 / 汇总流水）按天倒序 + **UI 级分批渲染**（[ADR-0007](docs/adr/0007-list-batched-rendering.md)）；汇总屏抛弃四段切换，改为时间段选择 + 库存卡 + 按天×员工流水。**口径区分**：库存卡金额 = as-of-now 现价快照（不受时间段影响），流水段金额 = 选定时间段内的历史快照 `line_amount`（与 [ADR-0002](docs/adr/0002-derived-inventory-never-stored.md) 一致）。
- **会员化改名 + 会员等级 (2026-07-10)** — 全局展示词「员工」→「会员」（代码标识符 `Staff`/`staff_id`/`staff` 表/路由不动，复刻「出库→出单」先例）；`Staff` 增手动 `level` 字段（`normal`=普站 / `gold`=金站，单源 `STAFF_LEVELS`），仓储列表金站优先排序，管理表单提供等级选择器（默认普站、可手动改），列表行/`staff-row`/会员详情展示等级徽标（金站 accent、普站省略）。`level` 走既有审计；schema 加列 + v2 迁移 `ALTER ... DEFAULT 'normal'` 回填老会员为普站（v1 staff DDL 冻结为历史字面量以规避动态 DDL 的 duplicate-column 陷阱，`ColDef.default` 使 `createTableSql` 与 ALTER 的 DEFAULT 对称）。

UI testing ([ADR-0006](docs/adr/0006-ui-component-testing-rntl.md)): derived pure logic (`dailyFlow` etc.) is Jest-covered against `InMemoryAdapter`; **screens / hooks / user-behavior flows are covered by React Native Testing Library component tests** using the real `InMemoryAdapter` (no Repos mocking), driven from user actions (search → post → observe). Real SQL execution stays with the [ADR-0004](docs/adr/0004-adapter-verification-device-smoke.md) device smoke; dark-mode / feel stay manual.

## Pointers

- **System PRD**: [.scratch/2026-07-08-shop-management-system/01-shop-management-system.md](.scratch/2026-07-08-shop-management-system/01-shop-management-system.md)
- **UI PRD**: [.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md](.scratch/2026-07-09-shop-management-ui/01-shop-management-ui.md)
- **页面重构 PRD**: [.scratch/2026-07-10-page-refactor/01-page-refactor.md](.scratch/2026-07-10-page-refactor/01-page-refactor.md)
- **库存/余额重构 PRD**: [.scratch/2026-07-10-stock-balance-refactor/01-stock-balance-refactor.md](.scratch/2026-07-10-stock-balance-refactor/01-stock-balance-refactor.md)（specs 01–05）
- **Specs**: [.scratch/2026-07-08-shop-management-system/specs/](.scratch/2026-07-08-shop-management-system/specs/)
- **ADRs**: [docs/adr/](docs/adr/) (incl. [ADR-0005 UI 层架构](docs/adr/0005-ui-layer-architecture.md), [ADR-0006 UI 组件测试](docs/adr/0006-ui-component-testing-rntl.md), [ADR-0007 列表分批渲染](docs/adr/0007-list-batched-rendering.md), [ADR-0008 清库重建迁移](docs/adr/0008-clear-db-rebuild-migration.md))
- **CodeMap**: [docs/codemap/project.md](docs/codemap/project.md)
