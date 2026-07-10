# 会员化改名 — 用户可见「员工」→「会员」（展示词 only）

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: None — can start immediately

## Goal

把全 app 用户可见的「员工」文案统一改为「会员」（仅展示词；`Staff`/`staff_id`/`staff` 表/`staff/[id]` 路由/组件名/query key 等代码标识符全部不动），代码注释里的「员工」一并同步以免新旧词混用。

## Acceptance criteria

- [ ] 管理页：分段标签「员工」→「会员」、搜索占位「搜索会员姓名或电话」、新增按钮「新增会员」—— 证明管理页文案全改。 *(manage-tab.test.tsx)*
- [ ] 记账首页：搜索占位「搜索会员姓名或电话」—— 证明记账首页文案。 *(bookkeeping-tab.test.tsx)*
- [ ] 会员详情：Stack header 标题「员工详情」→「会员详情」—— 证明详情页标题。 *(bookkeeping/_layout.tsx 配置；可由导航/渲染断言或人检)*
- [ ] 记账校验：未选会员提交时提示「请选择会员」—— 证明校验文案。 *(record-form-validation.test.ts)*
- [ ] dev tracer 默认名「新员工」→「新会员」—— 证明 tracer 文案。 *(staff-list-tracer.test.tsx)*
- [ ] `src/` 内不再有面向用户的「员工」串（`grep 员工 src/` 仅余已同步的注释或零结果）—— 证明改名彻底。
- [ ] 代码标识符未改：`Staff` 类型、`staff_id` 字段、`staff` 表名、`staff/[id]` 路由文件、`qk.staff`、`useStaff*` hook 名、组件名（`StaffForm`/`StaffManage`/`StaffRow`/`StaffDetail` 等）均保留—— 证明"仅展示词"边界（`git diff` 不含这些标识符的重命名）。 *(typecheck + 既有测试全绿为代理证据)*
- [ ] 既有全部测试绿（仅文案断言随改）—— 证明无回归。

## Scope

- **In**: 面向用户的「员工」串所在源文件——`src/components/manage-tab.tsx`（分段/占位/按钮）、`src/app/bookkeeping/index.tsx`（搜索占位）、`src/app/bookkeeping/_layout.tsx`（Stack 标题）、`src/components/record-form-validation.ts`（校验消息）、`src/components/staff-list-tracer.tsx`（默认名）；对应测试 `manage-tab.test.tsx`、`src/__tests__/bookkeeping-tab.test.tsx`、`record-form-validation.test.ts`、`staff-list-tracer.test.tsx` 的文案断言；非用户可见注释里的「员工」（如 `inventory.ts`、`record-form.tsx`、`_layout.tsx` 注释）同步。
- **Out**: 任何代码标识符重命名（`Staff`→`Member` 等，明确不做）；`.scratch/` 历史 spec/PRD 的文案（不可变历史）；CONTEXT.md / codemap 的中文展示串同步（sdd-flow summarize 步统一处理，避免与 #03 争抢同一文档）；等级字段与 UI（#01/#03）。

## Context

- 先例：CONTEXT.md「页面优化重构」—— `direction: out` 的展示词由「出库」改「出单」，数据层 enum `out` 不变。本 spec 同构：展示词改、标识符不动。
- 改名触及的模块见 [CodeMap](../../../../docs/codemap/project.md)：管理页（[manage-tab.tsx](../../../../src/components/manage-tab.tsx)）、记账首页（[bookkeeping/index.tsx](../../../../src/app/bookkeeping/index.tsx)）、记账 Stack header（[bookkeeping/_layout.tsx](../../../../src/app/bookkeeping/_layout.tsx)）、表单校验（[record-form-validation.ts](../../../../src/components/record-form-validation.ts)）、dev tracer（[staff-list-tracer.tsx](../../../../src/components/staff-list-tracer.tsx)）。
- 注：本 spec 与 #03（level-ui）共享 `manage-tab.tsx`，但改的是不同行（纯文本 vs 新增选择器组件），顺序应用不冲突；建议 #02 先于 #03 落地，使 #03 直接在已改名文件上写「会员」。
- Expo SDK 57 / React Compiler：纯文案改动无 hooks/状态变化，无风险面。

## Design

- **Interface delta** — 无。纯展示字符串替换，不改任何类型/签名/schema/路由/query key/mutation。代码标识符（`Staff`、`staff_id`、`staff` 表、`staff/[id]` 路由、`qk.staff`、`useStaff*`、组件名）一律保留。
- **Internal architecture** — 无结构决策；机械式文本替换。落点：用户可见串（分段标签 / 搜索占位 / 按钮文案 / Stack 标题 / 校验消息 / tracer 默认名）+ 注释同步；对应测试的文案断言同步更新。CONTEXT.md / codemap 的中文展示串不在本 spec 提交，留 sdd-flow summarize 统一刷。

## Rework on failure

失败隔离到文案。若某处「员工」遗漏或某测试断言未同步，仅补该处；无架构性回退点。
