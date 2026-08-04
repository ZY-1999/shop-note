# 白底铺满 + 天级时间段工具行

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-range-export.md)
Blocked by: None — can start immediately

## Goal

汇总页一进就能改任意起止日并对账流水；短内容不露灰底（会员详情同修白底）。

## Acceptance criteria

- [x] 汇总 / 会员详情短内容时根列表区域为白底铺满，不露灰
- [x] 工具行在汇总页最上方；默认区间为近 10 天（含今天）
- [x] 点选起/止日（仅日）后流水只含该时段未作废会员充值/出库；库存卡数字不随区间变
- [x] 快捷下拉一切换五预设之一，流水窗随之变
- [x] 起 > 止写入后自动对调；手改后与任一预设不完全相等时下拉无高亮项

## Scope

- **In**：汇总 + 会员详情白底铺满；`rangeFor`/`RangePreset` 增 `last10Days`；汇总工具行（起止日 + 快捷下拉）；流水 `date_range` 联动；既有日折叠/分批不变。
- **Out**：导出按钮行为、配置 Modal、任何 xlsx；其它 tab 白底；库存卡改跟时间段。

## Context

- PRD：`.scratch/2026-08-04-summary-range-export/01-summary-range-export.md`
- 汇总今日：四段芯片默认 `thisMonth`；库存卡 as-of-now；流水 `useDailyFlow`/`useStockRecords`/`useTopups` 吃 `date_range`（见 summary-tab、page-refactor）。
- 会员详情：`staff-detail` FlatList 同「仅 contentContainerStyle 上色」模式。
- 日期：`date-format.ts` 的 `rangeFor`；记账/充值用 `@expo/ui` DateTimePicker（本 spec `mode="date"`）。
- CONTEXT：综合流水、作废、库存卡现价 vs 流水快照；ADR-0002 / ADR-0007。

## Design

- **Interface delta**
  - `RangePreset` 增 `"last10Days"`；`rangeFor("last10Days", now)` → 含今天共 10 本地自然日。
  - 新增纯函数（与 `rangeFor` 同模块）：给定 `{from,to}` + `now`，若精确等于某预设窗口则返回该 `RangePreset`，否则 `null`（供下拉高亮 / 自定义态）。
  - 汇总工具行状态：以 `{from,to}` 为源；快捷下拉写入预设并刷新区间；手选日起/止时先归一化为当日 00:00 / 23:59:59.999，若起>止则对调，再重算高亮。
  - `SummaryTab` / `StaffDetail` 根 `FlatList`：容器级 `flex:1` + `theme.background`（与 `contentContainerStyle` 同色），短内容不露灰。
  - **Deep-module note**：区间匹配与 `last10Days` 藏在 date helper 后，UI 只吃 `{from,to}` + 可选高亮预设，不散落日历算术。
- **Internal architecture**
  - 去掉四段芯片；`ListHeaderComponent` 首块为工具行（起日、止日、快捷下拉）。导出控件本 spec 可缺席或禁用占位（#02 接真）。
  - 日期点选：`@expo/ui/community/datetime-picker`，`mode="date"`；`now` prop 仍注入（测默认近 10 天）。
  - 流水 hooks 的 `date_range` 绑当前 `{from,to}`；库存卡仍 `useShopAggregate()`。
  - 会员详情仅白底，无时间段 UI。
- **Test seam**：`date-format` 纯函数 Jest；RNTL `summary-tab`（**工具行在 ListHeader 首块**、默认区间、预设切换、对调、自定义无高亮、库存卡不随区间变）+ `staff-detail` 白底可观察样式/结构。

## Rework on failure

失败隔离在日期 helper + 两页列表样式与汇总工具行；不影响导出管道。重做本 spec 即可。

## Comments

> **Comment** — implemented 2026-08-04; Status → ready-for-human
> - [x] 白底铺满 — `summary-tab.test.tsx::puts range-toolbar above inventory…` + `staff-detail.test.tsx::fills the list with theme white background…`
> - [x] 工具行置顶 + 默认近10天 — `summary-tab.test.tsx::puts range-toolbar above inventory and defaults to last 10 days`
> - [x] 点选起止 / 库存卡不随区间 — `summary-tab.test.tsx::shows the as-of-now inventory total…` + day-pick swap suite
> - [x] 快捷下拉切换 — `summary-tab.test.tsx::defaults to 近10天… switching the preset refilters`
> - [x] 起>止对调 + 自定义 — `summary-tab.test.tsx::swaps when from > to and shows 自定义…`；`date-format.test.ts` `last10Days` / `matchRangePreset` / `normalizeDayRange`
> - Test run: `npx jest src/components/date-format.test.ts src/components/summary-tab.test.tsx src/components/staff-detail.test.tsx --forceExit` → 46 passed, 0 failed
> - Commit: `fd31fba`
