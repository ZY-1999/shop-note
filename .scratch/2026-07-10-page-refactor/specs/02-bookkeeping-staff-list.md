# 记账首页 — 员工行合并 + 出单按钮 + 有库存才列

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: None — can start immediately

## Goal

重构记账首页的员工行：库存信息压成单行 `库存：m件/n种 金额`，「出库」按钮改「出单」，默认列表只列**当前有库存**的员工（无库存者不占位），但搜索时仍能找到零库存员工以便给其做首笔入库——既有导航与欠货标识不变。

## Acceptance criteria

- [ ] 员工行渲染**合并的单行** `库存：{total_qty}件/{variety}种 {金额}`（取代旧的「种类/数量」一行 + 金额一行的两行结构）；无 summary 时显示 `库存：0件/0种 ¥0.00`——证明密度提升（故事 1）。
- [ ] 出库动作按钮文案为「出单」（配色不变）——证明文案改（故事 2）。
- [ ] 默认列表（无搜索）只渲染**有非零库存**的员工（依据 `useStaffSummaries()`：`total_qty !== 0 || variety > 0`）；零库存员工不出现在默认列表——证明首页去杂（故事 5）。
- [ ] 输入搜索时，`useStaff({ search })` 结果**不过滤**零库存员工，故新建员工（零库存）可被搜到并入库——证明首笔入库路径不丢（故事 5）。
- [ ] 欠货员工仍以 badge + danger 底色标识；行点击进员工详情；入库/出单按钮跳预填表单——证明既有导航/标识无回归（故事 18）。

## Scope

- **In**: `components/staff-row.tsx`（合并行 + 出单按钮文案）；`app/bookkeeping/index.tsx`（默认列表「有库存才显示」过滤、搜索时不过滤）；两者测试。
- **Out**: 录入表单（#03）；员工详情（#04）；`useStaffSummaries` 读模型（消费，不改）；`search()` 语义（不变，仍 active-only）；管理 tab。

## Context

- 现状：`staff-row.tsx` 两行布局（sub = `${variety}种 / ${total_qty}件` 或 '无记录' + `MoneyText(total_amount)`）+ 出库按钮（文案 '出库'）。
- `app/bookkeeping/index.tsx` 用 `useStaff` + `useStaffSummaries`，按 `staff_id` 建 `summaryById` map。
- `StaffSummary = { staff_id, variety, total_qty, total_amount, has_negative }`（`data/inventory.ts`）。
- PRD 记账 #1 / #2 / #5。

## Design

- **Interface delta**: `<StaffRow staff summary onIn onOut onOpen />` 签名**不变**，只改渲染与按钮文案。记账 index 在默认（无搜索）分支加一个过滤谓词。
- **Internal architecture**:
  - **staff-row**：把 sub 行 + `MoneyText` 折进单行 `库存：{total_qty}件/{variety}种` + 内联 `<MoneyText total_amount />`；保留欠货 badge/header。无 summary 走 `库存：0件/0种 ¥0.00`。
  - **bookkeeping index**：`search === ''` 时过滤 `staff.data` 为 `summaryById.get(id)` 命中且 `total_qty !== 0 || variety > 0`；搜索激活时 `staff.data` 全量不过滤。`useStaffSummaries` 查询仍共享（一次 invalidate 刷所有行）。
  - **Deep-module note**: 唯一行为新增是列表边界的一个过滤谓词，**不进 hook**（读模型保持通用，过滤属屏幕职责）。
- **「出单」文案分布说明**：本 spec 仅改 `staff-row` 的按钮文案；`record-form`(#03) / `staff-detail`(#04) 各改各自文件的 `DIRECTION_LABEL.out`，互不冲突。

## Rework on failure

隔离在 staff-row + bookkeeping index；纯展示 + 列表过滤，无数据层风险。
