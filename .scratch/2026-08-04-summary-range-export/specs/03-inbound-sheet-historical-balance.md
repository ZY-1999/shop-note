# 入库明细 Sheet（含历史结余）

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-range-export.md)
Blocked by: #02 (02-export-config-inventory-sheet.md)

## Goal

导出「入库明细」可与时段对账：文首历史结余 + 一单单据行 + 含结余的金额合计。

## Acceptance criteria

- [x] 勾选「入库明细」导出后 sheet 文首为历史结余行（备注含截至起日 00:00）；全 0 仍有一行
- [x] 时段内入库按单据一行，商品合并如 `可乐×2、水×1`；金额为单据快照合计
- [x] 表末金额合计 = 历史结余金额 + 时段内入库金额
- [x] 作废单不出现；`-1` 补货出现在本 sheet；历史结余数量含其对库存的贡献

## Scope

- **In**：`shopAggregateAsOf`（或等价）派生；「入库明细」sheet 接入既有 workbook/勾选；复用 Spec #02 商品合并串。
- **Out**：充值出库双 sheet；改 UI 库存卡；落库存快照表。

## Context

- PRD 入库明细列：时间、商品、金额、备注；历史结余现价派生 vs 入库行 `Σ line_amount`。
- ADR-0002：派生不存；今日 `shopAggregate` 无 as-of。
- 管理员 `-1` 为补货所有者（CONTEXT）。

## Design

- **Interface delta**
  - `Inventory.shopAggregateAsOf(beforeExclusiveMs): Promise<Aggregate[]>` — 只计入未作废且 `record.timestamp < beforeExclusiveMs` 的进出；成本口径同 `shopAggregate`（`purchase_price × qty`）。不落表（ADR-0002）。
  - `buildSummaryWorkbook` 扩展：当 `sheets.inbound` 时 append「入库明细」：
    1. 文首历史结余一行：`shopAggregateAsOf(range.from)` → 合并串 + 金额合计；备注 `截至 YYYY/MM/DD 00:00 的历史结余`；全 0 仍写一行金额 0。
    2. 时段内 `direction=in` 单据（含 `-1`）一行一条：时间、商品合并串、`Σ line_amount`、note。
    3. 表末合计行：金额 = 结余金额 + 入库金额。
  - 商品列调用 #02 的 `formatProductQtyList`。
  - **Deep-module note**：as-of 藏在 Inventory；build 只问「起点前结余是什么」，不自己扫 ledger 过滤规则。
- **Internal architecture**
  - DESIGN 取舍：选 **Inventory 方法** 而非 export 内联过滤——与 `shopAggregate` 共用聚合内核，UI 若将来要 as-of 也可复用；export 纯函数可接受已算好的 Aggregate[] 以免 build 依赖 Inventory 实例（测试用 InMemory 也可直接调 Inventory）。
  - 作废：依赖 `list()` 默认排除；asOf 路径同样只吃未作废。
- **Test seam**：`shopAggregateAsOf` data 测试（边界日、作废、现价）；workbook 入库 sheet Jest（结余行、单据行、合计、`-1`、作废缺席）。

## Rework on failure

失败隔离在 as-of 派生 + 入库 sheet；库存 sheet / 配置 / UI 工具行不动。

## Comments

> **Comment** — implemented 2026-08-04; Status → ready-for-human
> - [x] 历史结余文首 — `build-summary-workbook.test.ts::leads with historical balance…` + `still emits a zero historical-balance row…`
> - [x] 时段内入库一行 — 同上 + `summary-tab.test.tsx::exports 汇总-…`（含 `可乐×4、矿泉水×3`）
> - [x] 表末合计含结余 — `leads with historical balance…`（12+11+12=35）
> - [x] 作废/`-1`/as-of — `inventory.test.ts::counts only unvoided moves with timestamp < beforeExclusiveMs…`；inbound list 仅 `direction=in`（含 `-1`）
> - Test run: `npx jest src/data/inventory.test.ts src/export/build-summary-workbook.test.ts src/components/summary-tab.test.tsx --forceExit` → 35 passed, 0 failed
> - Commit: `0b0d514`
