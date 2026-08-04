# 持久化 `self_use` 并从单数·零售排除

Type: spec
Status: ready-for-human
Parent: #01 (01-checkout-self-use.md)
Blocked by: None — 可立即开始

## Goal

出库记录可携带 `self_use`；存储与聚合使其仍计入余额 / 库存 / 出库¥，但不计入单数与零售。

## Acceptance criteria

- [x] 迁移 v5 增加 `self_use INTEGER NOT NULL DEFAULT 0`；历史行读为非自用；v1 与 v3 的 `stock_record` CREATE 字面量冻结为加列前版本（全新库跑到 v5 ALTER 不会 `duplicate column`）。— schema / PROJECT_KNOWLEDGE 加列铁律
- [x] `COLUMNS.stock_record` / `SCHEMA.stock_record` 均含 `self_use`；drift-guard 保持绿；`createTableSql('stock_record')` 发出 `self_use … DEFAULT 0`，与 ALTER 对称。— 双源 + ColDef.default
- [x] `create` 出库未传标记 → `self_use === false`；显式 `true` 可落库；`create` / `update` 且 `direction: 'in'` 时恒写 `false`（忽略入参）。— 默认值 + 入库守卫
- [x] `update` 出库可改 `self_use`；仅改标记时 **不** 重冻 `unit_price_snapshot`；update 审计字段 diff 含 `self_use`。— 编辑 + 审计 + 快照铁律
- [x] 自用出库仍计入库存（`shopAggregate`）、会员余额、出库金额 / dailyFlow；非自用出库行为不变。— 金额不过滤
- [x] 混合账本：`aggregateBundleRetail` 对 `out && self_use` 跳过单数/零售；非自用仍拆分；`in` 仍忽略。— 聚合缝
- [x] 会员详情按天路径（`dayBundles` / `dayRetail` 手工 `splitBundleRetail` 累加）与 `aggregateBundleRetail` 同一口径跳过自用（相对总览无漂移）。— 双路径对齐（PRD）
- [x] 作废一笔自用出库后，余额 / 库存 / 出库金额回滚与普通出库一致，且从派生单数·零售中排除（与任意作废相同）。— US14
- [x] **[手动 / 发布门]** 真实 SQLite 下 v5 ALTER（老库升级 + 全新库路径）设备 smoke 通过 — ADR-0004；非 Jest。

## Scope

- **In**：`stock_record.self_use` schema + v5 迁移（冻结 v1 **与** v3 的 `stock_record` CREATE 字面量）；`StockRecord` / create / update 入参面；`StockRecordRepository` create/update 读写 + 入库守卫；`aggregateBundleRetail` 跳过；会员详情按天头手工拆分跳过；数据层 Jest + 迁移测试；InMemory/Expo 行映射使 boolean / `0|1` 往返对称。
- **Out**：任何 UI 控件、徽标或文案（spec #02）；改余额 / 库存 / dailyFlow 公式；清库重建；Web；汇总页「仅看自用 / 隐藏自用」筛选。

## Context

- 父 PRD：[.scratch/2026-08-03-checkout-self-use/01-checkout-self-use.md](../01-checkout-self-use.md)。术语：**自用 Self-use**、**出库 Checkout**、**单数·零售 Bundles·Retail**，见 [CONTEXT.md](../../../../CONTEXT.md)。
- ADR：[ADR-0002](../../../../docs/adr/0002-derived-inventory-never-stored.md)（派生不落库）、[ADR-0003](../../../../docs/adr/0003-expo-sqlite-adapter-shape.md)（DDL 单源）、[ADR-0004](../../../../docs/adr/0004-adapter-verification-device-smoke.md)（真实 SQL → 设备 smoke）。
- 地形：[stock-record.ts](../../../../src/data/stock-record.ts)、[split-bundle.ts](../../../../src/data/split-bundle.ts)（`aggregateBundleRetail`）、[expo-sqlite-migration.ts](../../../../src/data/expo-sqlite-migration.ts)（v1 + v3 使用 `createTableSql("stock_record")`；当前最新 v4）、[sql-logic.ts](../../../../src/data/sql-logic.ts)、[staff-detail.tsx](../../../../src/components/staff-detail.tsx)（总览走 `aggregateBundleRetail`；按天头手工累加 `splitBundleRetail`）、[PROJECT_KNOWLEDGE.md](../../../../PROJECT_KNOWLEDGE.md)「给既有表加列必须冻结历史版本的 CREATE 字面量」。
- 先例：会员等级 v2 给 staff 加列（冻结历史 CREATE + ALTER DEFAULT）；`split-bundle.test.ts`；stock-record 的 `unit_price_snapshot` 测试。

## Design

- **Interface delta** — 本 spec 后的公共面（域 / 仓储 / 聚合 / schema；不含 UI）：
  - `StockRecord` 增 `self_use: boolean`（列序建议：`… unit_price_snapshot, self_use, voided_at …`，与 create 组装一致即可）。
  - `StockRecordCreateInput.self_use?: boolean`；`StockRecordUpdatePatch.self_use?: boolean`。
  - `create`：`direction === 'out'` 时 `self_use = input.self_use ?? false`；`direction === 'in'` **忽略入参**、恒写 `false`。`unit_price_snapshot` 铁律不变（自用 out 仍冻结）。
  - `update`：有效方向为 `out` 时可改 `self_use`；有效方向为 `in` 时强制 `false`。仅改 `self_use` **不**重冻 `unit_price_snapshot`。`auditableRecord` 纳入 `self_use`（update 审计 diff 可见）。
  - `void` 无新契约：作废后仍靠既有 `list` 排除 `voided_at`，余额 / 库存 / 出库金额 / 单数·零售均自然回滚；自用 out 与普通 out 同路径。
  - `BundleRetailRecord.record` 增可选 `self_use?: boolean`（缺省视作非自用，兼容既有调用方）。`aggregateBundleRetail`：在现有 `direction !== 'out'` continue 之后，对 `self_use === true` **跳过**（不累加 bundles/retail）。`splitBundleRetail` **不**感知自用。
  - schema：`SCHEMA.stock_record.columns` 与 `COLUMNS.stock_record` 同步加 `self_use`；沿用 `ColDef.default` 先例（staff.`level`）——`self_use` 用 `{ type: 'INTEGER', default: '0' }`，使 `createTableSql('stock_record')` 发出 `self_use INTEGER NOT NULL DEFAULT 0`，与 v5 ALTER 对称。
  - 迁移：`MIGRATIONS` 增 **v5**，单条 `ALTER TABLE stock_record ADD COLUMN self_use INTEGER NOT NULL DEFAULT 0`（历史行回填 0 = 非自用）。**冻结 v1 与 v3** 两处 `stock_record` 的 `CREATE` 为加列前历史字面量（命名常量，如 `V1_STOCK_RECORD_DDL` / `V3_STOCK_RECORD_DDL`，形状相同、均为加列前）；其余表语句不变。只冻 v1 不够：全新库跑到 v3 的动态 `createTableSql('stock_record')` 已含列，v5 ALTER 会 `duplicate column`。
- **Deep-module note** — 深度落在两处既有缝，不新开模块：`StockRecordRepository` 吞掉入库守卫 / 默认值 / 布尔往返；`aggregateBundleRetail` 多一个跳过谓词即覆盖汇总区间 / 按天 / 按会员与会员详情总览。删除该跳过 → 复杂度散回每个调用方（含会员详情手工路径）——用删除测试验证。`splitBundleRetail` 保持纯拆分、不加深。
- **Internal architecture** — 结构决策（实现细节留给 `/tdd`）：
  1. **双冻 v1+v3**：`stock_record` 的动态 CREATE 出现在已发布的 v1 **与** v3（v3 DROP 后重建）。`COLUMNS` 一旦加 `self_use`，两处都必须冻成加列前字面量；v5 ALTER 给新老库收敛。有别于会员等级只冻 v1 staff（level 由 v2 ALTER 补上，之后无再对该表 ALTER）——本列的 ALTER 在 v3 之后，故 v3 也必须冻。
  2. **boolean ↔ INTEGER**：域与入参为 `boolean`；SQLite 列为 `INTEGER 0|1`。adapter 保持 dumb（不扩 SCHEMA 做类型映射，守 ADR-0003）。在仓储组装 / 持久化边界规范化（读：`0|1` 与 `boolean` 都收敛为 `boolean`；写：持久化为 `0|1` 或等价），使 `InMemoryAdapter`（裸对象）与 Expo 回读对称。
  3. **聚合双路径**：金额类（`shopAggregate` / 会员余额 / dailyFlow 出库额）**不**读 `self_use`——零改动，靠回归断言自用仍计入。单数·零售：主缝 `aggregateBundleRetail` 跳过；会员详情按天头目前手工 `splitBundleRetail` 累加，必须用**同一谓词**（`out && self_use` → 不累加），避免总览与按天漂移。不把自用塞进 `splitBundleRetail`。
- **Test seam** — 优先既有缝，理想不新开：
  1. `StockRecordRepository` + `InMemoryAdapter`（`stock-record` 单测）：create 默认 / 显式 out、in 强制 false、update 可改、快照不因自用重冻、audit diff 含 `self_use`；自用 out 仍进库存/余额/出库金额（既有 inventory / member-balance / dailyFlow 断言或同缝加一条）。
  2. 纯函数 `aggregateBundleRetail`（`split-bundle` 单测）：混合账本省略自用 out；非自用不变；`in` 仍忽略。
  3. 迁移语句（`expo-sqlite-migration` 单测）：v5 ALTER 形状；v1/v3 冻结字面量 `!== createTableSql('stock_record')`；`COLUMNS`↔`SCHEMA` drift-guard；`createTableSql` 含 `self_use … DEFAULT 0`。
  4. 会员详情按天路径：与聚合同一谓词的机械对齐；不新抽模块。若需自动化，复用既有 `staff-detail` 测试缝做一行断言即可——主证明仍在 `aggregateBundleRetail`。真实 ALTER 仅设备 smoke（ADR-0004）。

## Rework on failure

失败隔离在本数据层 spec。若双冻 + v5 ALTER 在设备 smoke 不成立（duplicate column / DEFAULT 回填异常），只改迁移字面量或 v5 语句形式并重跑本 spec；UI（#02）在本 spec 绿之前不开始。余额/库存/dailyFlow 公式与 `splitBundleRetail` 本体不在回滚范围。

## Comments

- 2026-08-03 — 骨架自拆分胜出 candidate-1 落地（judge PASS）。
- 2026-08-03 — 设计填完。
- 2026-08-03 — 覆盖（A）+ 可行性（B）PASS；Status → `ready-for-human`（Gate A）。
- 2026-08-04 — 全文改为中文（标识符 / 类型名 / 路径保留英文）。
- 2026-08-04 — Gate A 通过；Status → `ready-for-agent`。
- 2026-08-04 — implemented via `/tdd`；Status → `ready-for-human`
  - [x] v5 ALTER + 双冻 v1/v3 — `expo-sqlite-migration.test.ts::MIGRATIONS v5: ALTER adds self_use; v1+v3 stock_record CREATE frozen…`
  - [x] COLUMNS/SCHEMA + createTableSql DEFAULT 0 — 同上 + `::COLUMNS names match SCHEMA…` + `sql-logic.test.ts` SCHEMA.stock_record columns
  - [x] create 默认/显式/in 守卫 — `stock-record.test.ts::create out defaults self_use to false; explicit true persists; in ignores…`
  - [x] update + 快照铁律 + 审计 — `::update out can flip self_use without re-freezing…`
  - [x] 金额不过滤 — `::self_use out still counts toward inventory, member balance, and dailyFlow…`
  - [x] aggregateBundleRetail 跳过 — `split-bundle.test.ts::mixed ledger: skips out&&self_use…`
  - [x] 按天双路径对齐 — `staff-detail.test.tsx::day header skips self_use out for bundles/retail…`
  - [x] void 回滚 — `stock-record.test.ts::voiding a self_use out rolls back…`
  - [x] **[手动/发布门]** 真实 SQLite v5 ALTER 设备 smoke — 2026-08-04 用户确认：25 个 smoke 运行正常（ADR-0004）
  - Test run: `npx jest src/data/stock-record.test.ts src/data/split-bundle.test.ts src/data/expo-sqlite-migration.test.ts src/data/sql-logic.test.ts src/components/staff-detail.test.tsx --forceExit` → 78 passed, 0 failed
  - Commit: `0dbada1`
- 2026-08-04 — 设备 smoke 发布门关闭：25/25 PASS。
