# StaffDetail 接入 FlowEventRow

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #02, #03

## Goal

会员详情历史区改用 `FlowEventRow` 渲染，充值行导航至详情页并移除行内作废。

## Acceptance criteria

- [ ] 日卡片展开后 checkout 行用 `FlowEventRow`（含计 N 单/零售），无商品名 — 证明出库行统一
- [ ] 日卡片展开后 topup 行用 `FlowEventRow`，视觉与 checkout 一致 — 证明充值行统一
- [ ] checkout `onPress` → `onOpenRecord(id)` — 证明出库详情导航不变
- [ ] topup `onPress` → `onOpenTopup(id)`；route adapter 推 `topup/[id]` — 证明充值详情可达
- [ ] 无 `voidingTopupId` / 行内作废控件 — 证明作废迁至详情页
- [ ] 按天分组、倒序 merge 逻辑不变 — 证明仅换行渲染
- [ ] `staff-detail.test.tsx` 更新：作废测试迁至详情或删除行内断言；新增 bundle/retail 与 `onOpenTopup` 断言

## Scope

- **In**: `StaffDetail` 行渲染、`StaffDetailProps` 增 `onOpenTopup`、`staff/[id].tsx` adapter、相关测试。
- **Out**: `SummaryTab`、数据层变更。

## Context

- 父级对每条 checkout 调 `splitBundleRetail(Σ line_amount, record.unit_price_snapshot)` 传入 `FlowEventRow`
- 现有 `onOpenRecord` 由 `staff/[id].tsx` 推 `record/[id]`
- 删除 inline void 后，作废 E2E 由 `topup-detail` spec 测试覆盖

## Design

- **Interface delta**
  - `StaffDetailProps` 增加 `onOpenTopup: (topupId: string) => void`
  - `staff/[id].tsx` 增加 `onOpenTopup={(id) => router.push({ pathname: '/bookkeeping/topup/[id]', params: { id } })}`
- **Internal architecture**
  - `renderDay` 内 `item.events.map`：record → `FlowEventRow kind=checkout`；topup → `kind=topup`
  - 移除 topup 分支的 `View` + void 按钮块及 `voidTopup`/`voidingTopupId` state
  - `subRow` 样式可复用或让 `FlowEventRow` 自带 margin（与现有 `marginLeft: 12` 对齐）
- **Deep-module note**: StaffDetail 保留 merge 编排；展示委托 `FlowEventRow`

## Rework on failure

恢复 StaffDetail 内联渲染；不影响 SummaryTab。
