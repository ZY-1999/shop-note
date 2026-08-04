# 汇总库存卡 + 导出：已删商品标红/后缀/零库存隐藏

Type: spec
Status: ready-for-agent
Parent: #01 (01-voided-product-inventory.md)
Blocked by: #01 (01-invalidate-inventory-on-product-void.md)

## Goal

汇总库存卡与导出「库存」sheet：有净库存的已删商品标红/「（已删除）」；已删且 qty=0 不展示。

## Acceptance criteria

- [ ] voided 且 `total_qty !== 0`：库存卡可见，商品名为 `theme.danger`；件数与金额与作废前相同（口径不变）
- [ ] voided 且 `total_qty === 0`：库存卡不渲染该行；有效商品净 0 行保持既有展示
- [ ] 有效商品库存名仍为 `theme.text`（不标红）
- [ ] 导出「库存」：voided 且 qty≠0 → 商品列「原名（已删除）」；件数/金额列与输入 Aggregate 一致；合计无后缀
- [ ] 导出「库存」：`total_qty === 0` 行不出现（含 voided；既有过滤可保留）
- [ ] 依赖 #01：管理页 void/restore 后已打开汇总的红名/显隐同步

## Scope

- **In**：summary-tab 库存卡过滤与颜色；`buildSummaryWorkbook` 库存 sheet 商品列后缀；相关测试。
- **Out**：mutations invalidate（#01）；入库/充值出库 sheet 快照名；管理页列表样式。

## Context

- 依赖 #01 invalidate。
- 库存卡今日渲染全部 `aggregateRows`；导出已滤 `total_qty !== 0`。
- 类比：summary-export-polish 已删会员红名/后缀。

## Design

- **Interface delta**
  - 汇总库存卡：渲染前过滤掉 `product.voided_at != null && total_qty === 0`；其余 voided 行 `Text` 色为 `theme.danger`。
  - `buildSummaryWorkbook` 库存 sheet：对留下的行若 `r.product.voided_at` → `` `${title}（已删除）` ``。
  - **Deep-module note**：UI 过滤与导出后缀各自本地；不必新 directory 类型（Aggregate 已带 Product）。
- **Internal architecture**
  - 库存卡合计金额：若今日对全部行求和，voided∩qty0 成本通常为 0，过滤与否对合计影响可忽略；不改合计公式语义。
  - 跨视图 AC：挂 SummaryTab → 管理 void 有库存商品 → 红名；void 至 qty0（或仅 void 已是 0）→ 行消失；restore → 恢复。
- **Test seam**：`summary-tab.test.tsx` + `build-summary-workbook.test.ts`（扩展 agg helper 支持 voided_at）。

## Rework on failure

失败隔离在 summary-tab 库存渲染 + workbook 库存列；可单独重做。
