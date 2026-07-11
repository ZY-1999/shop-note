# SummaryTab 合并充值明细 + FlowEventRow

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #02, #03

## Goal

汇总页会员展开明细合并 checkout + topup 事件，用 `FlowEventRow` 统一展示并导航至两种详情页。

## Acceptance criteria

- [ ] 展开会员某天明细时，checkout 与 topup 按 timestamp 倒序合并展示 — 证明与会员详情口径对齐
- [ ] checkout 行含计 N 单/零售，无商品名 — 证明出库摘要一致
- [ ] topup 行 tap → `onOpenTopup`；checkout tap → `onOpenRecord` — 证明双详情导航
- [ ] `summary/index.tsx` adapter 接线 `onOpenTopup` 推 `/bookkeeping/topup/[id]` — 证明跨 tab 可达
- [ ] 删除原 `recordLine` 内联布局 — 证明无重复 UI
- [ ] `summary-tab.test.tsx`：展开后同时见 checkout + topup 行；checkout 含 bundle/retail testID；topup 行 press 触发 `onOpenTopup`

## Scope

- **In**: `SummaryTab` drill-down merge + `FlowEventRow`；`SummaryTabProps` 增 `onOpenTopup`；`summary/index.tsx` adapter；测试更新。
- **Out**: `StaffDetail`（spec #04）、数据层（spec #01 已交付 date_range）。

## Context

- `useStockRecords({ date_range })` 已用于 checkout drill-down
- `useTopups({ date_range: range })` 消费 spec #01 扩展（可按 staff + 日客户端过滤，或 repo 已范围过滤后客户端按 staff+日筛）
- merge 模式复制 `StaffDetail`：同日同会员事件合并排序
- `onOpenRecord` 跨 tab push 模式已存在

## Design

- **Interface delta**
  - `SummaryTabProps` 增加 `onOpenTopup?: (topupId: string) => void`
  - `summary/index.tsx` 传入 `onOpenTopup` 推 bookkeeping topup route
- **Internal architecture**
  - 展开 staff 行时：从 `records.data` 筛 staff+日得 checkout 列表；从 `useTopups({ date_range: range })` 筛 staff+日得 topup 列表
  - 映射为统一 `{ id, kind, timestamp, amount, record? }` 事件数组，按 timestamp desc sort
  - checkout 事件算 bundle/retail 后渲染 `FlowEventRow`；topup 渲染 `FlowEventRow kind=topup`
  - 移除 `recordLine` style 与商品名 Text
- **Deep-module note**: SummaryTab 保留日/会员层级折叠；单笔展示委托 `FlowEventRow`

## Rework on failure

恢复 SummaryTab 仅 checkout 的 `recordLine`；不影响 StaffDetail。
