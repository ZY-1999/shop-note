# TopupDetail 充值详情页

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #01

## Goal

提供 router-agnostic 的充值详情页，展示完整充值上下文并支持两步作废；注册记账 stack 路由。

## Acceptance criteria

- [ ] 加载后展示：充值标签、会员名、含秒时间、金额、备注（空则「—」）— 证明字段完整
- [ ] 未作废充值：作废两步确认 → 成功后标「已作废」、作废按钮隐藏，会员余额相应减少 — 证明纠错流程与余额重算
- [ ] 已作废充值仍可打开并只读展示「已作废」— 证明历史可追溯（对齐 RecordDetail）
- [ ] 无编辑按钮 — 证明遵守域规则（充值只能作废重录）
- [ ] 路由 `bookkeeping/topup/[id]` 薄 adapter + stack 标题「充值详情」— 证明可导航进入

## Scope

- **In**: `TopupDetail` 组件及测试；`topup/[id].tsx` route；`_layout.tsx` 注册。
- **Out**: 列表行接入、StaffDetail/SummaryTab 改造、行内作废删除（spec #04/#05）。

## Context

- 依赖 spec #01 的 `useTopupById`、`formatDateTimeSeconds`
- `useVoidTopup` 已存在；作废后 `qk.topups.all` 失效
- `RecordDetail` 作废/已作废模式为 prior art
- ADR-0006: 组件 RNTL 测试，route 仅薄 adapter

## Design

- **Interface delta**
  - `TopupDetail({ topupId: string })` — router-agnostic
  - Route: `export default function TopupDetailRoute()` 读 `id` param → `<TopupDetail topupId={id} />`
  - Stack.Screen `name="topup/[id]" options={{ title: '充值详情' }}`
- **Internal architecture**
  - `useTopupById` + `useStaffById(topup.staff_id)` 并行读
  - Header 卡片布局对标 `RecordDetail` header（方向标签、会员名、时间、金额、note、作废标记）
  - `confirmingVoid` 本地 state；确认调 `useVoidTopup.mutate(topupId)`
  - `ScrollView` + `BottomTabInset` 底部留白
- **Deep-module note**: 详情页集中充值纠错；列表不再承载作废

## Rework on failure

删除 TopupDetail + route；spec #04/#05 的 `onOpenTopup` 暂不可用。
