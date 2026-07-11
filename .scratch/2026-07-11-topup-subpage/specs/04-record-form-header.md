# 出库表单 header 对齐

Type: spec
Status: ready-for-human
Parent: #01
Blocked by: #01

## Goal

RecordForm header 既有「出库 / 入库」方向词 + 单行 staffName 替换为 MemberInfoHeader，使出库表单 header 与其余三处完全一致；方向信息由 Stack 导航栏动态标题（recordFormTitle，已存在且有单测）承担。

## Acceptance criteria

- [ ] 表单 header 渲染 MemberInfoHeader（名 + 等级 + 余额），不渲染方向词（出库 / 入库 字样不在表单组件内出现）—— 证明 header 对齐
- [ ] 既有「renders the out-direction as 出库 (not 出单)」用例整体删除或重写 —— 证明方向词测试处置
- [ ] prefill 用例的方向断言移除或改为「header 不渲染方向词」—— 证明 prefill 测试调整
- [ ] 新增「header 渲染会员信息组件」断言 —— 证明新 header 验收
- [ ] 表单提交、校验、时间回填等既有行为不受影响（回归通过）—— 证明无回归

## Scope

- **In**: 改 RecordForm（header 换组件 + 移除 DIRECTION_LABEL 表单内渲染）+ record-form.test.tsx 调整。
- **Out**: 不改 record-form route adapter（setOptions 标题不变）；不改表单其余部分（商品 / 明细 / 合计 / 备注 / 时间 / 提交）；不做充值表单（02）。

## Context

- 现状：RecordForm（src/components/record-form.tsx）header 渲染 DIRECTION_LABEL[direction] + staffName；方向词颜色随 direction（success / danger）。
- 方向承担：route adapter（src/app/bookkeeping/record-form.tsx）useNavigation().setOptions({ title: recordFormTitle(dir) })，recordFormTitle（tab-config.ts）返回 入库 / 出库，tab-config.test.ts 已锁。
- 测试：record-form.test.tsx prefill 用例的方向断言、「renders the out-direction as 出库 (not 出单)」整用例（含 queryByText('出单') 负向断言）受影响；submit 按钮颜色随 direction 属 prop 功能不受影响。
- ADR-0006 组件测试。

## Design

- **Interface delta** — `RecordForm` 公开 surface 不变（props 仍 `staffId` / `direction` / `edit?` / `onSaved?`）。内部 header 区从 `DIRECTION_LABEL[direction]` + `staffName` 换成 `<MemberInfoHeader staffId={staffId} />`。移除 `DIRECTION_LABEL` 常量（仅 header 用——submit 按钮颜色用 `direction` prop 直接判，不依赖它）。
- **Internal architecture** — header JSX 替换；header 区既有样式随之清理。方向信息由 route adapter 既有 `setOptions({ title: recordFormTitle(dir) })` 承担（本 spec 不改 route）。表单其余部分（商品搜索 / 明细 / 合计 / 备注 / 时间 / 提交）不动。
- **Test seam** — 单一外部 seam：RecordForm 组件级（复用既有 record-form.test.tsx）。移除 / 改写方向词断言；新增 MemberInfoHeader 渲染断言。

## Rework on failure

failure is isolated; redo this spec only（出库表单 header 独立）。
