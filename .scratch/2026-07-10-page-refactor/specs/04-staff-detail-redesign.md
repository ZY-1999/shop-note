# 员工详情 — 库存可折叠 + 总金额 + 按天记录 + 分批 + 出单

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest/RNTL, tsc clean; 库存可折叠+总额+共N条+按天分组+分批+出单 全覆盖；跨 spec #07 holding 可见性适配
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

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest` → 28 suites / 204 passed（含本 spec 5 个新测试 + 既有 #07 cross-view-refresh 适配）；`npx tsc --noEmit` → exit 0。

- **AC1（库存 改名 + 头部总金额 + 默认收起 + toggle 展开）** → `src/components/staff-detail.test.tsx` "defaults collapsed, shows the holdings total in the header, and expands on tap"（默认收起时 `holding-${productId}` 不在；头部 `holdings-total` = Σ cost_amount = `¥12.00`；点 `holdings-toggle` → 展开后 `holding-${productId}` 出现）+ "renames the section 库存 (not 持仓)"（`getByText("库存")` + `queryByText("持仓")` null）。GREEN。
- **AC2（共 N 条 + 入库 + 出单 总额）** → "summarizes the record count + direction totals from the loaded records"（`共 2 条` + `record-in-total`=`¥12.00` + `record-out-total`=`¥6.00`，从已加载 `useStockRecords` 按 direction 现算 line_amount）。GREEN。
- **AC3（按本地天倒序分组 + 天分隔线当日入库/出单 + HH:mm/items×qty/金额 行 + 点击→onOpenRecord）** → "groups records under per-day separators (newest day first), labels out as 出单, and opens a record on tap"（`day-2026/06/10` 排在 `day-2026/06/09` 前；`14:30` 时间；点 `history-${id}` → `onOpenRecord(id)`）。GREEN。
- **AC4（首批若干日 + reveal 下一组整日，分隔线不被劈开）** → "renders the first days, holds the rest back, and reveals them whole (batch = whole days)"（7 天数据首屏 `getAllByTestId(/^day-/))`=5 + `day-2026/06/02`(第 6 天)缺席 + `load-more-days` 在；点 `load-more-days` → 7 个 day 分隔线 + footer 消失）。GREEN。
- **AC5（出单文案；欠货标识无回归）** → "groups records ... labels out as 出单"（out 记录行 `出单`，`出库` null）+ `DIRECTION_LABEL.out='出单'`；欠货/作废路径由 `record-detail.test.tsx`（#07）全量跑过无回归。GREEN。

**改动范围**：`src/components/staff-detail.tsx`（整体重构——库存可折叠 + 头部总额、记录头部 `共 N 条 / 入库 / 出单`、FlatList 按天 section + 分批 + `加载更多` footer、`DIRECTION_LABEL.out='出单'`）+ `src/components/staff-detail.test.tsx`（重写，5 测试）+ `src/components/record-detail.test.tsx`（#07 cross-view-refresh：holding 改默认收起后，sanity 前先点 `holdings-toggle` 展开）。消费 #01 的 `formatDate`/`formatTime`。`<StaffDetail staffId onOpenRecord />` 签名不变；`useStaffInventory`/`useStockRecords` 读模型消费不变（ADR-0002）。

**力学要点 / 设计偏差**（记录给评审）：
1. **FlatList data = 按天 section（非交错 cell）**：每个 FlatList item 是一整天的 `DaySection`（分隔线 + 当日各记录行嵌在一起）。这样 `data.length` = 天数（小），`visibleDays` slice 直接控制渲染几个 day 分隔线，且**「分隔线不被劈开」从 slice 算术保证升级为结构保证**（一天 = 一个不可分 item）。原始交错 `[dayHeader, record, dayHeader, ...]` 会让 `data.length`=记录数，FlatList 的 cell 虚拟化（`initialNumToRender`=10）会遮住超出窗口的 day header，导致分批 reveal 在测试里不可观测——section 化同时修掉这个可测性盲点。
2. **`加载更多` footer 与 `onEndReached` 双触发**：spec 原文只提 `onEndReached`。RNTL v14 的 test-renderer 只暴露 host 元素，FlatList composite 的 `onEndReached` 不可经公开 query 触达（已验证：`UNSAFE_getByType` 已移除；`unstable_fiber` 取到的是 stale/alternate 闭包，setter 不 flush）。新增 `ListFooterComponent`「加载更多」（`visibleDays < totalDays` 时显示，调同一个 `setVisibleDays`）作为显式可点 affordance——更可发现、短列表 `onEndReached` 不触发时的兜底、且是测试稳定 seam。`onEndReached` 保留（spec 机制），footer 是补充。
3. **跨 spec 适配**：spec #04「库存默认收起」使 #07 `record-detail.test.tsx` 的 holding 可见性 sanity 失效——该测试 mount 了 `<StaffDetail>`，须先点 `holdings-toggle` 展开。这是 spec #04 行为变更的合理 blast radius，非 scope 蔓延。

Commit: see `feat(staff-detail): 库存可折叠 + 总额 + 按天 section + 分批 + 出单 (#04)` (this spec's Stage 2 commit).
