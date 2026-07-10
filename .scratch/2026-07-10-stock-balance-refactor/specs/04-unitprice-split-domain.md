# 单价·拆分域: 全局单价 config + splitBundleRetail + 出库快照 + 管理·配置段 + 出库记录详情

Type: spec
Status: ready-for-human
Parent: #01 (01-stock-balance-refactor.md)
Blocked by: #02

## Goal

新增全局「单价」配置（独立于商品 purchase_price）；出库记录 create 时从配置读取并冻结单价快照；`splitBundleRetail` 纯函数单源（出库记账/记录详情/汇总聚合三处复用）；管理 tab 新增配置段；出库记录详情显示快照单价 + 单数 + 零售。

## Acceptance criteria

- [ ] 管理·配置段输入单价 ¥24.00 → 保存 → `ConfigRepository.getUnitPrice()` 返回 `cents(2400)`；审计含 config update；冷启动 getUnitPrice() 返回 0 不崩。——US2
- [ ] `splitBundleRetail(7200,2400)`→`{bundles:3,retail:0}`；`(7000,2400)`→`{bundles:2,retail:2200}`；金额<单价→`{bundles:0,retail:amount}`；大额不溢出。——拆分纯函数
- [ ] 配置单价 ¥24 → 记出库 line_amount=¥72 → `stock_record.unit_price_snapshot===cents(24)`；补货(in) 记录该列===null；改单价后新出库冻结新值，旧记录不变。——快照铁律
- [ ] 出库记录详情显示「快照单价 ¥24.00 / 3 单 / ¥0 零售」（从该记录快照派生）；单价后来变了，该记录仍用自身快照。——US9
- [ ] 补货(in) 记录详情不显示单数/零售区域；管理 tab 四段切换正常。
- [ ] record-detail 改造后，出库记录作废入口仍可用（`useVoidStockRecord`）——回归断言：作废 → voided_at 置位；不破坏 spec 02 既有出库作废路径。

## Scope

- **In**:
  - 数据层：ConfigRepository（getUnitPrice/setUnitPrice+审计，通用 key-value，首项 unit_price）、splitBundleRetail 纯函数、StockRecordRepo.create 出库时读 config 冻结 unit_price_snapshot（构造加 config 依赖）、composition 接入 config。
  - 流层：query-keys 加 `qk.config`；reads 加 `useUnitPrice`；mutations 加 `useUpdateUnitPrice`。
  - UI：manage-tab 加「配置」段（四段）；record-detail 出库详情加快照单价 + 单数 + 零售展示（splitBundleRetail 派生）。
- **Out**: 综合流水里的单数零售聚合（spec 05，复用本 spec 的 splitBundleRetail）；StockRecordCreateInput 签名不变（调用方不传单价）。

## Context

- ADR-0002（派生不存储——单数/零售派生）、ADR-0006（splitBundleRetail 纯函数走 data project 单测，最高 seam）。
- CONTEXT invariant #4（派生不存储）、snapshot 铁律（invariant #3，create 冻结）。
- 现有 snapshot 范式：StockRecordRepo.create 冻结 title/unit_price（stock-record.ts）；本 spec 加冻结 unit_price_snapshot（全局单价）。
- config 表 schema 由 spec 01 落地；splitBundleRetail 是 PRD 指定的单源纯函数（三处复用：出库记账/记录详情/汇总聚合）；record-detail 由 spec 02 完成编译修复（移除 staffInventory 断言）。

## Design

- **Interface delta**
  - `ConfigRepository`：`getUnitPrice() → Cents` / `setUnitPrice(cents)` 审计（通用 key-value，首项 `unit_price`）；冷启动（config 空）返回 0 不崩。
  - `splitBundleRetail(amountCents, unitPriceCents) → { bundles: number, retail: number }`：`bundles=floor(amount/unitPrice)`，`retail=amount%unitPrice`；纯函数、无 adapter 依赖、单源。
  - `StockRecordRepository.create`：`direction='out'` 时从 `ConfigRepository.getUnitPrice()` 读并冻结到 `unit_price_snapshot`；`direction='in'` 时该列 null。构造加 `config` 依赖。`StockRecordCreateInput` 不变（调用方不传单价）。
  - `StockRecord` 接口加 `unit_price_snapshot: Cents | null`。
  - `composition`：接入 `config: ConfigRepository`。
  - `query-keys`：`qk.config`（all/unitPrice）；`reads`：`useUnitPrice()`；`mutations`：`useUpdateUnitPrice`（gate + 审计 + invalidate `qk.config`）。
  - UI：`manage-tab` 加「配置」段（四段，单价元→Cents）；`record-detail` 出库详情加「快照单价 + 单数 + 零售」（`splitBundleRetail(Σline_amount, unit_price_snapshot)`）；补货(in) 不显示该区域。

- **Internal architecture**
  - **splitBundleRetail 单源纯函数**：data project 最高 seam 单测；出库记账/记录详情/汇总聚合（spec 05）三处复用，避免 floor/mod 漂移。
  - **unit_price_snapshot 冻结**：create 时冻结（snapshot 铁律 invariant #3），edit 不重冻结——单价变动只影响新出库，旧记录不歧义。
  - **ConfigRepository 通用 key-value**：为未来配置项扩展留口，首项 `unit_price`；setUnitPrice 审计留痕。
  - `StockRecordRepo` 构造依赖加 `config`——composition 接线。

- **Deep-module note**：`ConfigRepository` 作通用 key-value 配置 repo——小接口（get/set 一项）隐藏"可扩展配置项"的复杂度，是 deep module。

## Rework on failure

单价/拆分独立——失败 redo 本 spec（config + splitBundleRetail + 出库快照 + 配置/详情 UI）；不波及库存/余额域。

## Comments

- 2026-07-11 — implemented via `/tdd`（数据层 → 流层 → UI，双绿 254 tests）。AC → 测试：
  - 配置段输入 ¥24 → 保存 → `getUnitPrice()`===cents(2400)；审计含 create/update；冷启动返回 0 — `src/data/config.test.ts`；`src/components/manage-tab.test.tsx::ManageTab — config segment`
  - `splitBundleRetail(7200,2400)`→{3,0}；`(7000,2400)`→{2,2200}；amount<unit→{0,amount}；unitPrice≤0→{0,amount}；大额不溢出 — `src/data/split-bundle.test.ts`
  - 出库 line_amount=¥72 → `unit_price_snapshot`===cents(2400)；补货(in)===null；改单价后新出库冻结新值，旧记录不变 — `src/data/stock-record.test.ts::StockRecordRepository — unit_price_snapshot`
  - 出库详情显示「快照单价 / N 单 / 零售」（splitBundleRetail 派生）；补货(in) 不显示 — `src/components/record-detail.test.tsx::RecordDetail — 出库 单数/零售 split`
  - 四段切换正常（会员/商品/补货/配置）— `manage-tab.test.tsx::four segments toggle`
  - record-detail 作废入口仍可用（既有用例，未回归）— `record-detail.test.tsx::RecordDetail — void`
  - `tsc --noEmit` 通过；`jest` 全绿 254 passed（32 suites）
- 数据层：`split-bundle.ts` 纯函数（unitPrice≤0 守卫，无 NaN）；`config.ts` ConfigRepository（getUnitPrice/setUnitPrice upsert+审计，冷启动 0）；`StockRecord` 加 `unit_price_snapshot: Cents|null`，`StockRecordRepo` 构造加 `config` 依赖，`create` 出库时冻结（edit 不重冻结——snapshot 铁律）；`composition` 接入 `config`。
- schema 调整：config 表 `key` PK → `id` PK（与 storage port 的 `HasId` 契约 + 全部其它表一致；id 即配置 key）。同步 `SCHEMA`/`COLUMNS`/spec-01 两处测试 + v3 createTableSql 自动反映。
- 流层：`qk.config`（all/unitPrice）；`useUnitPrice`；`useUpdateUnitPrice`（gate + 审计 + invalidate qk.config）。
- UI：`manage-tab` 加 配置段（ConfigManage：元→Cents + 当前价展示）；`record-detail` 出库详情加「快照单价 + 单数 + 零售」（splitBundleRetail 派生），补货(in)/unitPrice=0 不显示该区域。
- **[手动/发布门]** 真实 SQLite 下 config 表 + 出库快照的运行时行为仅设备 smoke 覆盖（ADR-0004，发布前手跑）。
- Codemap / CONTEXT.md 术语更新延后到 `/sdd-flow` Stage 4。

