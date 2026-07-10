# 店铺管理 UI 页面优化重构（Page Refactor）

Type: prd
Status: ready-for-agent

## 问题陈述

首批店铺管理 UI（[UI PRD](../2026-07-09-shop-management-ui/01-shop-management-ui.md)，spec #05–#09）已 ship 并可工作，但实际使用中**信息密度、操作效率、可读性**三方面暴露了一批体验问题：

- **记账首页**：员工行库存信息拆成两行（种类/数量一行、金额一行），占位大、扫读慢；「出库」语义偏内部、运营者更习惯「出单」；录入商品要先搜索→点匹配→再手输数量，路径长、易输错；日期用 `toLocaleString()`，格式不统一、跨设备不一致；备注是无 label 的裸输入；时间控件看不出可点。
- **员工详情**：持仓明细默认全展开、行多时冗长；「持仓」一词偏金融、应改「库存」且缺总金额；记录是扁平时间线、无按天归组与分割线、记录多时一屏铺满；缺「共多少条 / 入库总额 / 出单总额」概览。
- **汇总页**：四段切换（总览 / 流水 / 按员工 / 按商品）信息割裂，运营者实际想要的是「某段时间内，店里进出多少、每天谁经手了多少」的一屏连贯视图；缺时间段筛选；流水不按天分组、无分割线、长列表无分批。

数据层与派生读模型（`Inventory` / `DailyFlow` / `staffSummaries` / `shopAggregate`）已完备，**本 PRD 不改数据层契约**，仅重构三屏 UI 的信息架构、交互与展示。管理页（spec #09）的优化**另算**，不在本 PRD 范围。

## 解决方案

对**记账首页 / 员工详情 / 汇总**三屏做 UX 重构，复用既有数据层与读 hook，统一三条全局展示规约：

1. **展示词**：`direction: out` 的 UI 文案由「出库」改「出单」（数据层 enum `out` **不变**；`in` 仍「入库」）。影响：`record-form` 与 `staff-detail` 的 `DIRECTION_LABEL.out`（两处确为 `{ in:'入库', out:'出库' }`）、`staff-row` 出库按钮文案。汇总屏整体重写，其旧代码用内联「入/出」简写、无 `DIRECTION_LABEL`，新版流水标签统一为「入库 / 出单」。
2. **日期格式**：纯日期统一 `YYYY/MM/DD`；`record-form` 的时间控件（datetime）用 `YYYY/MM/DD HH:mm`。天分隔线、流水行头用 `YYYY/MM/DD`。抽一个纯 `formatDate` / `formatDateTime` helper（Jest 可测），取代 `toLocaleString()`。
3. **长列表分批**：员工详情历史、汇总流水按**天**倒序、带天分隔线，`FlatList.onEndReached` 按「若干整日」分批 reveal（[ADR-0007](../../../docs/adr/0007-list-batched-rendering.md)）。数据仍单次全量取回，分批只发生在渲染层。

三屏各自的重构见下「实施决策」。

## 用户故事

记账首页
1. 作为操作者，我想每位员工行的库存信息压成一行 `库存：m件/n种 金额`，以便一屏扫更多人。
2. 作为操作者，我想按钮和标签写「出单」而不是「出库」，以贴合我的说法。
3. 作为操作者，我想记账时点一下商品就选中并 +1、再点再 +1，用数字步进器（−/+/直输）精确改数量，以便快速又准确地录多件。
4. 作为操作者，我想日期一律 `YYYY/MM/DD`，以便跨屏一致、好对账。
5. 作为操作者，我想记账首页默认只列**当前有库存**的员工（无库存者不占位），但用姓名/电话搜索时仍能找到无库存员工以便给他们做首笔入库。
6. 作为操作者，我想备注是 `备注：[单行输入]` 的 label 行，整齐不突兀。
7. 作为操作者，我想时间控件一眼看上去就可点（按钮化 + 图标），以便补录时间。

员工详情
8. 作为操作者，我想「持仓」改叫「库存」、旁边显示库存总金额，以便一眼知道这人手上压了多少钱的货。
9. 作为操作者，我想商品明细默认收起、点图标才展开，以便不被冗长明细打扰。
10. 作为操作者，我想记录栏头部显示「共 N 条 / 入库¥xx / 出单¥xx」，以便快速回看这人累计进出。
11. 作为操作者，我想记录按天倒序、带天分隔线（每天显示当日入库/出单），天下列出当日各条记录、点开仍可进记录详情编辑/作废，以便按天回看与核对。
12. 作为操作者，我想记录很多时按天分批加载，首屏快、滚动顺。

汇总
13. 作为操作者，我想汇总页先选时间段（快捷：本月/上月/本周/上周），以便聚焦我要对账的那段。
14. 作为操作者，我想看到一个库存卡（总金额 + 可点图标展开按商品的明细），以便掌握当前全店库存。
15. 作为操作者，我想看到所选时间段内的入库总额 / 出单总额，以便知道这段时间进出多少。
16. 作为操作者，我想流水按天倒序、带天分隔线，每天列出当日各员工的入库/出单，点某员工可展开看他那天的各条记录，以便按天按人对账。
17. 作为操作者，我想流水很多时按天分批加载。

通用
18. 作为操作者，我想上述改动后，既有能力（编辑/作废记录、欠货标识、金额正负色、金额两位小数）都还在。

## 实施决策

### 全局规约
- **「出单」文案**：集中改各处的 `DIRECTION_LABEL.out`（`record-form` / `staff-detail` / 汇总流水标签）与 `staff-row` 出库按钮文案为「出单」。数据层 `Direction = "in" | "out"`、`record-form-validation`、审计等**不动**。
- **日期格式 helper**：新增纯函数 `formatDate(ms) → 'YYYY/MM/DD'`、`formatDateTime(ms) → 'YYYY/MM/DD HH:mm'`（本地历日，与 `daily-flow.ts` 的 `dayBucket` 同口径——单操作员 app 按本地天）。放 `src/components/`（与 `record-form-validation` 同级，纯函数、node-Jest 可测）。替换 `record-form` 的 `toLocaleString()`、`staff-detail` / `summary` 的日期展示。
- **长列表分批**：`FlatList` + `onEndReached`，按**整日**分批（首屏 N 日，触底再加 N 日），保证天分隔线不被劈开（[ADR-0007](../../../docs/adr/0007-list-batched-rendering.md)）。

### 记账首页（`app/bookkeeping/index.tsx` + `components/staff-row.tsx` + `components/record-form.tsx`）

staff-row 合并行 + 出单按钮
- 第 2、3 行（`${variety}种 / ${total_qty}件` + `MoneyText(total_amount)`）合并为单行：`库存：{total_qty}件/{variety}种 {MoneyText(total_amount)}`（m=件数=`total_qty`，n=种类=`variety`）。
- 出库按钮文案「出库」→「出单」（`theme.danger` 配色不变）。
- 欠货 badge、行点击进员工详情、入库/出单按钮跳转预填表单，全部保留。

记账列表「有库存才显示」
- 默认列表只渲染**有非零库存**的员工（依据 `useStaffSummaries()`：`total_qty !== 0` 或 `variety > 0`）。
- **首笔入库路径不丢**：当搜索框有值时，`useStaff({ search })` 结果**不过滤**零库存员工，故新建员工（零库存）可通过搜索找到并入库。零库存行的合并行显示 `库存：0件/0种 ¥0.00`（`MoneyText` 统一格式）。
- 欠货（`has_negative`）者仍以 danger 底色 + badge 标识。

record-form 商品选择改 label / chip + 步进器
- 保留搜索框（`useProducts({ search })`），但搜索结果渲染为**可点 chip（label 形式）**；点某商品 chip：
  - 未选过 → 新增一行，qty = 1；
  - 已选过 → 该行 qty += 1（不重复建行）。
- 已选明细行用**数字步进器**替代裸 `TextInput`：`[−] [数字 input] [+]`，`−`/`+` 每次 ±1（不低于 1，到 1 再 `−` 视为删除该行或禁用 `−`——spec 定，建议到 1 禁用 `−`，删行走「删除」按钮）；input 仍可直输（`keyboardType="numeric"`），失焦校验正整数。
- 即时金额（每行 `price × qty` + 合计 `running-total`）、`validateRecordForm`（正整数、≥1 项、有员工）不变。EDIT 模式预填行仍携带稳定 item `id`（touched/untouched 合并契约不变）。
- 方向标题文案「出库」→「出单」。

record-form 备注改单行 label:input
- 备注由裸 `TextInput` 改为 `备注：[单行 TextInput]`（`label: input` 一行，`multiline={false}`），复用 管理 tab `StaffForm` 的 field/label 样式语汇。占位「单号 / 原因」保留。

record-form 时间控件可点化
- Android：仍是「点时间 → mount dialog picker → confirm/cancel unmount」契约（#06 Android bug，不可回退）；把触发器做成**按钮化 Pressable**（`inputBg` 底 + `border` + 文本用 `formatDateTime(timestamp)` + 一个时钟/日历 chevron 图标），`testID="record-time"` 保留。
- iOS：inline picker 保留；触发器外观与 Android 对齐（按钮化 + 格式化文本）。

### 员工详情（`components/staff-detail.tsx`）

持仓 → 库存（可折叠 + 总金额 + 默认收起）
- 段标题「持仓」→「库存」；右侧显示**库存总金额** = `Σ holdings.cost_amount`（`MoneyText`），即 `useStaffInventory(staffId)` 各行 `cost_amount` 之和（现价重估口径，与 [ADR-0002](../../../docs/adr/0002-derived-inventory-never-stored.md) 一致）。
- 段标题旁加**展开/收起图标**（chevron / eye），`useState` 控制展开，**默认收起**；展开后渲染各商品行（`title` / `qty件` / `cost MoneyText`），行内容不变。

记录栏头部概览 + 按天分组 + 分批
- 段标题「记录」区头部显示：`共 {N} 条`（= 该员工未作废记录数）+ `入库¥{inTotal}` + `出单¥{outTotal}`。`inTotal`/`outTotal` = 该员工各记录 `Σ line_amount` 按 direction 拆分（可由 `useStockRecords({ staff_id })` 已取回的记录现算，或复用 staff-scoped `useDailyFlow({ staff_id })` 求和——spec 定，**建议直接从已加载记录现算**，避免多一次查询）。
- 记录按**本地天**倒序分组（`formatDate(record.timestamp)` 作 key，与 `daily-flow.dayBucket` 同口径）；每天一个分隔线行头：
  ```
  2026/07/10   入库¥xxxx   出单¥xxxx   --------
  ```
  当日入库/出单 = 该天记录 `line_amount` 按 direction 求和。
- 天分隔线下列出当日各条记录行（时间 `HH:mm` + `items × qty` + 金额），**行仍可点** → `onOpenRecord(record.id)` → 记录详情（编辑/作废），不丢既有路径。
- 分批：`FlatList` 以「日」为分批单位，`onEndReached` reveal 下一组日（[ADR-0007](../../../docs/adr/0007-list-batched-rendering.md)）。

### 汇总页（`components/summary-tab.tsx` + `app/summary/index.tsx`）—— 整体重写

**抛弃四段切换**（overview/dailyFlow/byStaff/byProduct 删除），改为单一竖向视图：时间段选择 → 库存卡 → 流水段。`SummaryTabProps.onOpenStaff` 保留（流水某员工展开的详情里点记录仍可跳员工详情/记录详情）。

时间段选择
- 顶部快捷选择：**本月 / 上月 / 本周 / 上周**（默认「本月」）。选中态高亮（`backgroundSelected`）。
- 计算 `date_range = { from, to }`（本地历日 epoch ms）：本月 = `[startOfMonth(now), endOfMonth(now)]`，上周/本周按本地周一或周日起算（spec 定起日约定，建议**周一**为周首）。抽纯 helper `rangeFor(preset) → {from, to}`（Jest 可测）。
- 选定 range 驱动流水段的 `useDailyFlow({ date_range })` / `useStockRecords({ date_range })`。
- **自定义区间本期不做**（范围外）。

库存卡（as-of-now，不受时间段影响）
- 卡片显示「库存 总金额」= `Σ shopAggregate().total_cost`（现价 × 当前余额，跨员工合计；`useShopAggregate()`），右侧**详情图标**点开按商品展开（各商品 `title` / `total_qty件` / `total_cost`，复用现 `OverviewView` 的行结构）。
- **口径**：库存金额是 as-of-now 现价快照，**不**随时间段变（库存是「现在」的存量）；与下方流水段的「时间段内历史金额」语义不同，UI 上需让用户感知二者口径不同（如卡片标题注「当前」）。

流水段（时间段内，按天×员工）
- 段头：所选时间段 `入库¥{inTotal}` + `出单¥{outTotal}`（= `useDailyFlow({ date_range })` 各行 `in_amount`/`out_amount` 求和）。
- 按**天**倒序分组（`DailyFlowRow.date`，已是 `YYYY-MM-DD` 倒序；展示转 `YYYY/MM/DD`）；每天分隔线行头：
  ```
  2026/07/10   入库¥xxxx   出单¥xxxx   --------
  ```
- 天下列出当日各员工行：`员工A   入库¥xx   出单¥xx`（`useDailyFlow({date_range})` 按 day→staff 分组；员工名走 `useStaff()` join）。
- **点某员工行展开**「详情」：展开显示该员工当天的各条记录（时间 `HH:mm` + `items × qty` + 金额 + 方向色），每条可点 → 记录详情（编辑/作废）。展开所需记录来自 `useStockRecords({ date_range })`（时间段内全量，client-side 按 staff+day 过滤），一次性取回、按需展开，避免 N+1。
- 分批：`FlatList` 以「日」分批，`onEndReached` reveal 下一组日（[ADR-0007](../../../docs/adr/0007-list-batched-rendering.md)）。
- 删除独立的 byStaff / byProduct 视图（其能力并入库存卡 + 流水展开）。

### 数据流（不改契约，仅换/加消费）
- 复用：`useStaff` / `useStaffSummaries` / `useStaffInventory` / `useShopAggregate` / `useStockRecords(filter)` / `useDailyFlow(filter)`，均已在 [reads.ts](../../../src/hooks/reads.ts)。`RecordFilter` / `DailyFlowFilter` 已支持 `staff_id` + `date_range{from?,to?}`，**无需扩展**。
- 写路径（`useCreateStockRecord` / `useUpdateStockRecord`）不变；商品步进器、备注、时间只是改了 record-form 的输入交互，提交 payload 结构不变。
- 派生读仍不存储、每次重算（[ADR-0002](../../../docs/adr/0002-derived-inventory-never-stored.md)）；React Query 精准 invalidate 不变。

## 测试决策

沿用 [ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md)：RNTL + 真实 `InMemoryAdapter`，从用户行为驱动，不 mock Repos。

- **纯函数 → Jest（node）**：新增 `formatDate` / `formatDateTime` / `rangeFor(preset)`（本月/上月/本周/上周边界 + 本地历日）单独单测；`validateRecordForm` 既有覆盖不变。
- **既有组件测试需更新**（行为变了）：`staff-row.test`（合并行 `库存：m件/n种 金额` + 出单按钮文案）；`record-form.test`（chip 点选 +1、步进器 ±1 与直输、备注 label 行、时间按钮化）；`staff-detail.test`（库存标题 + 总金额 + 默认收起/点图标展开、记录段头部 N条/入/出、按天分组与分隔线、记录行仍可点进详情）；`summary-tab.test`（**大幅重写**：四段切换 gone → 时间段选择 + 库存卡展开 + 按天×员工流水 + 员工行展开记录 + 分批）。
- **新增覆盖**：
  - 记账默认列表只列有库存员工；搜索能找到并给零库存员工入库（首笔入库路径）。
  - record-form：chip 重复点 = qty+1（不重复建行）；步进器到 1 禁用 `−`；即时金额与合计随步进器更新。
  - 员工详情：库存段默认收起（明细行不在 DOM），点图标展开后出现；记录按天分组、天分隔线文案与当日入库/出单、记录行点击触发 `onOpenRecord`。
  - 汇总：时间段切换驱动流水 range；库存卡金额不受时间段影响（口径区分）；员工行展开显示当天记录、记录可点进详情。
  - 分批：`onEndReached` 后 reveal 下一组日（天数多于首批时）。
- **边界（RNTL 不覆盖，同 ADR-0006）**：真实 SQL 执行留 device smoke；暗色模式 / 手感 / 图标视觉效果留手动。

## 范围外

- **管理页优化**（`优化.md` 里的管理页条目）——已在 `manage-tab.tsx` 另行处理，不在本 PRD。
- 自定义时间段（仅本月/上月/本周/上周 4 个快捷）。
- 数据层查询分页 `limit/offset`（[ADR-0007](../../../docs/adr/0007-list-batched-rendering.md)：数万记录量级再复访）。
- 审计日志查看屏、备份/导出/CSV、售价/POS（系统 PRD 已推迟/范围外）。
- 任何数据层契约或新派生读模型——本 PRD 仅消费既有读模型。

## 补充说明

- **关联**：[UI PRD](../2026-07-09-shop-management-ui/01-shop-management-ui.md)（首批 UI，spec #05–#09，已 ship）；[ADR-0005](../../../docs/adr/0005-ui-layer-architecture.md) UI 层架构；[ADR-0006](../../../docs/adr/0006-ui-component-testing-rntl.md) UI 组件测试；[ADR-0007](../../../docs/adr/0007-list-batched-rendering.md) 列表分批渲染（本次新增）；[CONTEXT.md](../../../CONTEXT.md) 领域术语（已补「页面优化重构」条目）。
- **Expo SDK 57**：改 `@expo/ui` DateTimePicker 外观时查 https://docs.expo.dev/versions/v57.0.0/ ；Android dialog 契约（mount/unmount）不可回退（见 `record-form.tsx` 注释与提交 b0b6cd9 / 7aea40b）。
- **React Compiler 已开启**：新增展开/收起等 `useState` 遵循 rules-of-react；`FlatList` 分批用受控 `slice` 渲染（首批 N 日），`onEndReached` 扩大切片。
- **图标**：项目已装 `@expo/vector-icons`（Ionicons），展开/收起 chevron、时间控件、详情图标直接 `import`（见 [PROJECT_KNOWLEDGE.md](../../../PROJECT_KNOWLEDGE.md)「@expo/vector-icons 需显式安装」）。
- **「出单」影响面**：仅展示文案；`record-form-validation.ts`、审计 `direction` 字段、数据层 enum 均不变，无波及。
- **spec 阶段待定（非阻塞）**：(a) 步进器到 1 时 `−` 禁用 vs 删行（建议禁用）；(b) 周首日 周一 vs 周日（建议周一）；(c) 员工详情日入库/出单「现算 vs 复用 dailyFlow」（建议现算）；(d) 库存卡 / 流水段口径区分的 UI 提示语；(e) 分批 `FlatList` 数据源用 type-discriminated 扁平数组（`{type:'dayHeader'} | {type:'record'|'staffRow'}`）以保天分隔线不被分批劈开；员工详情「按天分组 + 倒序」应 `useMemo`，避免每次扩批重算；`staff-detail` 由 `ScrollView` 改 `FlatList` 需同步更新既有滚动相关测试断言。spec 锁定。
- 涉及文件：`components/staff-row.tsx` / `record-form.tsx` / `staff-detail.tsx` / `summary-tab.tsx`、`app/bookkeeping/index.tsx`、`app/summary/index.tsx`、新增 `components/date-format.ts`（或并入既有 util）、各对应 `.test.tsx`。

## Comments

- 2026-07-10 — drafted via `/idea-to-prd`（`/grilling` + `/domain-modeling` 沉淀 [ADR-0007](../../../docs/adr/0007-list-batched-rendering.md) + [CONTEXT.md](../../../CONTEXT.md)「页面优化重构」条目，再 `/to-prd`）。5 个分歧点经用户确认全按建议：分批=UI 级渲染；商品选择=搜索过滤 chip + 步进器；记账#5=有库存才列、搜索可找零库存员工；汇总员工行展开=当天记录（可点进详情）；员工详情记录行仍可点进编辑/作废。
- 2026-07-10 — 对抗性评审 **PASS**（fresh-context general-purpose sub-agent，veracity first：10 条对现有代码的断言全部 ✅ 核验通过——`DIRECTION_LABEL` / `RecordFilter` / `DailyFlowFilter` / `StaffSummary` / `Balance` / `Aggregate` 字段与签名、`list()` timestamp-asc + 排除 voided、`dayBucket` 本地历日、EDIT 行稳定 id 等均属实）。据评审 fold 入两处 minor：①「出单」影响面修正——汇总旧代码无 `DIRECTION_LABEL`（用内联「入/出」），整屏重写时统一为「入库/出单」；②补 spec 阶段待办 (e)：分批 `FlatList` 用 type-discriminated 扁平数组 + 分组排序 `useMemo` + `ScrollView→FlatList` 同步测试。状态 `needs-info` → `ready-for-human`，待 Gate 0。
- 2026-07-10 — Gate 0 通过（用户 reviewed，PRD 文件 + ADR-0007 + CONTEXT 改动）。状态 `ready-for-human` → `ready-for-agent`，进入 /sdd-flow 执行；下一步 /to-spec 拆分 specs。
