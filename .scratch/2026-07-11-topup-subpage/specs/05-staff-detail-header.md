# 会员详情 header 对齐

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #01

## Goal

StaffDetail header 顶部 nameRow + 独立「余额」卡片两块替换为 MemberInfoHeader；其下的「共 N 条 / 充值 / 出库」汇总卡片保留不变。

## Acceptance criteria

- [ ] header 区域渲染 MemberInfoHeader（名 + 等级 + 余额两行），不再渲染独立 balance-section 卡片 —— 证明 header 对齐
- [ ] 既有余额断言（balance-total testID 的 moneyText 值）对应到组件第二行（testID 视组件实现调整或改用余额文本同步）—— 证明余额验收延续
- [ ] 金站等级徽标断言保留（组件第一行仍渲染名 + LevelBadge）—— 证明等级验收延续
- [ ] 汇总卡片（record-summary / record-topup-total / record-out-total）断言保留不变 —— 证明汇总不受影响
- [ ] 日分组历史、作废流程、分批渲染回归通过 —— 证明无回归

## Scope

- **In**: 改 StaffDetail（header nameRow + balance-section → MemberInfoHeader）+ staff-detail.test.tsx 调整。
- **Out**: 不改汇总卡片；不改日分组历史 / 作废 / 分批渲染；不做其它 header（02/04）。

## Context

- 现状：StaffDetail（src/components/staff-detail.tsx）ListHeaderComponent 三块——nameRow（名 + LevelBadge）、balance-section 卡片（testID=balance-section，含 balance-total MoneyText）、record-summary 卡片（testID=record-summary，共 N 条 + record-topup-total + record-out-total）。
- 测试：staff-detail.test.tsx 余额断言用 balance-section / balance-total testID（无「余额」文案断言）；名 + 等级断言在 nameRow（如「金客」/「金站」）；汇总断言用 record-summary 等 testID。
- 注：本 spec 替换 nameRow + balance-section 两块为组件，汇总卡片保留。余额从独立卡片降为组件第二行（「完全对齐」代价）。
- ADR-0006 组件测试；ADR-0007 列表分批渲染（本 spec 不动分批）。

## Design

- **Interface delta** — `StaffDetail` 公开 surface 不变（props 仍 `staffId` / `onOpenRecord`）。内部 `ListHeaderComponent` 的 `nameRow` + `balance-section` 两块换成 `<MemberInfoHeader staffId={staffId} />`；`record-summary` 卡片保留。移除 StaffDetail 自身的 `useMemberBalance` + `useStaffById` 调用（名 / 等级 / 余额展示全部交 MemberInfoHeader，避免重复 + rules-of-react clean）。
- **Internal architecture** — header JSX：nameRow + balance-section → MemberInfoHeader；header 区既有样式随之清理。`record-summary` 及其 useMemo（topupTotal / outTotal / recordCount）保留。日分组历史 / 作废 / 分批渲染不动。
- **Test seam** — 单一外部 seam：StaffDetail 组件级（复用既有 staff-detail.test.tsx）。余额断言调整到 MemberInfoHeader 第二行（testID 或余额文本）；名 + 等级 + 汇总断言保留。

## Rework on failure

failure is isolated; redo this spec only（会员详情 header 独立）。
