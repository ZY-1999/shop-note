# 出库可选「自用」（不计单数·零售）

Type: prd
Status: ready-for-agent

## Problem Statement

门店出库里有一部分是会员/店铺**自用**消耗，不是按「整单 + 零售」口径要统计的销量。当前所有 `direction: out` 出库一律进入单数·零售拆分与汇总聚合，自用笔会把「出库计 N 单 / 零售」撑大，对账口径失真。操作员需要在出库时可选标记「自用」，使该笔仍扣库存与余额、仍计入出库金额，但不参与单数与零售统计。

## Solution

给出库（Checkout）增加可选布尔标记 **自用（self_use）**：

- 默认关；表单旁固定说明「不计单数与零售」。
- 自用出库：扣全局库存、扣会员余额、计入「出库 ¥」；**不计单、不计零售**。
- 编辑可改开关；详情与流水行露出「自用」标识；自用详情不展示单数/零售区块。
- 历史出库迁移回填为非自用（行为与今天一致）。

## User Stories

1. 作为操作员，我想在会员出库表单上打开「自用」开关，以便标记这笔不是计单销量。
2. 作为操作员，我想在「自用」旁看到说明「不计单数与零售」，以便确认口径再提交。
3. 作为操作员，我想新建出库时「自用」默认关闭，以便普通出库仍计单·计零售，避免误标。
4. 作为操作员，我想自用出库仍扣该会员余额，以便自用消耗照常进欠款/余额账。
5. 作为操作员，我想自用出库仍扣全局库存，以便库存账与实物一致。
6. 作为操作员，我想自用出库金额仍进入汇总「出库 ¥」与会员流水出库金额，以便金额对账完整。
7. 作为操作员，我想自用出库不增加「出库计 N 单」，以便单数统计不被自用污染。
8. 作为操作员，我想自用出库不增加「零售 ¥」，以便零售统计也不被自用污染。
9. 作为操作员，我想在出库详情看到「自用」标识，且不看到「计 N 单 / 零售」区块，以便核对时口径清晰。
10. 作为操作员，我想在会员详情与汇总的出库流水行看到「自用」标识，以便列表上就能分辨。
11. 作为操作员，我想编辑已保存的出库时改「自用」开关，以便记错可修正；改完后汇总单数·零售按新标记重算。
12. 作为操作员，我想非自用出库的行为与今天完全一致（计单·计零售、详情仍展示拆分），以便升级不改既有习惯。
13. 作为操作员，我想补货（入库）表单不出现「自用」选项，以便自用只属于出库语义。
14. 作为操作员，我想作废一笔自用出库后，余额/库存/出库金额与统计自动回滚，以便与普通出库作废一致。
15. 作为操作员，我想升级 App 后历史出库全部视为非自用，以便过去的单数·零售数字不变。

## Implementation Decisions

### 领域：自用是出库上的标记，不是新方向

- 术语见 `CONTEXT.md`：**自用 Self-use** — optional mark on Checkout；不新增 `direction` 值。
- 布尔字段名：`self_use`（域模型 / 列名一致）。
- 仅对 `direction: 'out'` 有意义；`direction: 'in'`（补货）创建与更新时强制 `self_use = false`（数据层守卫，不靠 UI 约定）。

### Schema：给 `stock_record` 加列（增量迁移，不清库）

- 列：`self_use INTEGER NOT NULL DEFAULT 0`（0/1；与项目 Cents/整数风格一致）。
- 迁移版本：**v5**（当前最新为 v4）。按项目铁律（`PROJECT_KNOWLEDGE`「给既有表加列必须冻结历史版本的 CREATE 字面量」）：
  - `COLUMNS` / `SCHEMA` 同步加列（drift-guard）。
  - **`stock_record` 的动态 `createTableSql("stock_record")` 出现在已发布的 v1 与 v3**（v3 DROP 后重建）。两处都必须冻成**加列前**的历史字面量；只冻 v1 时，全新库会在 v3 建表已含 `self_use`，跑到 v5 `ALTER ADD` 撞 `duplicate column`。
  - v5：`ALTER TABLE stock_record ADD COLUMN self_use INTEGER NOT NULL DEFAULT 0`（新老库收敛；历史行回填 0 = 非自用）。
- 真实 `ALTER` 执行靠设备 smoke（ADR-0004）；Jest 覆盖迁移语句形状、v1/v3 冻结字面量 ≠ 当前 `createTableSql("stock_record")`、DEFAULT 对称。

### 仓储：create / update 读写 `self_use`

- `StockRecordCreateInput` / `StockRecordUpdatePatch` 增加可选 `self_use?: boolean`。
- `create`：`out` 默认 `false`；`in` 忽略入参、写 `false`。仍冻结 `unit_price_snapshot`（自用也冻——编辑若关掉自用，拆分仍有快照可依；快照铁律不变）。
- `update`：允许改 `self_use`（`out`）；若方向变成/保持 `in` 则写 `false`。`unit_price_snapshot` **不**因改自用而重冻（invariant #3）。
- `create` 仍不审计；`update` 走既有审计，字段 diff 含 `self_use`。
- 余额 / 库存 / dailyFlow / 出库金额聚合：**不**按 `self_use` 过滤（自用照常计入）。

### 单数·零售聚合：自用贡献 0

- 扩展 `aggregateBundleRetail` 的记录视图，识别 `self_use`；`direction === 'out' && self_use` 的记录 **跳过**（不累加 bundles/retail）。汇总 tab 的 range / 按天 / 按会员聚合走此缝，改一处即受益。
- **会员详情有两路**：总览走 `aggregateBundleRetail`；**按天分隔的 `dayBundles`/`dayRetail` 目前手工 `splitBundleRetail` 累加**（不经过聚合缝）。实现时必须同步改该手工路径（自用跳过或计 0），否则按天头仍会把自用算进单数·零售。
- 逐笔流水行：自用行不展示拆分（或传 bundles/retail = 0）；`splitBundleRetail` 纯函数本身保持不感知自用。
- 自用详情 UI 不渲染「计 N 单 / 零售」区块。

### UI

- **出库表单（`RecordForm`，`direction === 'out'`）**：开关「自用」，默认关；旁注固定文案「不计单数与零售」。入库表单不渲染。编辑模式回填已有值并可改。
- **出库详情**：类型旁显示「自用」（仅当标记为真）；自用时不渲染「计 N 单 / 零售」区域。
- **流水行（`FlowEventRow` checkout）**：自用时展示「自用」+ **出库金额**，不展示「出库 N 单 / 零售」；非自用仍只渲染时间 +「出库 N 单」+ 零售（不展示金额）。详情页另算。

### 不变式与 ADR

- 不新增 ADR（加列路径沿用既有迁移铁律与 ADR-0002/0003；无难逆/惊人 trade-off）。
- 派生数字仍不落库（invariant #4）；负库存/负余额仍允许（invariant #5）。

## Testing Decisions

- **测外部行为，不测实现细节**（ADR-0006）：通过 repo / 纯函数 / RNTL 用户动作观察结果。
- **优先既有缝**：
  1. **数据层 Jest + `InMemoryAdapter`**：`StockRecordRepository.create/update` 的 `self_use` 默认、in 强制 false、out 可写可改；迁移语句形状（v5 ALTER + COLUMNS/SCHEMA 对齐）。
  2. **纯函数缝 `aggregateBundleRetail`**：混入自用 out 时 bundles/retail 不含该笔；非自用不变；in 仍忽略。
  3. **RNTL（真实 `InMemoryAdapter`，不 mock repos）**：出库表单开关+说明文案+提交落库；编辑改开关后汇总/详情反映；自用详情无单数零售区、有「自用」；流水行有「自用」；出库金额仍进汇总「出库 ¥」。
- Prior art：`split-bundle` 测试、`record-form.test.tsx`、`record-detail.test.tsx`（单数/零售 split）、`summary-tab.test.tsx` / `staff-detail` 的 bundle 聚合、`member-rename-level` 的加列迁移测试。

## Out of Scope

- 不为自用单独建表、新 direction、或独立「自用流水」视图。
- 不改变余额公式、库存公式、全局单价、快照铁律。
- 不把自用金额排除出「出库 ¥」或综合流水金额。
- 不清库重建；不做 Web。
- 不改补货/充值/会员等级/导出/签名等无关功能。
- 不新增过滤「仅看自用 / 隐藏自用」的汇总筛选项（本 PRD 只做标记与统计排除）。

## Further Notes

- Grill 已收敛（2026-08-03）：扣余额 ✓；进出库 ¥ ✓；不计单且不计零售 ✓；说明文案「不计单数与零售」✓；编辑可改 ✓；详情+流水标自用、自用详情隐藏拆分 ✓；默认关 ✓；历史回填非自用 ✓。
- 展示词「自用」；标识符 `self_use`（复刻「会员/Staff」中英分离先例）。

## Comments

- 2026-08-03 — grill 完成；对抗评审 PASS（修正：会员详情双路径、FlowEventRow 无金额、v1+v3 双冻）；Status `ready-for-human`，待 Gate 0。
- 2026-08-03 — Gate 0 通过；`/sdd-flow` 入口翻为 `ready-for-agent`。
- 2026-08-04 — 设备 smoke 25/25 PASS（含 v5 `self_use` 真实 SQLite 路径）；发布手动门关闭。
- 2026-08-04 — 跟进：出库表单选中自用时，合计行也隐藏计单/零售（仍显示金额）。
- 2026-08-04 — 跟进：流水行（非详情）自用改为显示出库金额，隐藏「出库 N 单 / 零售」。
