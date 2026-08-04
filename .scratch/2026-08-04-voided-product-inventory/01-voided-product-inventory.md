# 库存：已删除商品标红 + 导出「（已删除）」

Type: prd
Status: ready-for-agent

## Problem Statement

操作员作废（删除）某商品后，只要净库存非 0，该行仍出现在汇总「库存」卡与导出「库存」sheet，但标题与有效商品无区分——无法一眼看出已删。会员流水侧已有「原名标红 + 导出加（已删除）」；库存商品应对齐同一套辨识。

另两点缺口：
1. 今日汇总库存卡**不过滤** `total_qty === 0`，已删且净库存为 0 的商品仍可能占一行——应不再展示。
2. `useVoidProduct` / `useRestoreProduct` 只失效 `qk.products`，不失效 `qk.inventory`，已打开汇总会吃作废前的 Product 缓存。

## Solution

- **已删且净库存 ≠ 0**：汇总库存卡商品名标红；导出「库存」sheet 商品列「原名（已删除）」。
- **已删且净库存 = 0**：汇总库存卡与导出「库存」sheet **均不展示**该行。
- 有效商品：展示与颜色保持现状（卡上仍可出现净 0 行，除非既有行为另有约定；本需求不强制隐藏有效商品的净 0 行）。
- 商品作废/恢复后 invalidate 库存聚合查询，红名/显隐实时更新。

## User Stories

1. As an 操作员, I want 已删除但仍有净库存的商品在汇总库存卡上名字为红色, so that 我对账时能立刻辨认。
2. As an 操作员, I want 有效商品库存名保持原色, so that 不误伤正常行。
3. As an 操作员, I want 导出「库存」sheet 对已删且有库存的商品写「原名（已删除）」, so that 表格与屏幕语义一致。
4. As an 操作员, I want 已删除且净库存为 0 的商品在库存卡与导出库存 sheet 中都不出现, so that 干净列表不残留无意义行。
5. As an 操作员, I want 删除商品不改变仍展示行的件数/金额口径, so that 只是展示标注与显隐变化。
6. As an 操作员, I want 在管理页删除/恢复商品后汇总库存卡上的红名与显隐同步, so that 不必杀进程重进。

## Implementation Decisions

- **已删除 = void**：`product.voided_at != null`；`shopAggregate` 仍可通过 `getById` 带回 voided 商品——**派生聚合可不改**；显隐在汇总 UI / 导出库存 sheet 过滤：`voided && total_qty === 0` → 跳过。导出今日已对**所有** `total_qty === 0` 过滤，已覆盖「已删且为 0」；UI 须新增「voided 且 qty=0 不渲染」（不必顺便改有效商品净 0 的既有展示，除非实现时顺手统一过滤所有 qty=0——**默认只藏 voided∩qty0**，与本条 Gate 0 措辞一致）。
- **UI**：库存卡展开行仅渲染应展示的行；voided 且 qty≠0 → 名用 `theme.danger`；非 voided → `theme.text`。
- **导出**：库存 sheet 商品列对 voided（且已被 qty≠0 留下的行）追加「（已删除）」；合计行不加后缀。
- **缓存失效（必做）**：`useVoidProduct` / `useRestoreProduct` 同时失效 `qk.inventory` 族。
- **范围边界**：汇总库存卡 + 导出「库存」sheet + invalidate。不改入库/充值出库 sheet 快照商品名；不统一管理页列表样式。

## Testing Decisions

- 只测外部行为。
- **summary-tab**：void 且 qty≠0 → 红名可见；void 且 qty=0 → 行不可见；有效商品非红；void/restore 后显隐/红名同步。
- **build-summary-workbook**：voided+qty≠0 带「（已删除）」；qty=0（含 voided）不出现在库存 sheet。
- Prior art：已删会员红名/后缀；`inventory.test.ts`；mutations invalidate。

## Out of Scope

- 强制隐藏**有效**商品的净 0 行（除非实现选择与导出对齐「一律 qty≠0」——须在 spec 里显式写明；PRD 默认不要求）。
- 改变 shopAggregate 金额派生公式。
- 入库明细 / 充值出库商品名后缀；管理页列表样式；ItemsSelector。

## Further Notes

- 用户口语「删除」= 领域「作废 / void」。
- 类比：`.scratch/2026-08-04-summary-export-polish/` 已删会员。
- Gate 0 补充：明确「已删除 & 库存为 0 → 不再展示」。

## Comments

- 2026-08-04 — drafted from /route → /to-prd（类比已删会员）。
- 2026-08-04 — 对抗评审：补入 void/restore 须 invalidate inventory；复审 PASS。
- 2026-08-04 — Gate 0 澄清：已删除且库存为 0 的商品库存卡+导出均不展示；有库存的已删商品仍展示并标红/后缀。
- 2026-08-04 — Gate 0 确认；Status → ready-for-agent；进入 /sdd-flow。
- 2026-08-04 — /to-spec：2 specs（候选 1）；覆盖评审补强件数/金额 AC 后 PASS；可行性 PASS；待 Gate A。
- 2026-08-04 — Gate A 确认并实现；双轴 review PASS（Standards 无硬违规 / Spec satisfied）。
