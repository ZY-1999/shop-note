# 记账首页 — 员工行合并 + 出单按钮 + 有库存才列

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest/RNTL, tsc clean; 出单文案/默认隐藏零库存/搜索可找零库存员工 全覆盖
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

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest` → 28 suites / 197 passed（含本 spec 改动的 staff-row 单元 + bookkeeping 集成）；`npx tsc --noEmit` → exit 0。

- **AC1（员工行合并单行 `库存：{qty}件/{variety}种` + 内联金额）** → `src/components/staff-row.test.tsx` "shows 库存：{qty}件/{variety}种 + the amount on one line when a summary is present"（`库存：12件/3种` + `¥12.00` 同行）+ `src/__tests__/bookkeeping-tab.test.tsx` "renders 库存：{qty}件/{variety}种 + amount on the row"（端到端：seed 可乐×4 in → `库存：4件/1种` + `¥12.00`，经 `staffSummaries()` one-pass rollup）。GREEN。
- **AC1（无 summary → `库存：0件/0种 ¥0.00`，非「无记录」）** → staff-row.test.tsx "shows 库存：0件/0种 ¥0.00 when there is no summary"。GREEN。
- **AC2（出库 → 出单，配色不变）** → staff-row.test.tsx "renders the out-action as 出单 (not 出库)"（`getByText("出单")` + `queryByText("出库")` null；按钮仍 `theme.danger` 底色）。GREEN。
- **AC3（默认列表只列有非零库存员工）** → bookkeeping-tab.test.tsx "hides a no-record staff in the default (no-search) view"（张三有库存显示、李四无记录隐藏）+ "also hides a staff whose balance nets to zero"（王五 in3/out3 净零——`staffSummaries()` 仍返回零值行，被屏幕谓词 `total_qty!==0||variety>0` 过滤；以有库存的李六为锚点证明列表已渲染再做负向断言）。GREEN。
- **AC4（搜索可找零库存员工做首笔入库）** → bookkeeping-tab.test.tsx "reveals a no-movement staff on search and exposes their 入库 button"（默认张三隐藏 → 输入「张」→ `useStaff({search})` 不过滤 → 张三重现 `库存：0件/0种 ¥0.00` + `in-${id}` 按钮可达）。GREEN。
- **AC5（欠货 badge + danger 底色 + 行点击/入库/出单导航无回归）** → staff-row.test.tsx "shows a 欠货 badge + danger MoneyText when has_negative"（`欠货` badge + `欠货 ¥5.00`）+ "入库 / 出单 / row each call back with the staff id" + bookkeeping-tab.test.tsx "pushes the record form prefilled with the staff + direction"（in/out → `/bookkeeping/record-form` 携 staff_id+direction）+ "shows every inventory staff, then narrows by name"（搜索按名收窄无回归）。GREEN。

**改动范围**：`src/components/staff-row.tsx`（sub 行 + MoneyText 折进 `meta` 单行；`summary?.x ?? 0` 兜底无 summary；出库→出单）+ `src/app/bookkeeping/index.tsx`（`search === ''` 时按 `summaryById.get(id) && (total_qty!==0||variety>0)` 过滤；搜索分支不过滤）。`<StaffRow .../>` 签名不变；`useStaffSummaries` 读模型未动（过滤是屏幕职责，不进 hook——spec deep-module note）。

**测试力学**：bookkeeping 集成套件改用 ADR-0006 的 `waitForSync`/`flushPending`（替代 RNTL 的 `findBy*`/`waitFor`，避免 act 重叠/定时器泄漏）+ `afterEach queryClient.clear()`；负向断言用 `waitForSync(() => expect(() => getByText(...)).toThrow())`，且先正向等到有库存锚点证明列表已渲染，再做缺席断言（避免 loading 空窗假阳性）。

Commit: see `feat(bookkeeping): 员工行合并 + 出单 + 默认有库存才列 (#02)` (this spec's Stage 2 commit).
