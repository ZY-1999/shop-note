# 员工详情 — 库存可折叠 + 总金额 + 按天记录 + 分批 + 出单

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #1

## Goal

重构员工详情屏：「持仓」改「库存」并显示库存总金额、商品明细默认收起（点图标展开）；记录栏头部显示「共 N 条 / 入库 / 出单」；记录按本地天倒序分组、带天分隔线（每日显示当日入库/出单）、按天分批；各条记录仍可点进记录详情（编辑/作废）。应用「出单」文案。

## Acceptance criteria

- [ ] 持仓段标题改「库存」（非「持仓」），旁显示**库存总金额** = `Σ holdings.cost_amount`（`MoneyText`）；商品明细行**默认隐藏**，点 toggle 图标后展开/收起——证明改名 + 总额 + 默认收起（故事 8、9）。
- [ ] 记录段头部显示 `共 {N} 条`（= 该员工未作废记录数）+ 入库总额 + 出单总额（从该员工记录 `line_amount` 按 direction 现算）——证明概览（故事 10）。
- [ ] 记录按**本地天**倒序分组（`formatDate`）；每天一分隔线行 `YYYY/MM/DD  入库¥xx  出单¥xx  --------`；分隔线下列当日各条记录（`HH:mm` + `items×qty` + 金额），每条可点 → `onOpenRecord` → 记录详情——证明按天分组 + 保留编辑/作废入口（故事 11）。
- [ ] 天数多时，首屏渲染首批若干日，`onEndReached` reveal 下一组**整日**（分隔线不被劈开）——证明分批（故事 12，ADR-0007）。
- [ ] 出单文案应用于历史；欠货仍标识——证明文案 + 无回归。

## Scope

- **In**: `components/staff-detail.tsx`（整体重构——库存可折叠 + 总额、记录按天 + 头部 + 分批、`ScrollView`→`FlatList`）；`staff-detail.test.tsx`（重写）；消费 `formatDate` + `formatTime`（#01）。
- **Out**: 持仓/历史读模型（`useStaffInventory` / `useStockRecords`——消费不变）；记录详情 / 编辑 / 作废（#07，不变）；录入表单（#03）。

## Context

- 现状：`staff-detail.tsx` 「持仓」段（holdings 行：title/qty件/cost）+「记录」段（扁平历史 `ScrollView`，行可点 `onOpenRecord`）。
- `Balance.cost_amount`（现价重估口径）；`useStockRecords({ staff_id })` 返回 `RecordWithItems[]`（item 带 `line_amount`）；`daily-flow.dayBucket` 本地天口径。
- PRD 员工详情 #1 / #2 / #3；ADR-0007（按天分批）；`formatDate`（#01）。

## Design

- **Interface delta**: `<StaffDetail staffId onOpenRecord />` 签名**不变**。内部：库存折叠 state；按天分组的记录；`FlatList` + type-discriminated 数据。
- **Internal architecture**:
  - **库存段**：`useState` 收起（默认 true）；标题行 `库存` + `Σ cost_amount`（`MoneyText`）+ chevron 图标；展开时渲染 balance 行（行内容不变）。
  - **记录头部**：`N = records.length`；`inTotal`/`outTotal` = 已加载的 `useStockRecords({ staff_id })` 结果按 `record.direction` 对 `item.line_amount` 求和（**无额外查询**——spec 阶段待定 (c) 建议现算）。
  - **按天分组**：建 map `day(YYYY/MM/DD via formatDate)` → `{ records[], dayIn, dayOut }`；天倒序；`dayIn/dayOut` = 当天记录 `line_amount` 按 direction 求和。
  - **FlatList**：data = type-discriminated 扁平数组 `{type:'dayHeader', date, dayIn, dayOut} | {type:'record', record, items}`；`onEndReached` 扩 `visibleDays` slice（批 = N 日）。分组+排序 `useMemo`，扩批不重算（React Compiler on）。
  - **记录行点击** → `onOpenRecord(record.id)`（既有路径不丢）。
  - **Deep-module note**: 按天分组是唯一结构新增；保持为**纯派生 shape**（memoized）、不存储。屏仍是只读消费方（ADR-0002）。
- **「出单」分布**：本 spec 改 `staff-detail.tsx` 的 `DIRECTION_LABEL.out` + 历史标签为「出单」。

## Rework on failure

隔离在 staff-detail + 其测试；只读、无数据风险。某天总额错 = memo 分组 bug，原地修。
