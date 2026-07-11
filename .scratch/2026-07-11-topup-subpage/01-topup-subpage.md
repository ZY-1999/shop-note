# 充值子页面（对称出库）+ 会员信息 header 统一

Type: prd
Status: ready-for-agent

## Problem Statement

会员的两大钱动作（充值 / 出库）体验不对称：「出库」是独立子页面（搜商品、挑数量、备注、改时间，提交后返回列表），而「充值」是行内就地展开的小表单——只有金额和备注，没有时间回填，也没有独立视野。同时，"会员信息（名 + 等级 + 余额）"在多处展示但布局不一：记账列表行是「名+等级 / 余额」两行，出库表单 header 只有一行方向词 + 名（无等级无余额），会员详情 header 是「名+等级」一行 + 余额独立卡片 + 汇总卡片。用户希望把充值提成和出库对称的独立子页面，并提取一个统一的"会员信息 header"组件（第一行：会员名 + 等级徽标；第二行：余额），让充值 / 出库表单 header、会员详情 header、记账列表行四处复用、完全对齐。

## Solution

把充值从「行内表单」提成「独立子页面」（结构与出库对称）；提取一个会员信息 header 展示组件（第一行 会员名 + 等级徽标，第二行 余额），让四处"会员信息"展示完全一致地复用它。

- 记账列表行的 `[充值]` 从就地展开改为跳转到新的「充值」子页面，和 `[出库]` 完全对称（router push + route adapter + router-agnostic 表单组件）。
- 充值子页面字段：金额（元→分）、备注、**时间选择器**（与出库同款：Android dialog / iOS inline 双分支，可回填）。
- **提取会员信息 header 组件**：props 为 `staffId`；内部 `useStaffById`（名 + 等级）+ `useMemberBalance`（余额）。渲染两行——第一行「会员名 + 等级徽标（复用既有 `LevelBadge`）」，第二行「余额（`MoneyText` + 欠款标，负值标红）」。纯展示，无边框 / 无操作按钮。
- **四处复用，完全对齐**：充值表单 header、出库表单 header、会员详情 header、记账列表行——都改用该组件渲染会员信息。
- 出库表单内既有的「出库 / 入库」方向词移除（方向信息由 Stack 导航栏动态标题承担），使出库表单 header 与其余三处完全一致。
- 会员详情的余额从"独立卡片"并入组件第二行；其下的「共 N 条 / 充值 / 出库」汇总卡片保留不变。
- 记账列表行左侧会员信息换成该组件，右侧 `[充值]` `[出库]` 按钮保留。
- 提交后 `router.back()` 回记账列表；余额 / 综合流水经既有 family-root 失效链路自动刷新。

## User Stories

1. 作为操作员，我想点 `[充值]` 进入一个独立、专注的充值页面（和出库一样），以便不受列表干扰地完成充值。
2. 作为操作员，我想在充值页面输入金额（元）和备注，以便记录这笔充值。
3. 作为操作员，我想在充值页面修改时间（默认现在、可回填），以便补登过去时刻的充值——和出库一致。
4. 作为操作员，我想在充值 / 出库表单 header 看到一致的会员信息（第一行 名 + 等级徽标，第二行 当前余额），以便确认这笔钱动作相关状态。
5. 作为操作员，我想在会员详情 header 看到与其余位置一致的会员信息（名 + 等级 / 余额两行），而不是一个独立的余额卡片。
6. 作为操作员，我想记账列表行的会员信息与其余位置一致（统一组件），视觉不割裂。
7. 作为操作员，我想充值提交后自动回到记账列表并看到更新后的余额，无需手动刷新。
8. 作为操作员，我想充值金额非法（空 / 非正 / 非数字）时被拦下并提示，不产生错误数据。
9. 作为操作员，我想作废一笔充值仍是充值的纠错方式（会员详情里 `作废`，不变）——本次只改"录入入口"，不改"纠错入口"。

## Implementation Decisions

- **路由范式（复用出库）**：新增充值子页面 = route adapter（读 `staff_id` 路由参数、设 Stack 标题）+ router-agnostic 的充值表单组件（props 接 `staffId`）。表单组件不依赖 router，可直接挂在测试 providers 下（ADR-0006）。这是出库（出库表单组件 + 其 route adapter）已建立的模式，原样复用。
- **记账 tab Stack 注册**：在记账 tab 的 Stack 布局注册新的充值 screen；typedRoutes 开启，新增路由路径需与所有 `router.push` 引用一致（编译期校验）。
- **会员信息 header 组件（核心，四处复用）**：新提取展示组件，props 为 `staffId`；内部 `useStaffById`（名 + 等级）+ `useMemberBalance`（余额），两个独立的顶层 `useQuery`（符合 React Compiler 开启下的 rules-of-react）。渲染两行——第一行「会员名 + `LevelBadge`」，第二行「"余额" + `MoneyText`（`negativeLabel` 欠款，负值标红）」。纯展示、无边框、无操作。布局以记账列表行现有的「名+等级 / 余额」两行为基准。
- **充值 / 出库表单 header**：表单 header 即该组件。出库表单移除既有方向词 + 单行 staffName，换成该组件。
- **会员详情 header**：顶部 `nameRow` + 独立「余额」卡片两块，替换为该组件；其下的「共 N 条 / 充值 / 出库」汇总卡片保留不变。
- **记账列表行**：左侧既有「名+等级 / 余额」两行（header + meta）替换为该组件；右侧 `[充值]` `[出库]` 按钮及行容器不变。
- **列表行瘦身 + 充值导航化**：记账列表行移除行内充值表单的本地状态与 `useCreateTopup`，`[充值]` 改为 `onTopup(staffId)` 导航回调（与既有 `onOut` 对称）；记账首页把该回调接到 `router.push` 到新充值路由。行上的 `useMemberBalance` 随组件提取而上移到组件内。
- **出库表单内方向词移除**：出库表单 header 既有「出库 / 入库」方向词（颜色字样）随 header 统一而移除；方向信息由 Stack 导航栏动态标题（`recordFormTitle` → 入库 / 出库，已存在且有单测）承担，不丢失。
- **金额换算与校验**：金额输入元（decimal-pad），提交前 `Math.round(yuan*100)` 转分；校验"有限数且 > 0"，非法时就地提示、不提交。沿用当前行内表单的校验口径。
- **时间选择器（新增）**：充值表单加时间字段，默认 `Date.now()`，可回填；`TopupCreateInput.timestamp` 本就 user-settable，数据层无改动。复用出库表单的双分支 picker（Android mount-on-demand dialog：确认 `onValueChange` / 取消 `onDismiss` 卸载；iOS inline 常驻）。
- **导航文案**：充值子页面标题「充值」是固定文案，按既有固定标题惯例（Stack `options` 配置，如「会员详情」），无需像入库/出库那样走动态标题单源函数。
- **数据层无改动**：`TopupRepository` / `MemberBalance` / `useStaffById` / `useMemberBalance` / `useCreateTopup` / 失效族（`qk.topups` + `qk.balance` + `qk.dailyFlow`）均已就绪，本 PRD 纯 UI 层重构 + header 组件提取 + 多处对齐。
- **提交后导航**：与出库一致，提交成功 `router.back()` 回记账列表；余额 / 流水经既有 family-root 失效自动刷新（ADR-0005）。

## Testing Decisions

- **只测外部行为，不测实现细节**（ADR-0006）：表单与 header 组件经真实 `InMemoryAdapter` 挂载（不 mock repos），从用户动作驱动到可观察结果。
- **会员信息 header 组件测试**：新组件单独测——给定一个会员（带等级 + 已有充值/出库），第一行渲染会员名 + 等级徽标，第二行渲染正确余额；余额为负时第二行渲染欠款标。这是四处复用的正确性基座。
- **新增充值表单组件测试**（prior art = 出库表单测试）：覆盖——金额校验（空 / 非法被拦、就地提示）、有效提交走 `useCreateTopup` 并写入正确金额（元→分）、时间默认 now 且可回填、提交成功触发 `router.back`。复用出库测试的 mock（`expo-router.router.back` + `@expo/ui` DateTimePicker stub）与异步助手（从 `@/testing/async` 导入 `waitForSync` / `flushPending`）。
- **出库表单测试调整**：（a）新增"header 渲染会员信息组件（名 + 等级 + 余额）"的断言；（b）表单内方向词移除后，既有两条"表单内出现「出库」字样"的断言失效——方向信息现由导航栏标题承担（route 层，组件测试不挂 router）。其中一条所在的整个用例（「renders the out-direction as 出库 (not 出单)」，还含一条 `queryByText('出单')` 的负向断言）随方向词移除而整体删除或重写；另一条（prefill 用例里的方向断言）移除或改为断言 header 不再渲染方向词。
- **会员详情测试调整**：header 现在用会员信息组件，既有余额断言（`balance-section` / `balance-total` 两个 testID——无「余额」文案断言）改为对应到组件第二行（testID 命名视组件实现调整）；汇总卡片（`record-summary` / `record-topup-total` / `record-out-total`）断言保留；既有 nameRow 的名 + 等级徽标断言不受影响（组件第一行仍渲染）。
- **记账列表行测试调整**：余额展示（正 / 欠款）断言保留（组件第二行仍渲染），但其 `balance-{id}` testID 是既有用例的 `waitForSync` 同步锚点——组件内部 `MoneyText` 的 testID 命名属实现细节，未必保留该带 `staffId` 后缀的形式，实现时需视组件 testID 方案调整该锚点或改用余额文本同步；移除"行内充值表单提交 / 拦截"两条用例；新增"`[充值]` press 触发 `onTopup` 回调"。（该测试既有用例不涉及名 / 等级断言；组件第一行由组件单测覆盖，无需在此新增。）
- **route adapter 不测**（既有惯例）：route 文件只做 param 读取 + 标题设置，无业务逻辑，RNTL 挂不了原生 Stack，与出库 route 同 posture。
- **真实 SQL 仍归 device smoke**（ADR-0004）：本 PRD 不涉及 adapter / SQL，无需额外 device 验证。

## Out of Scope

- 充值 / 出库子页面展示"本次操作后的预计余额"（实时随合计变动）——本次只展示操作前的当前余额；预计余额是进一步增强。
- 充值的"编辑"能力——`TopupRepository` 无 update，充值纠错仍靠作废重录（会员详情 `作废`），不变。
- 管理页（管理 tab）的会员列表行也统一进新 header 组件——管理页是会员 CRUD 视角、不展示余额，组件含余额不适合，本次不纳入。
- 记账列表行除"会员信息组件化 + 充值导航化"以外的 UI 改动。
- 数据层任何改动（schema / repo / 派生 / 失效族）。

## Further Notes

- 本 PRD 显式翻转了"列表行内充值表单"这一既有设计决策（列表行注释曾明示"money-in is this row's concern, not a navigation target"）——充值改为导航式子页面，与出库对称。
- 会员信息 header 组件以记账列表行现有的「名+等级 / 余额」两行布局为基准提取，反向统一到充值 / 出库表单 header 与会员详情 header；会员详情的余额因此从独立卡片降为组件第二行（汇总卡片保留），这是"完全对齐"的代价。
- 出库表单内方向词因此移除（方向交导航栏标题），同为"完全对齐"的代价。
