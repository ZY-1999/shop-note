# 汇总导出细节 + 补货商品行间距

Type: prd
Status: needs-triage

## Problem Statement

操作员在汇总导出/对账与补货录入时碰到几处细节缺口：
1. 导出配置可以把四项 sheet 全部关掉（导出按钮随后禁用），配置态本身不强制「至少一项」；
2. 导出 xlsx 的「时间」列没有列宽，手机端打开时常被截断，看不全完整日期时间；
3. 会员作废（业务称「删除」）后，其历史流水仍在汇总，但名字映射丢失——界面退成 staff id、导出也不标「已删除」，对账时难辨；
4. 补货页商品选择组件多行已选商品之间间距偏大，一屏能见行数偏少。

## Solution

1. 导出配置开关：关掉最后一项时拒绝（至少保留一项选中）；导出按钮在「至少一项」前提下仍可启用。
2. 汇总导出 workbook 中标题为「时间」的列设置足够列宽，使 `YYYY/MM/DD HH:mm` 完整可见。
3. 会员作废后：汇总 UI 仍用原名显示该会员的历史流水，名字标红；导出会员列显示「原名（已删除）」。
4. 商品选择组件已选商品多行间距适当缩小（补货页可感知更紧凑）。

## User Stories

1. As an 操作员, I want 导出配置不能全部关掉, so that 配置态始终对应可导出的合法选择。
2. As an 操作员, I want 关掉某一 sheet 时若仍剩其它项则照常保存, so that 我可以只导出需要的 sheet。
3. As an 操作员, I want 尝试关掉最后一项时被阻止（开关保持开）, so that 我不会进入「四项全关、无法导出」的死胡同。
4. As an 操作员, I want 用手机打开导出的 xlsx 时「时间」列能完整看到日期与时分, so that 我不用手动拉宽列。
5. As an 操作员, I want 「入库明细」与「充值出库明细」的时间列都足够宽, so that 两个含时间的 sheet 行为一致。
6. As an 操作员, I want 已删除会员的历史充值/出库仍出现在汇总时段流水里, so that 对账不丢记录。
7. As an 操作员, I want 已删除会员在汇总里显示原名且名字为红色, so that 我一眼区分有效会员与已删会员。
8. As an 操作员, I want 导出「充值出库」「充值出库明细」会员列对已删会员写「原名（已删除）」, so that 表格里也能辨认。
9. As an 操作员, I want 未删除会员导出与展示保持现有名字与颜色, so that 行为不回归。
10. As an 操作员, I want 会员删除不影响 ledger 上的 staff_id 与金额口径, so that 只是展示/导出标注变化。
11. As an 操作员, I want 补货时已选多行商品之间更紧凑, so that 一屏能看到更多行、少滚动。

## Implementation Decisions

- **配置下限**：在汇总导出配置的 toggle 路径拒绝「将导致零项选中」的变更；持久化层可不强制（UI 已挡），但 UI 测试以「关最后一项无效 / 仍至少一项」为准。导出按钮继续依赖「至少一项选中」。
- **时间列宽**：仅改汇总 workbook builder；对 sheet 内首列表头为「时间」的列设置 `!cols` 列宽（足以容纳 `YYYY/MM/DD HH:mm`，含余量）。不改「日期」列（充值出库汇总按日），不改管理页 staff/product 导出，不改 `formatDateTime` 格式本身（仍无秒，除非另开需求）。
- **已删除 = void**：沿用领域 `voided_at` 软删除；无物理删除。汇总读 staff 时需能拿到已 void 会员的 name + void 状态（例如 `list({ includeVoided: true })` 或按 id `getById`），勿再默认 list 漏掉 voided。
- **UI 标红**：汇总 staff 行会员名用红色样式（与管理页「灰色名 + 红标签」可不同——本需求明确「名字标红」）；有效会员保持现有主题色。等级徽章行为不变。
- **导出示名**：workbook 输入从纯 `staffNames: Record<string,string>` 扩展到可携带 void 标记（或导出前把后缀拼进显示名）；会员相关 sheet 的会员列对 voided 追加「（已删除）」；合计行、空占位行不加会员删除后缀。
- **不改 ledger**：不快照会员名到 stock_record/topup；继续用 staff 表现名 + void 状态解析。
- **商品行间距**：改共享商品选择组件（管理「补货」与记账出库共用）已选行之间的垂直间距（当前为行上 `marginTop`），适当缩小（例如 8→4 量级，以目测紧凑为准）。默认全局收紧（两处同密度）；若验收只要补货变、记账不变，再加 density 开关——默认不做分叉。

## Testing Decisions

- 只测外部行为（开关结果、单元格文本、可见样式/颜色断言、列宽存在且够宽、行间距样式值），不测私有实现细节。
- **汇总 UI**（`summary-tab` 既有 RNTL + 真实 data stack seam）：关最后一项仍保持至少一项；void 会员历史流水显示原名且名字为红；有效会员无「（已删除）」/非红。
- **workbook builder**（纯函数 seam，`build-summary-workbook`）：时间列 `!cols`；voided 会员名带「（已删除）」；有效会员不带后缀。
- **商品选择行间距**：对共享选择器样式断言行间距小于收紧前（或等于约定新值）；prior art：`summary-tab` toolbar compact gap 断言。
- Prior art：`summary-tab.test.tsx` 导出配置开关；`build-summary-workbook.test.ts` sheet 行断言；`staff.test.ts` 的 `includeVoided`。

## Out of Scope

- 改变导出 sheet 列口径或金额计算。
- 管理页「已删除」标签样式与汇总红名统一。
- 给流水快照冻结会员名。
- 荣耀/WPS 查看器兼容（已另记）。
- 时间格式加秒、或 UI 流水时间布局改动（除非验收时确认「时间列」指 UI 而非 xlsx）。
- 商品 chip 区、合计行、步进器内部 gap 的全面 redesign。

## Further Notes

- 「时间列」按当前代码优先解释为导出 xlsx 的「时间」列（入库明细 / 充值出库明细）；汇总 UI 流水已是 `HH:mm:ss` 且无 Excel 列宽概念。
- 用户口语「删除」= 领域「作废 / void」。
- 与未提交的导出加固（`bookSST`、空单元格「—」、文件名时分秒）正交，可同批或随后实现。
- 商品选择组件多行间距：触发场景是补货页；实现落在共享选择器，记账出库会一并变紧。

## Comments

- 2026-08-04 — drafted from /route → /to-prd；对抗评审 PASS；Gate 0 待人工确认。
- 2026-08-04 — Gate 0 补充：补货页商品选择多行 gap 适当缩小（共享 ItemsSelector 行间距）。
