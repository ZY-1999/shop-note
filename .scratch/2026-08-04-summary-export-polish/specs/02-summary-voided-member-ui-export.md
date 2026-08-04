# 汇总页：已删会员原名标红 + 导出接线

Type: spec
Status: ready-for-agent
Parent: #01 (01-summary-export-polish.md)
Blocked by: #01 (01-workbook-time-width-voided-suffix.md)

## Goal

汇总页解析已作废会员原名并标红，导出时把 void 状态交给 workbook builder。

## Acceptance criteria

- [ ] 已作废会员的历史充值/出库仍显示原名（不退化为 staff_id）
- [ ] 已作废会员名字为红色；有效会员保持现有主题色与等级徽章
- [ ] 导出「充值出库」「充值出库明细」中已作废会员为「原名（已删除）」；有效会员无后缀
- [ ] 不作废 ledger 的 staff_id / 金额 / 汇总口径

## Scope

- **In**：summary-tab staff 读取（含 voided）、UI 红名、导出 build 闭包传 void 状态。
- **Out**：builder 列宽/后缀算法本身（#01）；配置下限；ItemsSelector；管理页已删除标签样式统一。

## Context

- 依赖 #01 workbook 输入合约。
- 今日 `useStaff()` / `staff.list()` 默认排除 voided → 汇总退 id。
- `dailyFlow` 不按会员 void 过滤流水；ledger 保留 staff_id。
- MemberName 接受可选 nameStyle；管理页 void 样式不同（灰名+红标签）— 本需求要名字标红。

## Design

- **Interface delta**
  - 汇总 `useStaff({ includeVoided: true })`（或等价 list）构建 `staffById`，含 `voided_at != null` 行。
  - Staff 行渲染：`MemberName` 的 `nameStyle` 在 voided 时为红色（主题危险色或固定红）；非 voided 保持现有 `theme.text`。
  - 导出 `build`：`staffDirectory` 自 `repos.staff.list({ includeVoided: true })`（或与页面同一来源），`voided: !!s.voided_at`；不再用默认 list 漏 voided。
  - **Deep-module note**：UI 与导出共用同一「含 voided 的会员目录」语义；后缀仍由 builder 拼。
- **Internal architecture**
  - 不改 ledger / dailyFlow 过滤；只修名字解析与样式。
  - 等级徽章：voided 会员仍显示其 level（若有）。
- **Test seam**：`summary-tab.test.tsx` — void 会员后仍见原名 + 名字色为红；有效会员非红；全选导出后会员 sheet 单元格含「（已删除）」。

## Rework on failure

失败隔离在 summary-tab 读 staff + 样式 + 导出 directory 接线；可单独重做本 spec。
