# 充值出库 + 充值出库明细 双 Sheet

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-range-export.md)
Blocked by: #02 (02-export-config-inventory-sheet.md)

## Goal

一次导出补齐对账用的会员充值/出库汇总与时序明细，自用分列且与页面流水同窗口径。

## Acceptance criteria

- [x] 「充值出库」按会员×日一行，三列金额与出库商品串正确；表末三列合计正确
- [x] 「充值出库明细」混排倒序，三列金额与备注/商品列正确；表末合计正确
- [x] 同窗样本：导出「出库 + 自用」= 页面该时段出库合计；作废与 `-1` 均不出现在这两 sheet
- [x] 仅勾选其中一/两个 sheet 时文件只含对应 sheet
- [x] 出库商品串格式与 Spec #02 helper / 入库明细一致（同一函数）

## Scope

- **In**：「充值出库」「充值出库明细」两 sheet；复用 Spec #02 合并串与 workbook 勾选发射。
- **Out**：入库明细 / 历史结余；改页面 FlowSummary 口径；管道重写。

## Context

- PRD：导出自用分列；核页「出库+自用」= 页面出库；不含 `-1`。
- 既有 `useDailyFlow` / records / topups / `self_use`；manage-export 管道。
- 可与 Spec #03 并行。

## Design

- **Interface delta**
  - `buildSummaryWorkbook` 扩展：
    - `sheets.topupCheckout` →「充值出库」：按本地日 × 会员聚合；列：日期、会员、充值、出库、自用、出库商品；表末三列金额合计。
    - `sheets.topupCheckoutDetail` →「充值出库明细」：充值 + 出库（含自用）事件混排、时间倒序；列：时间、会员、充值、出库、自用、备注/商品；表末三列合计。
  - 口径：`self_use===true` 的出库金额进「自用」列，不进「出库」；商品串仍含自用单商品（`formatProductQtyList`）。排除 void；排除 `ADMIN_STAFF_ID`。
  - 金额元两位（`formatCentsAsYuan`）。
  - **Deep-module note**：双 sheet 的分列/聚合规则收在 build（或紧邻纯函数），UI 只传 range 内 records+topups+staff 名。
- **Internal architecture**
  - 与 #03 并行：只改 workbook 发射分支与纯聚合 helper；不改 config 位定义（#02 已留 bit）。
  - 聚合键：本地 `YYYY/MM/DD` + `staff_id`；会员名来自 staff 表（缺则 id）。
- **Test seam**：纯 build Jest（分列、合计、商品串、作废/`-1` 缺席、单 sheet 勾选）；无需新 RNTL（#02 已覆盖导出按钮）。

## Rework on failure

失败隔离在两 sheet 的 build；入库 sheet / 配置 / 管道不动。可与 #03 独立重做。

## Comments

> **Comment** — implemented 2026-08-04; Status → ready-for-human
> - [x] 会员×日聚合 — `build-summary-workbook.test.ts::aggregates 充值出库 by member×day…`
> - [x] 明细混排倒序 — `…emits 充值出库明细 mixed newest-first…`
> - [x] 出库+自用 / 排除 `-1` — 同上两测（admin checkout dropped；6+4=10）
> - [x] 勾选子集 — `…emits only the checked of the two sheets`
> - [x] 商品串复用 `formatProductQtyList` — 聚合/明细断言含 `可乐×2、水×1、茶×1`
> - Test run: `npx jest src/export/build-summary-workbook.test.ts src/components/summary-tab.test.tsx --forceExit` → 29 passed, 0 failed
> - Commit: `ee38b92`
