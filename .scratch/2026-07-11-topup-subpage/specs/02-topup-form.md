# 充值表单组件 + 路由（对称出库子页面）

Type: spec
Status: ready-for-human
Parent: #01
Blocked by: #01

## Goal

新建 router-agnostic 的 TopupForm 组件（props: staffId）+ route adapter，结构与出库表单对称：header 用 MemberInfoHeader，字段含金额（元→分）、备注、时间选择器（双分支 picker），提交走 useCreateTopup 后 router.back()。

## Acceptance criteria

- [ ] 金额空 / 非正 / 非数字时提交被拦截，就地提示「请输入有效金额」，不产生写入 —— 证明校验
- [ ] 有效金额提交时 Math.round(yuan*100) 转分后经 useCreateTopup 写入正确金额（断言 repo topup.amount）—— 证明元→分 + 写入
- [ ] 时间默认 Date.now()，可通过 picker 回填（复用出库测试 DateTimePicker stub + backdate 验证落到 timestamp）—— 证明时间可回填
- [ ] 提交成功触发 router.back()（复用出库测试 expo-router.router.back mock）—— 证明提交后导航
- [ ] header 渲染 MemberInfoHeader（名 + 等级 + 余额），不渲染方向词 —— 证明 header 对齐
- [ ] 路由在 bookkeeping/_layout.tsx 注册为 topup-form，route adapter 文件 src/app/bookkeeping/topup-form.tsx，typedRoutes 编译通过 —— 证明路由就位
- [ ] 提交走 useCreateTopup（onSuccess 既有失效 qk.topups / qk.balance / qk.dailyFlow），表单不手动 refetch —— 证明复用失效链路

## Scope

- **In**: 新建 TopupForm 组件 + route adapter + _layout 注册 + 组件测试。
- **Out**: 不改 StaffRow（接线在 03）；不改数据层（useCreateTopup / TopupCreateInput 已就绪）；不做出库表单（04）。

## Context

- 对称范式：出库表单 RecordForm（src/components/record-form.tsx，router-agnostic）+ 其 route adapter（src/app/bookkeeping/record-form.tsx，读 staff_id + direction、setOptions 动态标题）—— 原样复用此模式。
- 时间选择器：出库表单双分支 picker（Android mount-on-demand dialog：onValueChange 确认 / onDismiss 取消卸载；iOS inline 常驻）；record-form.test.tsx 有完整 mock 范式（DateTimePicker stub + backdate 按钮 + Android dialog 契约测试）。
- 数据层：useCreateTopup（mutations.ts，失效 qk.topups + qk.balance + qk.dailyFlow）、TopupCreateInput（topup.ts，timestamp user-settable / backdatable）—— 就绪。
- 导航文案：固定标题「充值」按既有固定标题惯例（Stack options，如「会员详情」）；recordFormTitle（tab-config.ts）只管入库 / 出库动态标题，不适用。
- ADR-0006 组件测试；route adapter 不测（RNTL 挂不了原生 Stack）。

## Design

- **Interface delta** — 新增 `TopupForm({ staffId: string }): ReactElement`（router-agnostic，props 仅 `staffId`，与 RecordForm 对称但更简——无 direction / edit）。新增 route adapter `topup-form.tsx`：读 `staff_id` param → `<TopupForm staffId={staff_id} />`，`setOptions({ title: '充值' })`（固定标题）。`bookkeeping/_layout.tsx` 注册 `Stack.Screen name="topup-form"`。
- **Internal architecture** — 表单本地 state：`amount`(string, decimal-pad) / `note`(string) / `timestamp`(number, 默认 `Date.now()`) / `error` / `showTime`(Android dialog 挂载)。时间选择器复用 RecordForm 双分支（Android mount-on-demand dialog：`onValueChange` 确认 / `onDismiss` 取消卸载；iOS inline 常驻）。提交：校验金额有限数且 > 0 → `useCreateTopup.mutate({ staff_id, amount: cents(Math.round(yuan*100)), note: note.trim() || undefined, timestamp })` → `onSuccess: router.back()`。header = `<MemberInfoHeader staffId={staffId} />`。
- **Test seam** — 单一外部 seam：TopupForm 组件级。mock `expo-router.router.back` + `@expo/ui` DateTimePicker（复用 record-form.test.tsx 范式），从 `@/testing/async` 导入 `waitForSync` / `flushPending`；route adapter 不测（RNTL 挂不了原生 Stack）。

## Rework on failure

failure is isolated; redo this spec only（表单 + 路由自洽，不依赖 03/04/05）。
