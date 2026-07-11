# 会员流水行统一组件 + 充值详情页

Type: prd
Status: ready-for-agent

## Problem Statement

会员详情（`StaffDetail`）与汇总页会员展开明细（`SummaryTab` drill-down）各自内联渲染出库/充值行，展示口径不一致：

- 时间只到 `HH:mm`，无秒；
- 出库行展示商品名 × 数量，缺少「计 N 单 / 零售」摘要；
- 汇总展开明细**只有出库记录，没有充值行**；
- 充值行在会员详情内联「作废」，无详情页；出库虽有 `RecordDetail`，但列表行未统一呈现单数/零售与进入详情的视觉提示。

操作员在回看流水时需要在两处看到同一套摘要信息，并通过详情页完成纠错（作废充值、编辑/作废出库），列表行应保持轻量、一致。

## Solution

封装一个可复用的 **流水事件行组件**（`FlowEventRow`），在会员详情历史与汇总页会员展开明细两处复用。每行展示：

- **共用**：本地时间 `HH:mm:ss`、类型标签（出库 / 充值）、金额；整行可点进详情，右侧 `chevron-forward`。
- **出库额外**：`计 N 单`、`零售 ￥xx`（对该记录的 `Σ line_amount` 用其自身冻结的 `unit_price_snapshot` 经 `splitBundleRetail` 拆分；单价 ≤ 0 时 0 单、全额零售——与现有域规则一致）。**不**在列表行展示商品名。
- **充值**：仅共用字段；作废从列表行移除，改在新建 **充值详情页** 完成。

出库详情继续用现有 `RecordDetail`（时间展示改为含秒）；新增 `TopupDetail` + 记账 stack 路由 `topup/[id]`。

## User Stories

1. As a 操作员, I want 会员详情与汇总展开明细中的出库/充值行外观一致, so that 我在不同入口回看流水时不用重新适应布局。
2. As a 操作员, I want 每条流水行显示到秒的时间, so that 同一天多笔交易能区分先后。
3. As a 操作员, I want 出库列表行直接看到计多少单和零售金额, so that 我不必点进详情就能快速扫一眼 bundle 拆分摘要。
4. As a 操作员, I want 点击任意流水行（含 chevron 提示）进入对应详情页, so that 查看完整信息与纠错有统一入口。
5. As a 操作员, I want 汇总页展开某会员某天明细时也能看到充值记录, so that 监督视图与会员详情历史口径对齐。
6. As a 操作员, I want 充值详情页展示会员名、金额、含秒时间、备注（无则「—」）、作废状态, so that 我能核对一笔充值的完整上下文。
7. As a 操作员, I want 在充值详情页两步确认作废误录充值, so that 余额随之重算且列表行不再内联干扰操作。
8. As a 操作员, I want 出库详情页时间也含秒, so that 详情与列表行时间精度一致。
9. As a 操作员, I want 作废后的充值详情仍可查看并标「已作废」, so that 历史可追溯（与出库详情行为一致）。

## Implementation Decisions

### 1. 新组件 `FlowEventRow`

- **位置**：`src/components/flow-event-row.tsx`，与现有 `FlowSummary`（区间聚合头）并列——`FlowSummary` 管合计，`FlowEventRow` 管单笔。
- **Props（discriminated union）**：
  - `kind: 'checkout' | 'topup'`
  - `timestamp: number`（epoch ms）
  - `amountCents: number`
  - `onPress: () => void`
  - `testID?: string`（前缀模式，与 `FlowSummary` 的 testID 前缀约定一致）
  - checkout 专有：`bundles: number`、`retailCents: number`
- **布局**：单行 `flexDirection: 'row'`，左→右：时间（`textSecondary`）→ 类型标签（出库 `danger` / 充值 `success`）→ `MoneyText` 金额 →（checkout）`计 {bundles} 单` + `零售` + `MoneyText` → 右侧 `Ionicons chevron-forward`。
- **交互**：根节点 `Pressable`，`onPress` 由父级传入（路由无关，ADR-0006）。

### 2. 时间格式化

- 在 `date-format.ts` 新增 `formatTimeSeconds`（`HH:mm:ss`）与 `formatDateTimeSeconds`（`YYYY/MM/DD HH:mm:ss`）；**不**改动现有 `formatTime`（表单/日期控件仍只需到分钟）。
- `FlowEventRow`、新建 `TopupDetail`、现有 `RecordDetail` 头部时间改用含秒格式；`RecordDetail` 替换当前 `toLocaleString()` 漂移。

### 3. 会员详情接入（`StaffDetail`）

- 日卡片展开后，checkout / topup 子行均换为 `FlowEventRow`。
- checkout：`bundles`/`retail` 由父级对该 `RecordWithItems` 调用 `splitBundleRetail(Σ line_amount, record.unit_price_snapshot)` 算出后传入；`onPress` → 现有 `onOpenRecord(id)`。
- topup：`onPress` → 新回调 `onOpenTopup(id)`（由 route adapter 推 `topup/[id]`）；**删除**行内作废 UI 与 `voidingTopupId` 状态。
- 合并 timeline 逻辑不变（按天分组、倒序）；仅替换行渲染与导航回调。

### 4. 汇总页接入（`SummaryTab`）

- 会员卡片展开后，合并该会员当天的 checkout **与** topup 事件（与 `StaffDetail` 相同 merge 模式：按 `timestamp` 倒序），均用 `FlowEventRow` 渲染。
- 数据源：checkout 继续 `useStockRecords({ date_range })` 客户端按 staff + 日过滤；topup 需 **`TopupRepository.list` 扩展可选 `date_range` 过滤**（内存过滤，与 `StockRecordRepository.list` / `dailyFlow` 同 idiom），并新增 `useTopups(filter?: { staff_id?: string; date_range?: ... })` hook（`qk.topups.list` 已支持 filter 对象，扩展 filter 形状即可）。
- 新 prop `onOpenTopup?: (topupId: string) => void`；`summary/index` route adapter 推 `/bookkeeping/topup/[id]`。
- 删除 `recordLine` 内联布局与商品名展示。

### 5. 充值详情页（新建）

- **组件** `TopupDetail`（`src/components/topup-detail.tsx`）：`topupId` prop，router-agnostic。
- **读模型**：新增 `useTopupById(topupId)`（`qk.topups.byId` 已登记，repo `getById` 已存在且**含已作废**记录——与 `RecordDetail` 一致）。
- **展示**：header 卡片——「充值」标签、会员名（`useStaffById`）、`formatDateTimeSeconds(timestamp)`、金额、`note` 空则「—」、作废则「已作废」。
- **操作**：未作废时显示作废两步确认，调用现有 `useVoidTopup`；无编辑（域规则：充值只能作废重录）。
- **路由**：`src/app/bookkeeping/topup/[id].tsx` 薄 adapter；`_layout.tsx` 注册 `Stack.Screen name="topup/[id]" options={{ title: '充值详情' }}`。

### 6. 出库详情微调

- `RecordDetail` 仅改时间展示为 `formatDateTimeSeconds`；其余（商品行、bundle 拆分区、编辑/作废）不动。

### 7. 数据层

- **无 schema 变更**。仅 `TopupRepository.list` 增加可选 `date_range?: { from?: number; to?: number }` 内存过滤（对标 `stock-record` list）。
- bundle 拆分继续纯函数 `splitBundleRetail`，不在组件内重实现 floor/mod。

### 8. 导航与跨 tab

- 汇总 tab 推充值/出库详情仍走记账 stack 路由（与现有 `onOpenRecord` 跨 tab push 模式相同）。

## Testing Decisions

- **行为测试优先**（ADR-0006）：用真实 `InMemoryAdapter` + RNTL，不测样式实现细节。
- **`date-format`（data project）**：`formatTimeSeconds` / `formatDateTimeSeconds` 单元测试（ts-jest，与现有 `formatTime` 测试同文件/项目）。
- **`FlowEventRow`**：组件测试——checkout 行展示时间/出库/金额/计 N 单/零售/chevron；topup 行展示充值字段且无 bundle 文案；`onPress` 触发。
- **`TopupDetail`**：加载后展示字段；作废流程（确认 → 余额变化 / 标已作废）；已作废记录仍可打开。
- **`StaffDetail`**：更新现有测试——移除 topup 行内作废断言；新增 topup 行 `onOpenTopup` 导航；checkout 行含 bundle/retail testID。
- **`SummaryTab`**：展开会员后同时出现 checkout + topup 行；topup 行可导航；出库行含单数/零售。
- **`TopupRepository.list` date_range**：data project 测试一条范围过滤（对标 stock-record 已有测试）。
- **UI 测试命令**：`npx jest <pattern> --colors=false --forceExit`（PROJECT_KNOWLEDGE 惯例）。
- **不测**：审计时间线、真机 SQL smoke（仍靠 ADR-0004 设备 smoke，本 PRD 无迁移）。

## Out of Scope

- 审计时间线在详情页展示。
- 充值编辑（域上不存在 update API）。
- 改动 `FlowSummary` 区间头布局（已是正确聚合，本 PRD 只统一**单笔行**）。
- 补货（`direction: in` / admin `-1`）进入会员流水行——仍只在库存卡/管理段出现。
- 全局替换所有 `formatTime` 调用为含秒。
- 列表行恢复商品名或内联作废。

## Further Notes

- 与 [CONTEXT.md](../../CONTEXT.md) 术语对齐：出库 = checkout `out`，充值 = top-up，`splitBundleRetail` / `unit_price_snapshot` 铁律不变。
- `FlowSummary`（两行合计）与 `FlowEventRow`（单笔）命名邻近但职责不同；实现时注意 testID 前缀不冲突。
- 会员详情 route adapter（`staff/[id].tsx`）需补 `onOpenTopup` 接线，与 summary route 对称。

## Comments
