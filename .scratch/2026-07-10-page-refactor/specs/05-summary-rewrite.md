# 汇总 — 整体重写（时间段选择 + 库存卡 + 按天×员工流水 + 分批）

Type: spec
Status: ready-for-agent
Parent: #01
Blocked by: #1

## Goal

抛弃汇总的四段切换（overview/dailyFlow/byStaff/byProduct），整体重写为单一时间段作用域视图：顶部时间段快捷选择（本月/上月/本周/上周）→ 库存卡（当前总金额 + 可展开按商品明细）→ 流水段（时间段内入库/出单总额、按天倒序、每天列各员工入库/出单、员工行可展开看当天记录）。按天分批。

## Acceptance criteria

- [ ] 时间段选择器（本月/上月/本周/上周，默认本月），选中态高亮；切换驱动流水段的 `date_range` 并重新查询——证明时间段聚焦（故事 13）。
- [ ] 库存卡显示「库存总金额」= `Σ useShopAggregate().total_cost`（**as-of-now 现价快照，不受时间段影响**）+ 详情图标；点开按商品展开（title/total_qty/total_cost）；**切换时间段时卡金额不变**——证明库存概览 + 口径区分（故事 14）。
- [ ] 流水段头部显示所选时间段的入库总额 + 出单总额（`Σ useDailyFlow({ date_range })` 的 in/out）——证明区间总额（故事 15）。
- [ ] 流水按**天**倒序分组；每天分隔线 `YYYY/MM/DD  入库¥xx  出单¥xx  --------`；其下列各员工行 `员工A  入库¥xx  出单¥xx`——证明按天×员工流水（故事 16，复用 `dailyFlow` 本就是 day×staff 倒序）。
- [ ] 点某员工行**展开**显示该员工当天的各条记录（`HH:mm` + `items×qty` + 金额 + 方向色），每条可点 → 记录详情——证明详情下钻（故事 16，Q4 决议）。
- [ ] 天数多时按天分批（`onEndReached` reveal 下一组整日）——证明分批（故事 17，ADR-0007）。
- [ ] 他处编辑/作废/入库仍刷新打开的汇总（失效集不变）——证明无回归。

## Scope

- **In**: `components/summary-tab.tsx`（整体重写——弃四段，加时间段选择 + 库存卡 + 按天×员工流水 + 员工行展开 + 分批）；`app/summary/index.tsx`（**接线新增** `onOpenRecord` → 记录详情路由，`onOpenStaff` 保留）；`summary-tab.test.tsx`（大幅重写）；消费 `formatDate` + `formatTime` + `rangeFor`（#01）。
- **Out**: 读模型（`useShopAggregate` / `useDailyFlow({ date_range })` / `useStockRecords({ date_range })` / `useStaff`——消费不变，filter 已存在）；记录详情（#07）；独立的 byStaff/byProduct 视图（**删除**——能力并入库存卡 + 流水展开）。

## Context

- 现状：`summary-tab.tsx` 四段切换；`useDailyFlow(filter)` 已支持 `date_range`、返回 day×staff 倒序；`useStockRecords({ date_range })` 供员工行展开下钻；`useShopAggregate` 供 as-of-now 库存卡。
- 口径：库存卡 = as-of-now 现价快照（不变）；流水 = 历史快照 `line_amount`（ADR-0002）——二者语义不同，UI 须让用户感知。
- PRD 汇总 #1 / #2；ADR-0007；`formatDate` / `rangeFor`（#01）。

## Design

- **Interface delta**: `<SummaryTab onOpenStaff onOpenRecord />`——`onOpenStaff` 保留；**新增 `onOpenRecord?: (recordId) => void`**（员工行展开里的记录行点击 → 记录详情，#07 路由；AC5 要求）。删除 4 个 `ViewName` 段。消费 #01 的 `rangeFor` + `formatDate` + `formatTime`。
- **Internal architecture**:
  - **时间段选择**：`useState<RangePreset>('thisMonth')`；`range = rangeFor(preset)`；喂 `useDailyFlow({ date_range: range })` + `useStockRecords({ date_range: range })`。
  - **库存卡**：`useShopAggregate()`（**非 range 作用域**）→ 总额 + 可展开商品行（local state）。标题注「当前」标识 as-of-now 口径。
  - **流水段**：把 `useDailyFlow({ date_range })` 行按天分组（已倒序）→ 每天 `{ staffRows[] }`；头总额 = Σ in/out。展开某员工行 → 从已加载的 `useStockRecords({ date_range })` 按 staff+天 过滤 → 记录行（点 → 记录详情 / `onOpenStaff`）。
  - **双查询说明**：汇总同时取 `useDailyFlow`（总额 rollup，经单测的读模型，避免在组件重推 bucket 逻辑）+ `useStockRecords`（展开用记录）——两次查询均 range 作用域、本地数据，ADR-0007 理据下可接受。
  - **FlatList**：type-discriminated `{type:'dayHeader'} | {type:'staffRow', expandable}`；按天分批（`visibleDays` slice，`useMemo` 分组）。
  - **Deep-module note**: 汇总仍是派生读的**薄组合**（ADR-0002）；重写是信息架构，非新逻辑。唯一微妙处是口径区分（库存 as-of-now vs 流水历史）——在 UI 标签呈现，非数据层。

## Rework on failure

只读、无数据风险；视图陈旧 = 失效缺失（集不变）。重写隔离在 summary-tab + 其测试。
