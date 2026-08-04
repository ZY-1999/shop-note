# 汇总页时间段重构 + 多 Sheet 导出

Type: prd
Status: ready-for-human

## Problem Statement

操作员在汇总页做对账/备份时，时间段只能用「本月/上月/本周/上周」四段芯片，不能按任意起止日选，也不能一键「近 10 天」；汇总与会员详情在内容不够一屏时底部会露出灰色区域。导出管道已在管理页落地，但汇总没有导出入口，无法按当前时间段一次导出库存、入库、充值出库等对账用 Excel。

## Solution

1. **白底铺满**：汇总 tab 与会员详情根列表均铺满屏幕白底（`theme.background`），不再露出灰底；不改全局 theme、不铺其它 tab。
2. **工具行置顶**：第一行 = 起日 ～ 止日 + 快捷时间下拉 +「导出」+ 导出配置图标。
3. **天级时间段**：起止日可点选（日精度）；默认近 10 个自然日（含今天）；快捷下拉：近10天 / 本月 / 上月 / 本周 / 上周；手改日期后若不匹配预设则下拉取消高亮；起 > 止时自动对调。
4. **多 Sheet 导出**：一个 xlsx（`汇总-{起YYYYMMDD}-{止YYYYMMDD}.xlsx`），可配置包含哪些 sheet（默认全选 4 个，勾选持久化到 SQLite `config`）；走现有 `useExport` / `runExport` 管道。

## User Stories

1. 作为操作员，我想汇总页与会员详情页整屏白底，以便内容少/历史短时也不看到灰色空白。
2. 作为操作员，我想时间段工具行在页面最上方，以便一进页就能改区间和导出。
3. 作为操作员，我想默认看到近 10 天的流水，以便日常对账窗口合适。
4. 作为操作员，我想点起日/止日用日历选到「天」，以便任意自定义区间。
5. 作为操作员，我想起日大于止日时自动对调，以免选错导致空白结果。
6. 作为操作员，我想用下拉一键切换近10天/本月/上月/本周/上周，以便快速改窗。
7. 作为操作员，我想手改日期后快捷下拉不再误显示旧预设，以免以为还在预设窗内。
8. 作为操作员，我想切换时间段后库存卡仍显示「当前」全局库存，以便区分现价快照与时段流水。
9. 作为操作员，我想切换时间段后流水区（含日汇总与展开明细）只含该时段未作废的会员充值/出库，以便与「充值出库」「充值出库明细」同窗对账（入库明细另含 `-1` 补货；库存 sheet 仍为 as-of-now，与流水 UI 不同口径）。
10. 作为操作员，我想点「导出」得到一个多 sheet 的 Excel，以便带走对账数据。
11. 作为操作员，我想文件名带起止日，以便区分不同区间的导出文件。
12. 作为操作员，我想点配置图标勾选要导出的 sheet，默认四个全选，以便按需裁剪。
13. 作为操作员，我想勾选变更立刻记住（杀进程后仍在），以免每次重选。
14. 作为操作员，我想全不选时无法导出（按钮禁用或明确提示），以免空文件。
15. 作为操作员，我想「库存」sheet 反映当前库存（不跟时间段），含商品/件数/金额与合计行。
16. 作为操作员，我想「入库明细」以单据为一行、商品件数合并书写，以便阅读。
17. 作为操作员，我想入库明细最前有一行「历史结余」（截至起日 00:00 之前），备注写明截至时间，以便和汇总对得上。
18. 作为操作员，我想入库明细表末有金额合计（含历史结余），以便快速核数。
19. 作为操作员，我想「充值出库」按每个会员每天一行，含充值/出库/自用三列金额与出库商品串，表末三列合计。
20. 作为操作员，我想「充值出库明细」按时序混排充值与出库，金额分充值/出库/自用三列，表末合计。
21. 作为操作员，我不想导出里出现已作废单据，以便与页面流水一致。
22. 作为操作员，我想导出中不可重复点、失败有 toast、取消分享不算失败，行为与管理页导出一致。
23. 作为开发者，我想复用既有导出管道与 xlsx 库，只新增汇总 workbook `build`，以便不双轨。
24. 作为开发者，我想历史结余用派生读（as-of 起点前），不落库存快照表，以守 ADR-0002。

## Implementation Decisions

### UI 布局与白底

- 汇总根 `FlatList` 与会员详情根 `FlatList`（`staff-detail`）：`style`/`contentContainerStyle` 使用 `theme.background`（白），并保证列表区域 `flex: 1` 铺满，短内容不露灰。两页今日均只在 `contentContainerStyle` 上色、缺容器级铺满——同一修法。
- 汇总 `ListHeaderComponent` **第一块**为工具行；其下仍为库存卡 → 流水汇总 → 日列表（既有结构保留，仅时间控件形态与位置变）。会员详情除白底外无本 feature 的交互改动。

### 时间段

- 扩展现有 `rangeFor` / `RangePreset`：新增 `last10Days`（含今天共 10 个本地自然日：`from` = 今天往前 9 天的 00:00:00.000，`to` = 今天 23:59:59.999）；保留 `thisMonth` / `lastMonth` / `thisWeek` / `lastWeek`。
- 工具行：起日文案、止日文案、快捷 `Picker`/下拉（五选项）、「导出」按钮、配置图标（如 settings）。
- 日期控件：复用记账/充值表单已用的 `@expo/ui` `DateTimePicker`（community datetime-picker），显式 `mode="date"`（仅日）；`now` 仍可注入（既有测试 seam）。
- 起 > 止：写入时自动对调两个端点。
- 手选后与任一预设窗口不完全相等 → 快捷控件显示未选/自定义（无高亮项）。
- 流水/records/topups 的 `date_range` 一律吃当前起止；库存卡继续 `useShopAggregate()` as-of-now，**不**跟时间段（CONTEXT / 既有口径）。

### 导出管道

- 复用 `ExportJob` + `runExport` + `useExport` + `xlsx`；新建汇总多 sheet `build`（纯函数优先，便于 Jest）。
- MIME / encoding / 分享 / pending / `toast.error` / 取消分享非错误：与 manage-export 一致。
- 文件名：`汇总-{fromYYYYMMDD}-{toYYYYMMDD}.xlsx`（本地日历日）。

### Sheet 勾选持久化

- 存现有 SQLite `config` 表；**扩展** `ConfigRepository`（今日仅有单价 get/set）新增 `summary_export_sheets` 的 get/set + 审计；配套 reads/mutations/`qk.config` 条目。
- `config.value` 今日为 **integer**：用 **位掩码**（bit0 库存、bit1 入库明细、bit2 充值出库、bit3 充值出库明细）；缺省 key 缺失 = `0b1111`（全选）。不改表结构、不引 AsyncStorage。
- 配置 Modal：四开关，**即时 persist**；无单独保存键；0 项时禁用「导出」。

### 四个 Sheet 内容

| Sheet | 时间范围 | 行模型 | 列 | 合计 |
|---|---|---|---|---|
| 库存 | as-of-now（同库存卡） | 商品一行；qty=0 不写 | 商品、件数、金额（现价成本 = `purchase_price × qty`，元两位） | 表末件数+金额 |
| 入库明细 | 时段内 `direction=in` + 文首历史结余 | **一单一行**；商品列合并如 `可乐×2、水×1` | 时间、商品、金额、备注 | 表末金额（**含**历史结余） |
| 充值出库 | 时段内 | **每会员每天一行** | 日期、会员、充值、出库、自用、出库商品（`可乐×2、水×1`，含自用出库合并） | 表末充值/出库/自用三列 |
| 充值出库明细 | 时段内 | 充值+出库(+自用) **混排**，时间倒序 | 时间、会员、充值、出库、自用、备注/商品 | 表末三列金额 |

- **历史结余**（仅入库明细文首一行）：as-of **起日 00:00:00 之前**（`timestamp < range.from`）的全局库存派生；商品/件数合并写入商品列；金额 = 各商品结余成本之和（口径同 `shopAggregate`：当前 `purchase_price × qty`）；备注如 `截至 YYYY/MM/DD 00:00 的历史结余`；结余全 0 则仍写一行金额 0 并带备注，避免「缺行」难对账。
- **时段内入库行金额** = 该单据 `Σ items.line_amount`（过账冻结快照），**不是**现价重估；同 sheet 内仅文首历史结余用现价派生——对账时分清两段口径。
- 入库行备注：有 `note` 则填入，否则空。
- **作废**：四 sheet 一律排除 `voided_at` 非空（依赖既有 `list` 默认行为）。
- **自用（导出专用分列）**：CONTEXT/页面「出库金额」含自用 `line_amount`；导出「出库」「自用」分列——**核页时「出库 + 自用」= 页面出库合计**。出库商品串仍包含自用单的商品。
- **管理员 `-1`**：入库明细含其补货单；充值出库 / 明细 **不含** `-1` 行（与汇总流水一致）。库存 sheet / 历史结余含全局进出（含 `-1` 补货对库存的贡献）。
- 金额展示：元、两位小数（复用 `formatCentsAsYuan`）。

### 历史结余派生（新能力）

- 今日 `Inventory.shopAggregate()` 只扫全量未作废记录，**无 as-of**。
- 本 feature：在 `Inventory` 增加 as-of 派生（例如 `shopAggregateAsOf(beforeExclusiveMs)`：只计入 `timestamp < beforeExclusiveMs` 的未作废记录），或等价的纯函数从已 list 的 records 聚合。守 ADR-0002（不落库存快照表）。
- UI 库存卡继续用 as-of-now；as-of 仅服务导出历史结余。

### 商品合并串

- 统一纯函数：同商品数量相加后输出 `标题×qty`，顿号连接；供入库明细、充值出库、明细 sheet 复用。

## Testing Decisions

- **只测外部行为**：给定账本 + 区间 + 勾选 → workbook sheet 名/行列/文件名/UI 状态；不测 Modal 内部实现细节。
- **优先现有 seam**：`InMemoryAdapter` + 真实 repos；导出 IO mock 在 `runExport` 边界（manage-export 先例）；`now` 注入测默认近 10 天。
- **模块**：
  - `rangeFor` / 新 preset 纯函数（data 或既有 date-format 测试项目）
  - `shopAggregateAsOf`（或等价）data 测试：边界日、作废排除、现价成本
  - 汇总 workbook 纯 `build`：四 sheet 形状、历史结余、合计、自用分列、商品合并、勾选子集少 sheet
  - `ConfigRepository` 掩码 get/set 缺省全选
  - RNTL `summary-tab`：工具行在首、默认近 10 天、导出 pending、配置即时写入的可观察结果（可读回或再打开断言）
  - 会员详情白底：与汇总同模式的样式断言或目测级 RNTL（若已有 `staff-detail` 测试则顺带覆盖）
- **Prior art**：`summary-tab.test.tsx`、`staff-detail` 相关测试、`date-format.test.ts`、`build-staff-workbook.test.ts`、`manage-tab.test.tsx` 导出段、`inventory.test.ts`。

## Out of Scope

- 管理页会员/商品导出改动；导出管道重写。
- CSV / PDF；多文件拆分导出。
- 库存卡改为跟时间段的「期末库存」UI。
- 把历史结余做成可落库快照或迁移。
- 全局 theme；记账首页 / 管理 tab 等其它页白底改造（会员详情已纳入本 PRD）。
- 本周/上周以外的财周定义变更；时区非本地日历。
- Web 目标。

## Further Notes

- 依赖已落地的 manage-export（管道 + xlsx + `formatCentsAsYuan`）；本 PRD 假设其已在主干可用。
- 历史结余金额用**当前进价 × 历史数量**：与库存卡同口径；若时段内改过进价，金额侧与「当时进价」可能不完全一致，但数量对账仍成立。若 Gate 0 要求冻结历史进价，需另开决策（今日 ledger 无按日进价轨迹）。
- Grill（2026-08-04）：起止日+快捷下拉；默认近10天；工具行置顶；四 sheet 口径与列；配置 SQLite 即时保存；文件名带区间；排除作废；白底汇总 + 会员详情。

## Comments

- 2026-08-04 — grilled → drafted → adversarial review PASS（veracity + feasibility）→ published `ready-for-human`.
- 2026-08-04 — Gate 0 前修订：白底铺满范围扩大至会员详情（`staff-detail` FlatList），与汇总同修法。
- 2026-08-04 — Gate 0 PASS（user reviewed）→ `ready-for-agent`；进入 `/to-spec`。
- 2026-08-04 — `/to-spec`：candidate-2 竖切（01→02→{03∥04}）；对抗覆盖+可行性 PASS；四份 spec `ready-for-human`（待 Gate A）。
- 2026-08-04 — Specs #01–#04 均已实现并关闭（`ready-for-human`）；PRD → `ready-for-human`（待人工验收 / Gate B）。
