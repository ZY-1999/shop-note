# 汇总 — 整体重写（时间段选择 + 库存卡 + 按天×员工流水 + 分批）

Type: spec
Status: ready-for-human # Stage 2 (/tdd) implemented 2026-07-10 — all ACs GREEN in jest/RNTL, tsc clean; 时间段+库存卡(as-of-now)+流水(day×staff展开)+分批+onOpenRecord 全覆盖；codemap project.md summary 描述同步
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

---

## Stage 2 evidence (implemented 2026-07-10)

`npx jest` → 28 suites / 202 passed（含本 spec 6 个测试，旧 #08 四段切换测试整体替换）；`npx tsc --noEmit` → exit 0。

- **AC1（时间段选择器 default 本月 + 选中态 + 切换驱动 date_range 重查）** → `src/components/summary-tab.test.tsx` "defaults to 本月 with the range's flow totals, and switching the preset refilters the flow"（默认 `range-thisMonth` → 7月记录在区间，flow 总额渲染；点 `range-lastMonth` → 区间变 6月 → `flow-in-total`/`flow-out-total` 归 `¥0.00` + 无 day 分隔线 = 重查生效）。选中态高亮为视觉细节，行为（默认 + 切换 refilter）已证。GREEN。
- **AC2（库存卡 as-of-now 总额 + 展开商品明细 + 切换时间段不变）** → "shows the as-of-now inventory total, expands per-product on tap, and ignores the range"（`inventory-total`=`Σ useShopAggregate().total_cost`=`¥24.00`；默认收起 `inventory-product-${id}` 不在；点 `inventory-toggle` → 展开 cola/water 行；切 `range-lastMonth` → `inventory-total` 仍 `¥24.00` = 与时间段无关）。GREEN。
- **AC3（流水头部显示所选时间段入库/出单总额）** → 由 AC1 同一测试覆盖（默认 本月：`flow-in-total`=`¥27.00`、`flow-out-total`=`¥3.00`，来自 `Σ useDailyFlow({date_range})` 的 in/out）。GREEN。
- **AC4（流水按本地天倒序分组 + 天分隔线 + 每天各员工行入库/出库）** → "groups flow under per-day separators (newest day first) with a per-staff row carrying in/out"（`day-2026/07/09` 排在 `day-2026/07/08` 前；`staff-row-2026-07-08-${id}` 在；`staff-in-2026-07-08-${id}`=`¥6.00`）。GREEN。
- **AC5（员工行展开 → 当天记录 HH:mm/items×qty/金额/方向色 + 点击 → onOpenRecord）** → "expanding a staff row lists that day's records and opens one on tap"（默认收起 `flow-record-${id}` 不在；点 `staff-row-...` → 展开后 `flow-record-${id}` + `10:00` + `可乐 ×2`；点 `flow-record-${id}` → `onOpenRecord(id)`）。GREEN。
- **AC6（按天分批，reveal 下一组整日，分隔线不劈开）** → "renders the first days, holds the rest back, and reveals them whole (batch = whole days)"（7 天首屏 `getAllByTestId(/^day-/))`=5 + `day-2026/07/02`(第6天)缺席 + `load-more-days` 在；点 → 7 个 day 分隔线 + footer 消失）。GREEN。
- **AC7（他处写入仍刷新汇总，失效集不变）** → "a post elsewhere refreshes the open 汇总 view without manual refetch"（`Poster` 他处 post cola×1 in → `inventory-total` `¥24.00`→`¥27.00` 实时重估，靠 `useCreateStockRecord` 的既有失效集）。GREEN。

**改动范围**：`src/components/summary-tab.tsx`（整体重写——弃四段切换，加 时间段选择 + 库存卡(as-of-now) + 流水(day×staff + 员工行展开 + 分批)）+ `src/components/summary-tab.test.tsx`（整体重写，6 测试）+ `src/app/summary/index.tsx`（接线 `onOpenRecord` → `/bookkeeping/record/[id]`）+ `docs/codemap/project.md`（summary feature 描述 + Updated 条目同步：四段切换 → 单一时间段视图）。消费 #01 的 `rangeFor`/`formatDate`/`formatTime`。`<SummaryTab onOpenStaff onOpenRecord? now?>`——`onOpenStaff` 保留，`onOpenRecord` 新增；读模型 `useShopAggregate`/`useDailyFlow({date_range})`/`useStockRecords({date_range})`/`useStaff` 消费签名全不变（filter 已存在）。

**力学要点 / 设计偏差**（记录给评审）：
1. **`now?` prop（#01 设计的 test seam）**：`rangeFor` 在 #01 就把 `now` 做成可注入「for deterministic tests」。组件 `now = Date.now()` 默认、透传给 `rangeFor`；测试注入 `now = 2026-07-10` + 固定 7月时间戳 → 时间段过滤确定性可测（AC1 切换 lastMonth → 归零）。非生产 test-hook，是 #01 既定 seam 的消费。
2. **双查询（rollup + drill-down）**：`useDailyFlow({date_range})` 喂天×员工 rollup（经单测的读模型，不在组件重推 bucket）；`useStockRecords({date_range})` 喂员工行展开下钻（按 staff + 本地天 filter）。两次查询均 range 作用域、本地数据（ADR-0007 理据下可接受，spec Design 已定）。
3. **day-section FlatList（同 #04）**：每个 item = 一整天（分隔线 + 各员工行嵌在一起），`visibleDays` slice 直接控制渲染几天，「分隔线不被劈开」结构保证。`onEndReached` + `加载更多` footer 双触发（#04 同款）。
4. **口径区分**（ADR-0002）：库存卡 = as-of-now 现价快照（`useShopAggregate`，不 range 作用域，标「当前」）；流水 = 历史冻结 `line_amount`（`useDailyFlow`）。UI 用「当前」标签 + range-无关总额让用户感知口径差。
5. **codemap 同步**：`docs/codemap/project.md` summary feature 行原述「overview+dailyFlow+byStaff+byProduct 四段」已 stale，本次重写改为「单时间段视图」并加 Updated 条目（/tdd step 4：spec 闭合前保持 codemap 与代码同步）。

Commit: see `feat(summary): 时间段 + 库存卡 + 按天×员工流水 + 分批重写 (#05)` (this spec's Stage 2 commit).
