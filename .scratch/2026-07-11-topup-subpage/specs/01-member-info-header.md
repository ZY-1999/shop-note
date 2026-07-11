# 会员信息 header 组件提取

Type: spec
Status: done
Parent: #01
Blocked by: None — can start immediately

## Goal

提取纯展示组件 MemberInfoHeader（props: staffId），内部 useStaffById + useMemberBalance，渲染两行（名 + LevelBadge / 余额 + MoneyText），作为充值/出库表单、会员详情、记账列表行四处复用的正确性基座。

## Acceptance criteria

- [ ] 给定有等级 + 已有充值/出库的会员，第一行渲染会员名 + 等级徽标（金站显示、普站省略）—— 证明等级渲染正确
- [ ] 第二行渲染「余额」标签 + MoneyText，金额 = Σ topup − Σ out line_amount（经真实 InMemoryAdapter）—— 证明余额派生正确
- [ ] 余额为负时第二行渲染「欠款 ¥X.XX」（danger 色）；为正时渲染「¥X.XX」—— 证明欠款标
- [ ] 组件不渲染边框、按钮或任何可交互元素 —— 证明纯展示
- [ ] 组件在 renderWithProviders 下直接挂载（不依赖 router），props 仅 staffId —— 证明 router-agnostic 可测

## Scope

- **In**: 新建 MemberInfoHeader 组件 + 其 RNTL 组件测试。
- **Out**: 不改 StaffRow / RecordForm / StaffDetail（消费在 03/04/05）；不动数据层；不纳入管理页会员行。

## Context

- 词汇：会员 Staff（名 + 手动等级 level normal/gold）、会员余额 MemberBalance（Σ topup − Σ out，欠款允许负，ADR-0002 派生不存储）、LevelBadge（既有展示组件，普站省略 / 金站 accent）。
- 数据流：useStaffById（reads.ts，返回含 name + level 的 Staff）、useMemberBalance（reads.ts，返回 Balance.amount）—— 两个独立 useQuery；React Compiler 开启下 rules-of-react 要求每 hook 一个 useQuery 顶层调用（CodeMap Risk Areas）。
- 测试：ADR-0006（真实 InMemoryAdapter，不 mock repos）；renderWithProviders（src/testing/render.tsx）；waitForSync / flushPending（src/testing/async.ts）。
- 布局基准：StaffRow 现有 header(name + LevelBadge) + meta(余额) 两行（src/components/staff-row.tsx）—— 以此为视觉基准。
- prior art：staff-row.test.tsx 的余额正 / 欠款断言写法。

## Design

- **Interface delta** — 新增 `MemberInfoHeader({ staffId: string }): ReactElement`（纯展示，props 仅 `staffId`）。内部消费既有 `useStaffById` + `useMemberBalance`（无新数据表面）。渲染两行：第一行 `<Text>{name}</Text>` + `<LevelBadge level={level} />`；第二行「余额」标签 + `<MoneyText cents={amount} negativeLabel="欠款" />`。余额为负时 MoneyText 自带 danger 色 + 欠款标。
  - **Deep-module note** — surface 一个 prop，隐藏「会员查询 + 等级展示 + 派生余额 + 欠款标」——合理的 deep module，无需 DEEPENING。
- **Internal architecture** — 无 state / 无 callback。两个 `useQuery` 顶层调用（rules-of-react clean，React Compiler 开启）。布局以 StaffRow 现有 header + meta 两行为基准（视觉等价）。查询 loading 时名显示「加载中」、余额按 0 兜底（与既有 staff-detail 一致）。
- **Test seam** — 单一外部 seam：组件本身。`renderWithProviders` 挂载 `<MemberInfoHeader staffId={...} />`，真实 InMemoryAdapter 驱动，断言两行渲染（ADR-0006）。

## Rework on failure

failure is isolated; redo this spec only（组件无消费者前可独立验证）。

## Evidence — done 2026-07-11

Shipped `MemberInfoHeader({ staffId: string })`（`src/components/member-info-header.tsx`）— 纯展示，两行（名 + LevelBadge / 余额 + MoneyText），内部 `useStaffById` + `useMemberBalance`，无 state / 无 callback / 无 border。

5/5 AC 覆盖（`src/components/member-info-header.test.tsx`）：
1. 金站会员 name + level-badge + Σ topup − Σ out 余额 ✓
2. 普站会员 name 渲染、level-badge 省略 ✓
3. 负余额 → 欠款 ¥X.XX（danger）✓
4. 无 button / text-input / border（`root.props.style` 为空对象）✓
5. renderWithProviders 直挂、props 仅 staffId、loading 兜底「加载中」+ ¥0.00 ✓

`npx tsc --noEmit` clean；既有 staff-row 4/4 不受影响。无 Rework triggered。
