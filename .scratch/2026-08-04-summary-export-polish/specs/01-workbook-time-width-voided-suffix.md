# 汇总 workbook：时间列宽 + 已删会员后缀

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-export-polish.md)
Blocked by: None — can start immediately

## Goal

纯汇总 workbook builder 为「时间」列设足够列宽，并对已作废会员在会员列输出「原名（已删除）」。

## Acceptance criteria

- [ ] 「入库明细」「充值出库明细」表头为「时间」的列有 `!cols` 宽度，足以容纳 `YYYY/MM/DD HH:mm`（含余量）
- [ ] 「充值出库」的「日期」列不被本 spec 改宽
- [ ] 已作废会员在「充值出库」「充值出库明细」会员单元格为「原名（已删除）」
- [ ] 有效会员无后缀；合计行、空占位行不加「（已删除）」
- [ ] 金额与 sheet 结构口径不变

## Scope

- **In**：`buildSummaryWorkbook` 输入扩展（void 标记）、时间列 `!cols`、会员列后缀、纯函数测试。
- **Out**：summary-tab 读 staff / 红名 UI；导出配置下限；ItemsSelector 间距；formatDateTime 加秒；管理页导出。

## Context

- 父 PRD：`.scratch/2026-08-04-summary-export-polish/01-summary-export-polish.md`
- 既有 builder：`src/export/build-summary-workbook.ts` + 测试；领域 void = `voided_at`（CONTEXT.md）
- 荣耀/WPS 加固已落地（bookSST、EMPTY「—」）— 本 spec 不回退

## Design

- **Interface delta**
  - 将 `SummaryWorkbookInput.staffNames?: Record<string, string>` 替换为 `staffDirectory?: Record<string, { name: string; voided?: boolean }>`（调用方一次传名 + void；缺省/缺 id 仍回退 id）。
  - `memberName`（或等价内部）：`voided === true` → `` `${name}（已删除）` ``；否则原名；合计/占位行不走此路径。
  - 对含表头「时间」的 sheet（入库明细、充值出库明细）设置 `ws['!cols']`，时间列 `wch` ≥ 能完整显示 `YYYY/MM/DD HH:mm` 的约定值（建议 ≥ 18）；其它列可省略或不强制。
  - **Deep-module note**：后缀与列宽藏在 builder；调用方只传 directory，不拼后缀字符串。
- **Internal architecture**
  - 兼容迁移：仓库内唯一调用方是 summary-tab（#02 接线）；本 spec 先改 builder + 其单测，临时可在测试里直接传 `staffDirectory`；生产接线由 #02 完成。若本 spec 合入时 summary-tab 仍传旧 `staffNames`，须在同提交内做适配或一并改调用（推荐 #01 只改 builder API + 测试，#02 改调用——则 #01 合入前 summary-tab 类型会短暂不匹配，故 **#01 实现时同步把 summary-tab 的 `staffNames` 映射改为 `staffDirectory` 且 `voided: false` 占位**，#02 再打开 includeVoided + 真 void）。
  - 更干净：`#01` 仅 builder+测试；`#02` 独占 summary-tab。TypeScript 会在 #01 后红——允许短暂，或 #01 保留 `staffNames` 为 deprecated 别名并在内部转 directory。**选用**：保留可选 `staffNames` 作回退（仅 name、无 void），新路径优先 `staffDirectory`；#02 切到 directory。
- **Test seam**：`build-summary-workbook.test.ts` — 断言时间列 `!cols[0].wch`；voided 会员单元格文本；有效会员无后缀；日期 sheet 无强制时间列宽。

## Rework on failure

失败隔离在 builder 输入形状与 sheet 写入；回退 `staffDirectory` / `!cols`，不影响 ledger。

## Comments

- 2026-08-04 — 实现完成；`Status → ready-for-human`。证据：AC1 `build-summary-workbook.test.ts`「sets a time-column width that fits YYYY/MM/DD HH:mm」及「sets a time-column width on detail without widening the daily date column」；AC2 后者；AC3/AC4「suffixes voided members in member rows only」；AC5「aggregates 充值出库 by member×day with self_use split and product merge」及「emits 充值出库明细 mixed newest-first; out+self_use equals page out total」。`source "$HOME/.bashrc" && npx jest src/export/build-summary-workbook.test.ts --colors=false --forceExit`：1 suite / 12 tests PASS。实现提交：本条关闭提交。
