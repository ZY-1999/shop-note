# 记账列表行瘦身 + 充值导航接线

Type: spec
Status: done
Parent: #01
Blocked by: #01, #02

## Goal

StaffRow 移除行内充值表单的全部本地状态与 useCreateTopup，左侧会员信息换成 MemberInfoHeader，[充值] 改为 onTopup(staffId) 导航回调；记账首页将该回调接到 router.push 到 spec 02 的充值路由。

## Acceptance criteria

- [ ] [充值] 按钮按下触发 onTopup(staffId) 回调（不再展开行内表单）—— 证明导航化
- [ ] 行内不再渲染充值表单（topup-form-{id} / topup-amount / topup-note / topup-submit / topup-error 均不出现）—— 证明行内表单移除
- [ ] 行左侧渲染 MemberInfoHeader（名 + 等级 + 余额），余额展示口径不变（正 / 欠款断言保留）—— 证明会员信息对齐
- [ ] 记账首页 onTopup 接到 router.push({ pathname: '/bookkeeping/topup-form', params: { staff_id: id } })，与 onOut 对称 —— 证明接线
- [ ] 余额同步锚点：组件第二行 MoneyText 余额文本作 waitForSync 锚点；若组件保留 balance-{id} testID 则优先用 —— 证明测试可同步
- [ ] 移除「行内充值表单提交 / 拦截」两条既有用例，新增「[充值] press → onTopup 回调」用例 —— 证明测试更新

## Scope

- **In**: 改 StaffRow（移除 inline form + onTopup prop + 左侧换组件）+ bookkeeping/index.tsx（接 onTopup）+ staff-row.test.tsx 改写。
- **Out**: 不改 TopupForm / 路由（02）；不改出库表单（04）；不改会员详情（05）；行容器 / 右侧按钮 / onOpen 不变。

## Context

- 现状：StaffRow（src/components/staff-row.tsx）行内 showTopup 表单 + useCreateTopup + useMemberBalance；注释「money-in is this row's concern, not a navigation target」—— 本 spec 翻转此决策。
- 首页：src/app/bookkeeping/index.tsx，StaffRow 当前接 onOut（router.push record-form）+ onOpen（router.push staff/[id]）—— onTopup 同构。
- 测试：staff-row.test.tsx 现有余额正 / 欠款两条（保留）+ 行内充值提交 / 拦截两条（移除）；balance-{id} testID 是 waitForSync 锚点。
- ADR-0006 组件测试；typedRoutes 校验 router.push 路径。

## Design

- **Interface delta** — `StaffRow` props 新增 `onTopup: (staffId: string) => void`（与 `onOut` / `onOpen` 同构）。移除行内表单的全部本地 state 与 `useCreateTopup`（无新公开 surface，是删减）。`bookkeeping/index.tsx` 给 StaffRow 传 `onTopup={(id) => router.push({ pathname: '/bookkeeping/topup-form', params: { staff_id: id } })}`。
- **Internal architecture** — StaffRow 删除 `showTopup` / `amount` / `note` / `error` state、`submitTopup`、inline form JSX、`useCreateTopup`。左侧 `main` 区的 header + meta 两行换成 `<MemberInfoHeader staffId={staff.id} />`（余额 query 随之上移到组件内）。右侧 `actions`（`[充值]` / `[出库]`）不变，`[充值]` `onPress` 从 `setShowTopup` 改为 `onTopup(staff.id)`。行容器 / `onOpen` 不变。
- **Test seam** — 单一外部 seam：StaffRow 组件级。`onTopup` 传 jest.fn 断言被调用；余额同步锚点用 MemberInfoHeader 第二行余额文本（`waitForSync` 轮询），若组件保留 `balance-{id}` testID 则优先用。

## Rework on failure

failure is isolated; redo this spec only（行 + 接线自洽）。

## Evidence — done 2026-07-11

**Shipped:**
- `src/components/staff-row.tsx` — `StaffRow` 移除全部行内充值 state（showTopup / amount / note / error / submitTopup）+ `useCreateTopup` + `useMemberBalance` + `MoneyText` / `LevelBadge` 直渲染；左侧 `main` 换成 `<MemberInfoHeader staffId={staff.id} />`；新增 `onTopup: (staffId) => void` prop（与 `onOut` / `onOpen` 同构），`[充值]` onPress 从 `setShowTopup` 改为 `onTopup(staff.id)`。行容器 / 右侧按钮 / `onOpen` 不变。
- `src/app/bookkeeping/index.tsx` — StaffRow 接 `onTopup={(id) => router.push({ pathname: '/bookkeeping/topup-form', params: { staff_id: id } })}`（与 `onOut` 对称）；docstring 同步。

**Tests (`src/components/staff-row.test.tsx`, 3 tests, all green):**
1. 余额正：MemberInfoHeader 渲染 `¥100.00`，无欠款标 ✓（AC3）
2. 余额负：`欠款 ¥10.00` danger ✓（AC3）
3. **新增**：`[充值]` press → `onTopup(member.id)` 被调用；行内表单（`topup-form-{id}` / `topup-amount`）不出现 ✓（AC1 + AC2）

移除两条行内表单用例（充值提交 / 拦截）—— 表单已上移到 spec 02 的子页面。余额同步锚点从 `balance-{id}` testID 改为余额文本（MemberInfoHeader 的 MoneyText 不带 staffId 后缀 testID，AC5）。

`npx tsc --noEmit` clean。StaffRow 唯一消费者是 bookkeeping/index.tsx（已同步接线）。无 Rework triggered。
