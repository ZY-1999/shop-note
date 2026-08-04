# 导出配置 + 库存 Sheet 端到端导出

Type: spec
Status: ready-for-human
Parent: #01 (01-summary-range-export.md)
Blocked by: #01 (01-white-bg-and-range-toolbar.md)

## Goal

操作员可勾选 sheet、一点导出得到带区间文件名的 xlsx（至少含「库存」），行为对齐管理页导出管道。

## Acceptance criteria

- [x] 默认四 sheet 全选；改勾选杀进程后仍在；全不选时无法导出
- [x] 点导出得到 `汇总-{起YYYYMMDD}-{止YYYYMMDD}.xlsx`；导出中按钮不可再点；失败有 toast；取消分享不算失败
- [x] 「库存」sheet：现价成本（`purchase_price × qty`）、商品/件数/金额、表末合计；不跟时间段；**qty=0 不写行**（导出刻意紧于库存卡展开——卡上仍可能列出净 0 行；金额口径与卡一致）
- [x] 未勾选「库存」时文件中无「库存」sheet；本 spec 过渡期文件可以只有「库存」，不要求其它三 sheet 已存在
- [x] 商品合并串纯函数：同商品合并数量、顿号连接（单测即可）

## Scope

- **In**：工具行导出 + 配置 Modal；`ConfigRepository` 掩码 get/set + hooks；汇总 workbook 脚手架 +「库存」sheet；商品合并串 helper；接线 `useExport`。
- **Out**：入库明细 / 充值出库 / 充值出库明细 sheet 内容（bit 可忽略）；管道重写；管理页导出改动。

## Context

- 依赖 Spec #01 工具行起止与布局。
- manage-export：`ExportJob` / `runExport` / `useExport` / `xlsx` / `formatCentsAsYuan` 已落地。
- `ConfigRepository` 今日仅单价；`config.value` 为 integer → 位掩码。
- `Inventory.shopAggregate` as-of-now；ADR-0002。

## Design

- **Interface delta**
  - `ConfigRepository`：`getSummaryExportSheets(): Promise<SummaryExportSheets>` / `setSummaryExportSheets(sheets)`；缺省 key 缺失 → 四项皆 true。内部位掩码：bit0 库存、bit1 入库明细、bit2 充值出库、bit3 充值出库明细；审计同单价路径。
  - `SummaryExportSheets = { inventory, inbound, topupCheckout, topupCheckoutDetail: boolean }`
  - hooks：`useSummaryExportSheets` + mutation（invalidate `qk.config` 新 factory）；Modal 开关即时 mutate。
  - 纯函数 `formatProductQtyList(items: {title, qty}[]): string` — 同 title 合并 qty，输出 `标题×n` 顿号连接。
  - `buildSummaryWorkbook(input) → base64`：本 spec 仅当 `sheets.inventory` 时 append「库存」sheet（现价成本、qty≠0、表末合计）；其它 bit **不发射 sheet**（过渡期）。
  - `summaryExportFilename(from, to) → \`汇总-YYYYMMDD-YYYYMMDD.xlsx\``
  - 工具行：「导出」→ `useExport().mutate(ExportJob)`；`isPending` 禁用；失败 `toast.error`；0 勾选禁用导出。配置图标打开 Modal。
  - **Deep-module note**：掩码编解码与缺省藏在 ConfigRepository；workbook 对外只收领域行集 + sheets 标志，不暴露 bit 运算。
- **Internal architecture**
  - 汇总 UI 读当前 `{from,to}`（#01）写入 filename；库存行来自 `useShopAggregate` / 导出时再读 repos（与 manage 一致：build 闭包抓当前数据）。
  - Modal 本地乐观 UI 可跟 mutation；以 config 读回为准。
  - sheet 名中文：「库存」。
- **Test seam**：config 掩码 Jest（缺省全选、set 后 get）；`formatProductQtyList` + `buildSummaryWorkbook`（仅库存）Jest；RNTL：导出 pending/toast/禁用/文件名（mock `runExport` 边界）+ **配置开关即时 persist 的可观察结果**（改勾选后读回 config 或再打开 Modal 断言与写入一致）。

## Rework on failure

失败隔离在 config 扩展 + 库存 sheet build + 汇总导出接线。后续 #03/#04 只增 sheet，不改管道。

## Comments

> **Comment** — implemented 2026-08-04; Status → ready-for-human
> - [x] 默认全选 / persist / 全不选禁用 — `config.test.ts::cold start…` + `persists across a fresh repository…` + `summary-tab.test.tsx::persists sheet toggles immediately…`
> - [x] 文件名 / pending / toast / cancel — `summary-tab.test.tsx::exports 汇总-…` + `disables 导出 while pending…`；`summaryExportFilename` in `build-summary-workbook.test.ts`
> - [x] 库存 sheet 现价成本 qty≠0 + 合计 — `build-summary-workbook.test.ts::emits 库存 with non-zero rows…` + RNTL export suite
> - [x] 未勾选无库存 sheet — `build-summary-workbook.test.ts::omits 库存 when inventory sheet is unchecked`
> - [x] 商品合并串 — `format-product-qty-list.test.ts::merges same title qtys…`
> - Test run: `npx jest src/data/config.test.ts src/export/format-product-qty-list.test.ts src/export/build-summary-workbook.test.ts src/components/summary-tab.test.tsx --forceExit` → 31 passed, 0 failed
> - Commit: `2477c8a`
