# 出库表单 / 详情 / 流水行露出「自用」

Type: spec
Status: ready-for-agent
Parent: #01 (01-checkout-self-use.md)
Blocked by: #01

## Goal

操作员可在出库 UI 上标记 / 编辑「自用」，并在凡展示出库的地方看到该标记（以及隐藏的单数·零售）。

## Acceptance criteria

- [ ] 新建出库表单：「自用」开关默认关；旁注固定文案「不计单数与零售」可见；补货（`in`）表单永不出现该控件。— US1–3、US13
- [ ] 打开开关提交后落库 `self_use`；该笔仍计入出库 ¥；单数·零售聚合不含该笔。— US6–8
- [ ] 自用出库详情显示「自用」，且 **不** 渲染「计 N 单 / 零售」；非自用详情不变（快照适用时仍展示拆分）。— US9、US12
- [ ] 会员详情与汇总的出库 `FlowEventRow` 在标记为自用时显示「自用」；自用行由父组件传入 bundles/retail = 0；**不**改变「今日出库流水行不展示出库金额」约定。— US10
- [ ] 编辑可翻转开关；保存后详情 / 流水 / 汇总的单数·零售按新标记反映。— US11
- [ ] 非自用出库 UI 路径行为与今天一致（回归）。— US12

## Scope

- **In**：`RecordForm` 仅出库的开关 + 文案 + create/update 接线；`RecordDetail` 徽标 + 自用时隐藏拆分区；`FlowEventRow` 出库「自用」标识；父组件（`staff-detail`、`summary-tab`）传入 `self_use` / 零拆分；RNTL 测试用真实 `InMemoryAdapter`（不 mock repos）。
- **Out**：Schema / 仓储 / `aggregateBundleRetail` / 会员详情按天数学（spec #01）；新的汇总筛选；补货/充值/会员等级/导出/签名。

## Context

- 父 PRD：[.scratch/2026-08-03-checkout-self-use/01-checkout-self-use.md](../01-checkout-self-use.md)。依赖 spec #01 的 `self_use` 持久化与聚合排除。
- ADR-0006（RNTL + 真实 InMemoryAdapter）。术语文案「不计单数与零售」。
- 地形：[record-form.tsx](../../../../src/components/record-form.tsx)、[record-detail.tsx](../../../../src/components/record-detail.tsx)、[flow-event-row.tsx](../../../../src/components/flow-event-row.tsx)（今日出库行：时间 +「出库 N 单」+ 零售；`amountCents` 入参未用于渲染）、[staff-detail.tsx](../../../../src/components/staff-detail.tsx)、[summary-tab.tsx](../../../../src/components/summary-tab.tsx)；既有 RNTL：`record-form.test.tsx`、`record-detail.test.tsx`（单数/零售）、`flow-event-row.test.tsx`、`summary-tab.test.tsx`。

## Design

消费 #01 已交付的 `StockRecord.self_use` / `StockRecordCreateInput.self_use?` / `StockRecordUpdatePatch.self_use?`（及已排除自用的聚合）。本 spec 只做 UI 露出与接线；无新 mutation / query key。

- **Interface delta**
  - `RecordFormEdit` 增 `selfUse: boolean`（编辑回填）。`RecordForm` 公共 props 不变（仍 `staffId` / `direction` / `edit?` / `onSaved?`）。
  - 表单内部：仅 `direction === 'out'` 渲染「自用」开关（RN `Switch` + 标签「自用」）+ 旁注固定文案 **「不计单数与零售」**；`in` 永不渲染。新建默认 `false`；编辑从 `edit.selfUse` 回填。提交：`create` / `update` payload 带 `self_use`（域字段 snake；UI state 用 camel `selfUse`）。
  - `RecordDetail`：`record.self_use` 为真时在类型旁显示「自用」；仍渲染金额；**不**渲染「计 N 单 / 零售」。编辑态把 `selfUse: record.self_use` 传入 `RecordFormEdit`。
  - `FlowEventRow` checkout 分支增可选 `selfUse?: boolean`（默认假）；为真时展示「自用」标识。**不**改今日约定：checkout 行仍只渲染时间 +「出库 N 单」+ 零售（`amountCents` 继续 unused）。topup 分支不变。
  - 父组件接线（`staff-detail` / `summary-tab`）：事件视图带上 `self_use`；自用 checkout 传 `selfUse` + `bundles={0}` / `retailCents={0}`（行级展示；日头/总览排除已由 #01 做完，本 spec 不重做聚合）。
- **Deep-module note**：`FlowEventRow` 保持纯展示——是否自用、bundles/retail 是否为 0 由父传入，行组件不读 repo、不感知聚合规则。表单只拥有开关 state，持久化仍走既有 `useCreateStockRecord` / `useUpdateStockRecord`。无加深必要（浅接线消费 #01）。
- **Internal architecture** — 无新模块边界。落点：`RecordForm` 一个受控 boolean；`RecordDetail` 条件渲染；`FlowEventRow` 多一个可选 prop；两处父列表把 `rw.record.self_use` 织进既有 event → row。失效键沿用 #01 后的 mutations（`qk.records` 等），UI 不手动 refetch。
- **Test seam**（ADR-0006）：RNTL + 真实 `InMemoryAdapter`，不 mock repos。优先扩既有套件——`record-form.test.tsx`（出库开关默认关 + 文案 + 提交落库；入库无控件；编辑翻转）、`record-detail.test.tsx`（自用徽标 + 无单数/零售；非自用仍有拆分）、`flow-event-row.test.tsx`（`selfUse` 出「自用」；无金额回归）、`staff-detail` / `summary-tab` 测（行上「自用」+ 父传 0 拆分；出库 ¥ 仍含该笔）。

## Rework on failure

失败隔离到 UI。数据层 / 聚合（#01）不动；重做本 spec 即可（可按表单 → 详情 → 流水行 → 父接线分块回退）。

## Comments

- 2026-08-03 — 骨架自拆分胜出 candidate-1 落地（judge PASS）。
- 2026-08-03 — 设计填完。
- 2026-08-03 — 覆盖（A）+ 可行性（B）PASS；Status → `ready-for-human`（Gate A）。
- 2026-08-04 — 全文改为中文（标识符 / 类型名 / 路径保留英文）。
- 2026-08-04 — Gate A 通过；Status → `ready-for-agent`。
